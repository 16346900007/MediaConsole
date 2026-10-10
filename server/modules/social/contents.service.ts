import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DRIZZLE_DATABASE,
  type PostgresJsDatabase,
} from '@lark-apaas/fullstack-nestjs-core';
import {
  and,
  count,
  desc,
  eq,
  ilike,
  sql,
  type SQL,
} from 'drizzle-orm';
import {
  SOCIAL_PLATFORMS,
  type ContentStatus,
  type ContentType,
  type ContentVariant,
  type ContentListResponse,
  type SocialContent,
  type SocialContentDetail,
  type SocialPlatform,
} from '@shared/api.interface';
import {
  socialContentVariants,
  socialContents,
} from '@server/database/schema';
import type {
  CreateContentDto,
  SaveVariantsDto,
  UpdateContentDto,
  VariantInputDto,
} from './contents.dto';

export interface ListContentsParams {
  status?: string;
  contentType?: string;
  keyword?: string;
  page: number;
  pageSize: number;
}

type ContentRow = typeof socialContents.$inferSelect;
type VariantRow = typeof socialContentVariants.$inferSelect;

function toContent(row: ContentRow): SocialContent {
  const contentType: ContentType =
    row.contentType === 'video' ? 'video' : 'article';
  const status: ContentStatus =
    row.status === 'ready' || row.status === 'archived' ? row.status : 'draft';
  return {
    id: row.id,
    title: row.title,
    contentType,
    body: row.body,
    tags: row.tags ?? [],
    coverUrl: row.coverUrl,
    status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function asPlatform(value: string): SocialPlatform {
  const found = SOCIAL_PLATFORMS.find(
    (platform: SocialPlatform) => platform === value,
  );
  return found !== undefined ? found : 'douyin';
}

function toVariant(row: VariantRow): ContentVariant {
  return {
    id: row.id,
    contentId: row.contentId,
    platform: asPlatform(row.platform),
    adaptedTitle: row.adaptedTitle,
    adaptedBody: row.adaptedBody,
  };
}

@Injectable()
export class ContentsService {
  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
  ) {}

  async list(params: ListContentsParams): Promise<ContentListResponse> {
    const conditions: SQL[] = [];
    if (params.status !== undefined && params.status !== '') {
      conditions.push(eq(socialContents.status, params.status));
    }
    if (params.contentType !== undefined && params.contentType !== '') {
      conditions.push(eq(socialContents.contentType, params.contentType));
    }
    if (params.keyword !== undefined && params.keyword !== '') {
      conditions.push(ilike(socialContents.title, `%${params.keyword}%`));
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [countRow] = await this.db
      .select({ total: count() })
      .from(socialContents)
      .where(where);
    const rows = await this.db
      .select()
      .from(socialContents)
      .where(where)
      .orderBy(desc(socialContents.createdAt), desc(socialContents.id))
      .limit(params.pageSize)
      .offset((params.page - 1) * params.pageSize);

    return { items: rows.map(toContent), total: countRow?.total ?? 0 };
  }

  async getDetail(id: string): Promise<SocialContentDetail> {
    const [row] = await this.db
      .select()
      .from(socialContents)
      .where(eq(socialContents.id, id));
    if (row === undefined) {
      throw new NotFoundException('内容不存在');
    }
    const variantRows = await this.db
      .select()
      .from(socialContentVariants)
      .where(eq(socialContentVariants.contentId, id));
    return { ...toContent(row), variants: variantRows.map(toVariant) };
  }

  async create(dto: CreateContentDto): Promise<SocialContent> {
    const [row] = await this.db
      .insert(socialContents)
      .values({
        title: dto.title,
        contentType: dto.contentType,
        body: dto.body ?? null,
        tags: dto.tags ?? [],
        coverUrl: dto.coverUrl ?? null,
        status: dto.status ?? 'draft',
      })
      .returning();
    return toContent(row);
  }

  async update(id: string, dto: UpdateContentDto): Promise<SocialContent> {
    const patch: Partial<typeof socialContents.$inferInsert> = {};
    if (dto.title !== undefined) patch.title = dto.title;
    if (dto.contentType !== undefined) patch.contentType = dto.contentType;
    if (dto.body !== undefined) patch.body = dto.body;
    if (dto.tags !== undefined) patch.tags = dto.tags;
    if (dto.coverUrl !== undefined) patch.coverUrl = dto.coverUrl;
    if (dto.status !== undefined) patch.status = dto.status;
    if (Object.keys(patch).length === 0) {
      throw new BadRequestException('未提供可更新字段');
    }
    patch.updatedAt = new Date();

    const rows = await this.db
      .update(socialContents)
      .set(patch)
      .where(eq(socialContents.id, id))
      .returning();
    if (rows.length === 0) {
      throw new NotFoundException('内容不存在');
    }
    return toContent(rows[0]);
  }

  async remove(id: string): Promise<void> {
    const rows = await this.db
      .delete(socialContents)
      .where(eq(socialContents.id, id))
      .returning({ id: socialContents.id });
    if (rows.length === 0) {
      throw new NotFoundException('内容不存在');
    }
  }

  async saveVariants(id: string, dto: SaveVariantsDto): Promise<void> {
    const [contentRow] = await this.db
      .select({ id: socialContents.id })
      .from(socialContents)
      .where(eq(socialContents.id, id));
    if (contentRow === undefined) {
      throw new NotFoundException('内容不存在');
    }

    const byPlatform = new Map<string, VariantInputDto>();
    for (const variant of dto.variants) {
      byPlatform.set(variant.platform, variant);
    }
    const rows = [...byPlatform.values()].map(
      (variant: VariantInputDto) => ({
      contentId: id,
      platform: variant.platform,
        adaptedTitle: variant.adaptedTitle ?? null,
        adaptedBody: variant.adaptedBody ?? null,
      }),
    );
    if (rows.length === 0) {
      return;
    }

    await this.db
      .insert(socialContentVariants)
      .values(rows)
      .onConflictDoUpdate({
        target: [socialContentVariants.contentId, socialContentVariants.platform],
        set: {
          adaptedTitle: sql`excluded.adapted_title`,
          adaptedBody: sql`excluded.adapted_body`,
        },
      });
  }
}
