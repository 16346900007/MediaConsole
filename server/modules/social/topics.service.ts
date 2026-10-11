import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  type PostgresJsDatabase,
  DRIZZLE_DATABASE,
} from '@lark-apaas/fullstack-nestjs-core';
import { asc, eq, inArray, sql } from 'drizzle-orm';
import { socialTopicGroups, socialTopicTags } from '@server/database/schema';
import type { TopicGroup, TopicLibrary } from '@shared/api.interface';

type GroupRow = typeof socialTopicGroups.$inferSelect;
type TagRow = typeof socialTopicTags.$inferSelect;

@Injectable()
export class TopicsService {
  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
  ) {}

  /** 话题库全量：分组 + 组内标签 */
  async listLibrary(): Promise<TopicLibrary> {
    const groups: GroupRow[] = await this.db
      .select()
      .from(socialTopicGroups)
      .orderBy(asc(socialTopicGroups.createdAt), asc(socialTopicGroups.id));

    const tags: TagRow[] = await this.db
      .select()
      .from(socialTopicTags)
      .orderBy(asc(socialTopicTags.createdAt), asc(socialTopicTags.id));

    const tagMap = new Map<string, string[]>();
    for (const t of tags) {
      const list = tagMap.get(t.groupId) ?? [];
      list.push(t.name);
      tagMap.set(t.groupId, list);
    }

    const items: TopicGroup[] = groups.map((g): TopicGroup => ({
      id: g.id,
      name: g.name,
      tags: tagMap.get(g.id) ?? [],
    }));
    return { groups: items };
  }

  async createGroup(name: string): Promise<TopicGroup> {
    const trimmed = name.trim();
    if (!trimmed) throw new BadRequestException('分组名称不能为空');
    const rows: GroupRow[] = await this.db
      .insert(socialTopicGroups)
      .values({ name: trimmed })
      .onConflictDoNothing()
      .returning();
    if (rows.length === 0) {
      const existed = await this.db
        .select()
        .from(socialTopicGroups)
        .where(eq(socialTopicGroups.name, trimmed));
      if (existed[0]) throw new BadRequestException('分组已存在');
    }
    return { id: rows[0].id, name: trimmed, tags: [] };
  }

  async renameGroup(id: string, name: string): Promise<void> {
    const trimmed = name.trim();
    if (!trimmed) throw new BadRequestException('分组名称不能为空');
    const rows: GroupRow[] = await this.db
      .update(socialTopicGroups)
      .set({ name: trimmed, updatedAt: new Date() })
      .where(eq(socialTopicGroups.id, id))
      .returning();
    if (rows.length === 0) throw new NotFoundException('分组不存在');
  }

  async deleteGroup(id: string): Promise<void> {
    const rows: { id: string }[] = await this.db
      .delete(socialTopicGroups)
      .where(eq(socialTopicGroups.id, id))
      .returning({ id: socialTopicGroups.id });
    if (rows.length === 0) throw new NotFoundException('分组不存在');
    // 标签由外键级联删除
  }

  /** 分组内添加话题（批量，按回车/空格输入的多个关键词） */
  async addTags(groupId: string, names: string[]): Promise<void> {
    const valid = [...new Set(
      (names ?? [])
        .map((n) => n.trim().replace(/^#+/, ''))
        .filter(Boolean),
    )];
    if (valid.length === 0) throw new BadRequestException('话题不能为空');
    const groupRows: GroupRow[] = await this.db
      .select()
      .from(socialTopicGroups)
      .where(eq(socialTopicGroups.id, groupId));
    if (groupRows.length === 0) throw new NotFoundException('分组不存在');
    for (const name of valid) {
      await this.db
        .insert(socialTopicTags)
        .values({ groupId, name })
        .onConflictDoNothing();
    }
  }

  async deleteTag(id: string): Promise<void> {
    const rows: { id: string }[] = await this.db
      .delete(socialTopicTags)
      .where(eq(socialTopicTags.id, id))
      .returning({ id: socialTopicTags.id });
    if (rows.length === 0) throw new NotFoundException('话题不存在');
  }

  async deleteTags(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.db.delete(socialTopicTags).where(inArray(socialTopicTags.id, ids));
  }

  /** 分组内已用话题数（供校验用） */
  async countTags(groupId: string): Promise<number> {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(socialTopicTags)
      .where(eq(socialTopicTags.groupId, groupId));
    return row?.count ?? 0;
  }
}
