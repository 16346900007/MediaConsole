import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { NeedLogin } from '@lark-apaas/fullstack-nestjs-core';
import type { PublishTask, PublishTaskInput, SocialPlatform } from '@shared/api.interface';
import { PublishService } from './publish.service';
import {
  BilibiliMetaService,
  type BiliPartition,
} from './publish/bilibili-meta.service';
import {
  FillFormsService,
  type FillFormsResult,
} from './publish/fill/fill-forms.service';
import type { FillContentType } from './publish/fill/platform-map';
import { FilesService } from './files.service';

@Controller('api/social/publish')
export class PublishController {
  constructor(
    private readonly publishService: PublishService,
    private readonly bilibiliMeta: BilibiliMetaService,
    private readonly fillFormsService: FillFormsService,
    private readonly files: FilesService,
  ) {}

  /** B站投稿分区树（无头模式实时获取，12h 缓存） */
  @Get('bilibili-partitions')
  async bilibiliPartitions(): Promise<BiliPartition[]> {
    return this.bilibiliMeta.getPartitions();
  }

  @Get('tasks')
  async listTasks(
    @Query('status') status?: string,
    @Query('publishType') publishType?: string,
  ): Promise<PublishTask[]> {
    return this.publishService.listTasks({ status, publishType });
  }

  @Get('tasks/:id')
  async getTask(@Param('id') id: string): Promise<PublishTask> {
    return this.publishService.getTask(id);
  }

  @NeedLogin()
  @Post('tasks')
  async createTask(@Body() dto: PublishTaskInput): Promise<PublishTask> {
    return this.publishService.createTask(dto);
  }

  @NeedLogin()
  @Patch('tasks/:id')
  async updateTask(
    @Param('id') id: string,
    @Body() dto: PublishTaskInput,
  ): Promise<PublishTask> {
    return this.publishService.updateTask(id, dto);
  }

  @NeedLogin()
  @Delete('tasks/:id')
  async deleteTask(@Param('id') id: string): Promise<void> {
    return this.publishService.deleteTask(id);
  }

  /** 提交：保存草稿 / 立即发布 / 定时发布 */
  @NeedLogin()
  @Post('tasks/:id/submit')
  async submitTask(
    @Param('id') id: string,
    @Body() body: { asDraft?: boolean; scheduledAt?: string | null },
  ): Promise<PublishTask> {
    return this.publishService.submitTask(id, body);
  }

  /** 手动标记/撤销某平台发布状态（人工发布完成后确认，或误标后撤销） */
  @NeedLogin()
  @Post('tasks/:id/targets/mark')
  async markTargetStatus(
    @Param('id') id: string,
    @Body() body: { platform: SocialPlatform; accountId: string; status: 'success' | 'pending' },
  ): Promise<PublishTask> {
    return this.publishService.markTargetStatus(
      id,
      body.platform,
      body.accountId,
      body.status,
    );
  }

  /**
   * 自动填表（不自动发布）：打开指定平台发布页并填好表单，最后一步由人工点击发布。
   * body.platforms 缺省 = 该发布单全部目标平台。
   */
  @NeedLogin()
  @Post('tasks/:id/fill-forms')
  async fillForms(
    @Param('id') id: string,
    @Body() body: { platforms?: SocialPlatform[] },
  ): Promise<FillFormsResult> {
    const task = await this.publishService.getTask(id);
    if (task.status === 'published') throw new Error('已发布的发布单不可填表');
    if (task.status === 'publishing') throw new Error('发布中的发布单不可填表');
    if (task.publishType === 'article') {
      throw new Error('文章类型暂不支持自动填表（当前支持视频/图文）');
    }
    const targets = task.targets.filter(
      (t) => !body.platforms || body.platforms.includes(t.platform),
    );
    if (!targets.length) throw new Error('未选择填表平台');
    return this.fillFormsService.fillForms({
      taskId: id,
      publishType: task.publishType as FillContentType,
      title: task.title,
      body: task.body ?? '',
      topic: task.topic ?? '',
      coverFileKey: task.coverFileKey,
      mediaFileKeys: task.mediaFileKeys ?? [],
      scheduledAt: task.scheduledAt,
      targets: targets.map((t) => ({
        targetId: t.id,
        platform: t.platform,
        accountId: t.accountId,
        accountName: t.accountName ?? t.accountId,
      })),
      files: this.files,
    });
  }
}
