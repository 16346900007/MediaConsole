import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type PostgresJsDatabase,
  DRIZZLE_DATABASE,
} from '@lark-apaas/fullstack-nestjs-core';
import { and, asc, desc, eq, ilike, inArray, isNull, sql, type SQL } from 'drizzle-orm';
import { socialMaterialGroups, socialMaterials } from '@server/database/schema';
import type {
  MaterialGroup,
  MaterialItem,
  MaterialListResponse,
  MaterialUsageResponse,
} from '@shared/api.interface';
import type {
  CreateMaterialDto,
  MaterialBatchDeleteDto,
  MaterialBatchMoveDto,
  UpdateGroupDto,
  UpdateMaterialDto,
} from './materials.dto';

type MaterialRow = typeof socialMaterials.$inferSelect;

const TOTAL_QUOTA_BYTES = 5 * 1024 * 1024 * 1024;

@Injectable()
export class MaterialsService {
  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
  ) {}

  private toMaterial(row: MaterialRow): MaterialItem {
    return {
      id: row.id,
      name: row.name,
      type: row.type as MaterialItem['type'],
      filePath: row.filePath,
      fileUrl: row.fileUrl,
      fileSize: row.fileSize,
      groupName: row.groupName,
      width: row.width,
      height: row.height,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async listMaterials(params?: {
    type?: string;
    group?: string;
    keyword?: string;
    page?: number;
    pageSize?: number;
  }): Promise<MaterialListResponse> {
    const conditions: SQL[] = [];
    if (params?.type === 'image' || params?.type === 'video') {
      conditions.push(eq(socialMaterials.type, params.type));
    }
    if (params?.group === '__none__') {
      conditions.push(isNull(socialMaterials.groupName));
    } else if (params?.group) {
      conditions.push(eq(socialMaterials.groupName, params.group));
    }
    if (params?.keyword) {
      conditions.push(ilike(socialMaterials.name, `%${params.keyword}%`));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const page = Math.max(1, params?.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, params?.pageSize ?? 12));
    const offset = (page - 1) * pageSize;

    const rows: MaterialRow[] = await this.db
      .select()
      .from(socialMaterials)
      .where(where)
      .orderBy(desc(socialMaterials.createdAt), asc(socialMaterials.id))
      .limit(pageSize)
      .offset(offset);

    const [{ total }] = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(socialMaterials)
      .where(where);

    return {
      items: rows.map((row: MaterialRow) => this.toMaterial(row)),
      total,
    };
  }

  async createMaterial(dto: CreateMaterialDto): Promise<MaterialItem> {
    const inserted: MaterialRow[] = await this.db
      .insert(socialMaterials)
      .values({
        name: dto.name,
        type: dto.type,
        filePath: dto.filePath,
        fileUrl: dto.fileUrl,
        fileSize: dto.fileSize,
        groupName: dto.groupName ?? null,
        width: dto.width ?? null,
        height: dto.height ?? null,
      })
      .returning();
    return this.toMaterial(inserted[0]);
  }

  async updateMaterial(id: string, dto: UpdateMaterialDto): Promise<MaterialItem> {
    const patch: Partial<typeof socialMaterials.$inferInsert> = {};
    if (dto.name !== undefined) patch.name = dto.name;
    if (dto.groupName !== undefined) patch.groupName = dto.groupName;
    if (Object.keys(patch).length === 0) {
      throw new BadRequestException('未提供可更新字段');
    }
    patch.updatedAt = new Date();

    const rows: MaterialRow[] = await this.db
      .update(socialMaterials)
      .set(patch)
      .where(eq(socialMaterials.id, id))
      .returning();
    if (rows.length === 0) {
      throw new NotFoundException('素材不存在');
    }
    return this.toMaterial(rows[0]);
  }

  async deleteMaterial(id: string): Promise<void> {
    const rows: { id: string }[] = await this.db
      .delete(socialMaterials)
      .where(eq(socialMaterials.id, id))
      .returning({ id: socialMaterials.id });
    if (rows.length === 0) {
      throw new NotFoundException('素材不存在');
    }
  }

  async batchDelete(dto: MaterialBatchDeleteDto): Promise<void> {
    if (dto.ids.length === 0) {
      throw new BadRequestException('未选择素材');
    }
    await this.db
      .delete(socialMaterials)
      .where(inArray(socialMaterials.id, dto.ids));
  }

  async batchMove(dto: MaterialBatchMoveDto): Promise<void> {
    if (dto.ids.length === 0) {
      throw new BadRequestException('未选择素材');
    }
    await this.db
      .update(socialMaterials)
      .set({
        groupName: dto.groupName,
        updatedAt: new Date(),
      })
      .where(inArray(socialMaterials.id, dto.ids));
  }

  async listGroups(): Promise<MaterialGroup[]> {
    const groupRows = await this.db
      .select({ name: socialMaterialGroups.name })
      .from(socialMaterialGroups)
      .orderBy(asc(socialMaterialGroups.createdAt));

    const countRows = await this.db
      .select({
        name: socialMaterials.groupName,
        count: sql<number>`count(*)::int`,
      })
      .from(socialMaterials)
      .where(sql`${socialMaterials.groupName} IS NOT NULL`)
      .groupBy(socialMaterials.groupName);
    const countMap = new Map<string, number>();
    for (const row of countRows) {
      if (row.name !== null) {
        countMap.set(row.name, row.count);
      }
    }

    const knownNames = new Set<string>(
      groupRows.map((row: { name: string }) => row.name),
    );
    const groups: MaterialGroup[] = groupRows.map(
      (row: { name: string }): MaterialGroup => ({
        name: row.name,
        count: countMap.get(row.name) ?? 0,
      }),
    );
    for (const [name, count] of countMap) {
      if (!knownNames.has(name)) {
        groups.push({ name, count });
      }
    }
    return groups;
  }

  async createGroup(name: string): Promise<void> {
    await this.db
      .insert(socialMaterialGroups)
      .values({ name })
      .onConflictDoNothing();
  }

  async renameGroup(oldName: string, newName: string): Promise<void> {
    const groupRows: { id: string }[] = await this.db
      .update(socialMaterialGroups)
      .set({ name: newName, updatedAt: new Date() })
      .where(eq(socialMaterialGroups.name, oldName))
      .returning({ id: socialMaterialGroups.id });
    if (groupRows.length === 0) {
      throw new NotFoundException('分组不存在');
    }
    await this.db
      .update(socialMaterials)
      .set({ groupName: newName, updatedAt: new Date() })
      .where(eq(socialMaterials.groupName, oldName));
  }

  async deleteGroup(name: string): Promise<void> {
    const groupRows: { id: string }[] = await this.db
      .delete(socialMaterialGroups)
      .where(eq(socialMaterialGroups.name, name))
      .returning({ id: socialMaterialGroups.id });
    if (groupRows.length === 0) {
      throw new NotFoundException('分组不存在');
    }
    await this.db
      .update(socialMaterials)
      .set({ groupName: null, updatedAt: new Date() })
      .where(eq(socialMaterials.groupName, name));
  }



  async getUsage(): Promise<MaterialUsageResponse> {
    const [row] = await this.db
      .select({
        usedBytes: sql<number>`coalesce(sum(${socialMaterials.fileSize}), 0)::bigint`,
        fileCount: sql<number>`count(*)::int`,
      })
      .from(socialMaterials);
    return {
      usedBytes: Number(row?.usedBytes ?? 0),
      totalBytes: TOTAL_QUOTA_BYTES,
      fileCount: row?.fileCount ?? 0,
    };
  }
}
