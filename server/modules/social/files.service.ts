import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { tmpdir } from 'node:os';

/**
 * 统一文件存储服务。
 * 抽象统一上传/读取/删除接口；当前为本地磁盘实现（开发环境），
 * 部署到服务器（Docker + MinIO）时替换为 S3 实现，接口不变。
 *
 * Bucket 约定：
 *  - publish-tmp：发布临时文件，发布执行完成后删除（不占用系统存储）
 *  - materials：素材库文件，持久保留
 */

export const FILE_BUCKETS = ['publish-tmp', 'materials'] as const;
export type FileBucket = (typeof FILE_BUCKETS)[number];

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);
  /** 存储根目录（本地磁盘实现） */
  private readonly root: string;

  constructor() {
    const base = process.env.SOCIAL_UPLOAD_DIR
      ? process.env.SOCIAL_UPLOAD_DIR
      : join(process.env.APPDATA ?? join(tmpdir(), 'SocialManager'), 'SocialManager', 'uploads');
    this.root = base;
    for (const bucket of FILE_BUCKETS) mkdirSync(join(this.root, bucket), { recursive: true });
    this.logger.log(`文件存储根目录: ${this.root}`);
  }

  /** 生成唯一文件 key：{uuid}{ext} */
  generateKey(filename: string): string {
    const ext = extname(filename || '').toLowerCase().slice(0, 10);
    return `${randomUUID()}${ext}`;
  }

  /** 保存文件到指定 bucket */
  async save(
    bucket: FileBucket,
    key: string,
    buffer: Buffer,
    _mime?: string,
  ): Promise<{ fileKey: string; size: number }> {
    const dir = join(this.root, bucket);
    mkdirSync(dir, { recursive: true });
    const safeKey = key.replace(/[^A-Za-z0-9._-]/g, '');
    writeFileSync(join(dir, safeKey), buffer);
    return { fileKey: `${bucket}/${safeKey}`, size: buffer.length };
  }

  /** 本地磁盘路径（发布执行器喂 playwright setInputFiles 需要） */
  localPath(fileKey: string): string {
    const [bucket, ...rest] = fileKey.split('/');
    if (!bucket || !rest.length) throw new Error(`invalid fileKey: ${fileKey}`);
    return join(this.root, bucket, rest.join('/'));
  }

  async exists(fileKey: string): Promise<boolean> {
    try {
      return existsSync(this.localPath(fileKey));
    } catch {
      return false;
    }
  }

  async read(fileKey: string): Promise<Buffer | null> {
    try {
      return readFileSync(this.localPath(fileKey));
    } catch {
      return null;
    }
  }

  async stat(fileKey: string): Promise<{ size: number; mime: string } | null> {
    try {
      const p = this.localPath(fileKey);
      const s = statSync(p);
      const ext = extname(p).toLowerCase();
      const mime =
        ext === '.jpg' || ext === '.jpeg'
          ? 'image/jpeg'
          : ext === '.png'
            ? 'image/png'
            : ext === '.gif'
              ? 'image/gif'
              : ext === '.webp'
                ? 'image/webp'
                : ext === '.mp4'
                  ? 'video/mp4'
                  : ext === '.webm'
                    ? 'video/webm'
                    : ext === '.mov'
                      ? 'video/quicktime'
                      : 'application/octet-stream';
      return { size: s.size, mime };
    } catch {
      return null;
    }
  }

  async delete(fileKey: string): Promise<void> {
    try {
      rmSync(this.localPath(fileKey), { force: true });
    } catch (e) {
      this.logger.warn(`删除文件失败 ${fileKey}: ${(e as Error).message}`);
    }
  }

  /** 批量删除（发布完成后清理临时文件） */
  async deleteMany(fileKeys: string[]): Promise<void> {
    for (const key of fileKeys ?? []) {
      if (key) await this.delete(key);
    }
  }
}
