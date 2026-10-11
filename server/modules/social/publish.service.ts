import { Inject, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { and, asc, desc, eq, inArray, lte } from 'drizzle-orm';
import {
  socialAccounts,
  socialPublishTargets,
  socialPublishTasks,
} from '@server/database/schema';
import type {
  PublishTarget,
  PublishTargetStatus,
  PublishTask,
  PublishTaskInput,
  PublishTaskStatus,
} from '@shared/api.interface';
import { PLATFORM_MAP } from '@shared/platforms';
import { FilesService } from './files.service';
import { runPublish } from './publish/executors';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type TaskRow = typeof socialPublishTasks.$inferSelect;
type TargetRow = typeof socialPublishTargets.$inferSelect;

@Injectable()
export class PublishService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PublishService.name);
  /** 正在执行发布的发布单（防重复触发/并发风控） */
  private readonly running = new Set<string>();
  /** 调度轮询句柄 */
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
    private readonly files: FilesService,
  ) {}

  onModuleInit(): void {
    // 本地定时发布：每 30s 扫描到期的 scheduled 发布单，串行执行
    this.timer = setInterval(() => {
      void this.scanDue().catch((error) => {
        this.logger.error(`[publish-sched] 调度异常：${error instanceof Error ? error.message : String(error)}`);
      });
    }, 30_000);
    void this.scanDue();
    this.logger.log('发布调度器已启动（30s 轮询本地定时任务）');
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /* ------------------------------------------------------------------ */
  /* 查询                                                                */
  /* ------------------------------------------------------------------ */

  async listTasks(params?: { status?: string; publishType?: string }): Promise<PublishTask[]> {
    const conditions = [];
    if (params?.status) conditions.push(eq(socialPublishTasks.status, params.status));
    if (params?.publishType) conditions.push(eq(socialPublishTasks.publishType, params.publishType));
    const rows = await this.db
      .select()
      .from(socialPublishTasks)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(socialPublishTasks.createdAt));
    const tasks = await this.attachTargets(rows);
    return tasks;
  }

  async getTask(id: string): Promise<PublishTask> {
    if (!UUID_PATTERN.test(id)) throw new NotFoundException('发布单不存在');
    const rows = await this.db
      .select()
      .from(socialPublishTasks)
      .where(eq(socialPublishTasks.id, id));
    if (!rows.length) throw new NotFoundException('发布单不存在');
    const tasks = await this.attachTargets(rows);
    return tasks[0];
  }

  /* ------------------------------------------------------------------ */
  /* 写操作                                                              */
  /* ------------------------------------------------------------------ */

  /** 创建发布单（默认草稿；asDraft=false 且无 scheduledAt=立即发布） */
  async createTask(input: PublishTaskInput): Promise<PublishTask> {
    const id = (
      await this.db
        .insert(socialPublishTasks)
        .values({
          publishType: input.publishType,
          title: input.title ?? '',
          body: input.body ?? null,
          topic: input.topic ?? null,
          location: input.location ?? null,
          coverFileKey: input.coverFileKey ?? null,
          mediaFileKeys: (input.mediaFileKeys ?? []) as any,
          platformFields: (input.platformFields ?? {}) as any,
          visibility: input.visibility ?? 'public',
          status: this.resolveInitialStatus(input),
          scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
        })
        .returning({ id: socialPublishTasks.id })
    )[0]?.id;
    if (!id) throw new Error('发布单创建失败');
    await this.syncTargets(id, input.targets ?? []);
    const task = await this.getTask(id);
    this.logger.log(`发布单创建 ${id} type=${input.publishType} status=${task.status} targets=${task.targets.length}`);
    return task;
  }

  async updateTask(id: string, input: PublishTaskInput): Promise<PublishTask> {
    if (!UUID_PATTERN.test(id)) throw new NotFoundException('发布单不存在');
    const existing = await this.getTask(id);
    if (existing.status === 'published') throw new Error('已发布的发布单不可编辑');
    if (existing.status === 'publishing') throw new Error('发布中的发布单不可编辑');

    await this.db
      .update(socialPublishTasks)
      .set({
        publishType: input.publishType ?? existing.publishType,
        title: input.title ?? existing.title,
        body: input.body !== undefined ? input.body : existing.body,
        topic: input.topic !== undefined ? input.topic : existing.topic,
        location: input.location !== undefined ? input.location : existing.location,
        coverFileKey:
          input.coverFileKey !== undefined ? input.coverFileKey : existing.coverFileKey,
        mediaFileKeys: (input.mediaFileKeys ?? existing.mediaFileKeys) as any,
        platformFields: (input.platformFields ?? existing.platformFields) as any,
        visibility: input.visibility ?? existing.visibility,
        status: this.resolveInitialStatus(input, existing.status === 'draft' ? 'draft' : undefined),
        scheduledAt: input.scheduledAt !== undefined ? (input.scheduledAt ? new Date(input.scheduledAt) : null) : existing.scheduledAt,
      })
      .where(eq(socialPublishTasks.id, id));
    if (input.targets) await this.syncTargets(id, input.targets);
    return this.getTask(id);
  }

  async deleteTask(id: string): Promise<void> {
    if (!UUID_PATTERN.test(id)) throw new NotFoundException('发布单不存在');
    const task = await this.getTask(id);
    if (task.status === 'publishing') throw new Error('发布中的发布单不可删除');
    await this.db
      .delete(socialPublishTasks)
      .where(eq(socialPublishTasks.id, id));
    // 清理临时文件（草稿/定时未发布时删除文件；已发布时文件已清理，幂等无害）
    const keys = [...(task.mediaFileKeys ?? []), task.coverFileKey].filter(Boolean) as string[];
    await this.files.deleteMany(keys);
    this.logger.log(`发布单删除 ${id}，清理文件 ${keys.length} 个`);
  }

  /** 提交：保存草稿 / 立即发布 / 定时发布 */
  async submitTask(
    id: string,
    body: { asDraft?: boolean; scheduledAt?: string | null },
  ): Promise<PublishTask> {
    const task = await this.getTask(id);
    if (task.status === 'publishing') throw new Error('发布中，请勿重复提交');
    if (task.status === 'published') throw new Error('已发布，请勿重复提交');
    if (!task.targets.length) throw new Error('请至少选择一个发布账号');
    if (task.mediaFileKeys.length === 0 && task.publishType !== 'article') {
      throw new Error('请先上传发布主体文件');
    }

    if (body.asDraft) {
      await this.db
        .update(socialPublishTasks)
        .set({ status: 'draft', scheduledAt: null })
        .where(eq(socialPublishTasks.id, id));
      return this.getTask(id);
    }

    if (body.scheduledAt) {
      const at = new Date(body.scheduledAt);
      if (at.getTime() <= Date.now()) throw new Error('定时发布时间必须晚于当前时间');
      await this.db
        .update(socialPublishTasks)
        .set({ status: 'scheduled', scheduledAt: at })
        .where(eq(socialPublishTasks.id, id));
      this.logger.log(`发布单 ${id} 已排期 ${at.toISOString()}`);
      return this.getTask(id);
    }

    // 立即发布
    await this.publishTask(id);
    return this.getTask(id);
  }

  /* ------------------------------------------------------------------ */
  /* 发布执行                                                             */
  /* ------------------------------------------------------------------ */

  /** 调度扫描：scheduled 且到点 → 立即执行 */
  private async scanDue(): Promise<void> {
    try {
      const now = new Date();
      const due = await this.db
        .select({ id: socialPublishTasks.id })
        .from(socialPublishTasks)
        .where(
          and(
            eq(socialPublishTasks.status, 'scheduled'),
            lte(socialPublishTasks.scheduledAt, now),
          ),
        )
        .limit(5);
      for (const row of due) {
        if (this.running.has(row.id)) continue;
        this.running.add(row.id);
        // 状态预占（防并发重复执行）
        const claimed = await this.db
          .update(socialPublishTasks)
          .set({ status: 'publishing' })
          .where(and(eq(socialPublishTasks.id, row.id), eq(socialPublishTasks.status, 'scheduled')))
          .returning({ id: socialPublishTasks.id });
        if (claimed.length) {
          this.logger.log(`[publish-sched] 定时发布到点 ${row.id}`);
          void this.executeAndFinalize(row.id);
        } else {
          this.running.delete(row.id);
        }
      }
    } catch (error) {
      // 数据库瞬时不可达等异常不允许终止调度循环（防止进程崩溃）
      this.logger.error(`[publish-sched] 扫描失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /** 立即发布入口（submit 用） */
  private async publishTask(id: string): Promise<void> {
    if (this.running.has(id)) throw new Error('该发布单正在发布中');
    const claimed = await this.db
      .update(socialPublishTasks)
      .set({ status: 'publishing' })
      .where(
        and(
          eq(socialPublishTasks.id, id),
          inArray(socialPublishTasks.status, ['draft', 'scheduled']),
        ),
      )
      .returning({ id: socialPublishTasks.id });
    if (!claimed.length) throw new Error('发布单状态不允许发布');
    this.running.add(id);
    void this.executeAndFinalize(id);
  }

  /** 执行全部目标并收尾（串行，避免多浏览器并发触发风控） */
  private async executeAndFinalize(id: string): Promise<void> {
    try {
      const task = await this.getTask(id);
      const targets = task.targets.filter((t) => t.status !== 'success');
      for (const target of targets) {
        await this.updateTargetStatus(target.id, 'publishing', null, 0);
        try {
          const account = (
            await this.db
              .select()
              .from(socialAccounts)
              .where(eq(socialAccounts.id, target.accountId))
          )[0];
          let lastProgress = -1;
          const result = await runPublish(
            target.platform,
            {
              publishType: task.publishType,
              title: task.title,
              body: task.body ?? '',
              topic: task.topic ?? '',
              location: task.location ?? '',
              coverFileKey: task.coverFileKey,
              mediaFileKeys: task.mediaFileKeys,
              visibility: task.visibility,
              platformFields: (task.platformFields ?? {}) as Record<string, Record<string, unknown>>,
            },
            {
              id: account?.id ?? target.accountId,
              platformUid: account?.platformUid ?? null,
              accountName: account?.accountName ?? target.accountName ?? '',
            },
            this.files,
            (p) => {
              // 上传进度实时落库（供任务列表展示）；限频：每 5% 写一次
              const next = Math.max(0, Math.min(100, Math.round(p.percent)));
              if (next !== lastProgress) {
                lastProgress = next;
                void this.db
                  .update(socialPublishTargets)
                  .set({ progress: next })
                  .where(eq(socialPublishTargets.id, target.id))
                  .catch(() => {});
              }
            },
          );
          await this.db
            .update(socialPublishTargets)
            .set({
              status: 'success',
              error: null,
              platformPostId: result.platformPostId ?? null,
              postUrl: result.postUrl ?? null,
              publishedAt: new Date(),
            })
            .where(eq(socialPublishTargets.id, target.id));
          this.logger.log(
            `[publish] ${target.platform}/${target.accountName} 发布成功 ${result.platformPostId ?? ''}`,
          );
        } catch (e) {
          const msg = (e as Error).message || '发布失败';
          await this.updateTargetStatus(target.id, 'failed', msg);
          this.logger.warn(`[publish] ${target.platform}/${target.accountName} 发布失败: ${msg}`);
        }
      }

      // 收尾：判定任务状态 + 清理临时文件
      const finalTask = await this.getTask(id);
      const succeeded = finalTask.targets.filter((t) => t.status === 'success').length;
      const failed = finalTask.targets.filter((t) => t.status === 'failed').length;
      const total = finalTask.targets.length;
      let finalStatus: PublishTaskStatus;
      if (succeeded === total) finalStatus = 'published';
      else if (failed === total) finalStatus = 'failed';
      else finalStatus = 'partial_failed';
      await this.db
        .update(socialPublishTasks)
        .set({
          status: finalStatus,
          publishedAt: succeeded > 0 ? new Date() : null,
          error: failed > 0 ? `${failed} 个账号发布失败` : null,
          scheduledAt: null,
        })
        .where(eq(socialPublishTasks.id, id));

      // 发布成功后清理临时文件（失败保留便于重试）
      if (finalStatus === 'published') {
        const keys = [
          ...(finalTask.mediaFileKeys ?? []),
          finalTask.coverFileKey,
        ].filter(Boolean) as string[];
        await this.files.deleteMany(keys);
        this.logger.log(`[publish] ${id} 全部成功，清理临时文件 ${keys.length} 个`);
      }
      this.logger.log(`[publish] ${id} 收尾 status=${finalStatus} 成功${succeeded}/${total}`);
    } catch (e) {
      this.logger.error(`[publish] ${id} 执行异常: ${(e as Error).message}`);
      await this.db
        .update(socialPublishTasks)
        .set({ status: 'failed', error: (e as Error).message })
        .where(eq(socialPublishTasks.id, id));
    } finally {
      this.running.delete(id);
    }
  }

  private async updateTargetStatus(
    targetId: string,
    status: PublishTargetStatus,
    error: string | null,
    progress?: number,
  ): Promise<void> {
    await this.db
      .update(socialPublishTargets)
      .set({ status, error, ...(progress !== undefined ? { progress } : {}) })
      .where(eq(socialPublishTargets.id, targetId));
  }

  /* ------------------------------------------------------------------ */
  /* 内部工具                                                             */
  /* ------------------------------------------------------------------ */

  private resolveInitialStatus(
    input: PublishTaskInput,
    preserve?: string,
  ): PublishTaskStatus {
    if (preserve === 'draft' && input.asDraft !== false && !input.scheduledAt) return 'draft';
    if (input.asDraft) return 'draft';
    if (input.scheduledAt) return 'scheduled';
    return 'draft'; // 创建时默认草稿，提交动作走 submitTask
  }

  private async syncTargets(
    taskId: string,
    targets: { platform: string; accountId: string }[],
  ): Promise<void> {
    await this.db.delete(socialPublishTargets).where(eq(socialPublishTargets.taskId, taskId));
    if (targets.length) {
      await this.db.insert(socialPublishTargets).values(
        targets.map((t) => ({
          taskId,
          platform: t.platform,
          accountId: t.accountId,
          status: 'pending' as const,
        })),
      );
    }
  }

  /** 附加目标（含账号名） */
  private async attachTargets(rows: TaskRow[]): Promise<PublishTask[]> {
    if (!rows.length) return [];
    const ids = rows.map((r) => r.id);
    const [targets, accounts] = await Promise.all([
      this.db.select().from(socialPublishTargets).where(inArray(socialPublishTargets.taskId, ids)),
      this.db.select().from(socialAccounts),
    ]);
    const acctName = new Map(accounts.map((a) => [a.id, a.accountName]));
    const targetByTask = new Map<string, TargetRow[]>();
    for (const t of targets) {
      const arr = targetByTask.get(t.taskId) ?? [];
      arr.push(t);
      targetByTask.set(t.taskId, arr);
    }
    return rows.map((row): PublishTask => {
      const tgs = (targetByTask.get(row.id) ?? []).map(
        (t): PublishTarget => ({
          id: t.id,
          taskId: t.taskId,
          platform: t.platform as PublishTarget['platform'],
          accountId: t.accountId,
          accountName: acctName.get(t.accountId),
          status: t.status as PublishTargetStatus,
          error: t.error,
          progress: t.progress,
          platformPostId: t.platformPostId,
          postUrl: t.postUrl,
          publishedAt: t.publishedAt ? t.publishedAt.toISOString() : null,
        }),
      );
      const pf = (row.platformFields ?? {}) as Record<string, Record<string, unknown>>;
      return {
        id: row.id,
        publishType: row.publishType as PublishTask['publishType'],
        title: row.title,
        body: row.body ?? '',
        topic: row.topic ?? '',
        location: row.location ?? '',
        coverFileKey: row.coverFileKey,
        mediaFileKeys: (row.mediaFileKeys ?? []) as string[],
        platformFields: pf,
        visibility: row.visibility as 'public' | 'private',
        status: row.status as PublishTaskStatus,
        scheduledAt: row.scheduledAt ? row.scheduledAt.toISOString() : null,
        publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
        error: row.error,
        targets: tgs,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      };
    });
  }
}
