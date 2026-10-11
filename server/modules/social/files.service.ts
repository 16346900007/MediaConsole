import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync, createReadStream } from 'node:fs';
import { extname, join } from 'node:path';
import { tmpdir } from 'node:os';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const Minio = require('minio') as any;

/**
 * 统一文件存储服务。
 * 双模式实现，接口一致：
 *  - 磁盘模式（默认，开发环境）：文件落在 {SOCIAL_UPLOAD_DIR|%APPDATA%\SocialManager\uploads}
 *  - S3 模式（部署环境）：设置 S3_ENDPOINT + S3_ACCESS_KEY + S3_SECRET_KEY 后，
 *    文件存到 SILO/MinIO（S3 兼容）对象存储，本地不占用系统存储
 *
 * Bucket 约定（默认带项目前缀 media-console-，部署时可用环境变量覆盖）：
 *  - {prefix}-publish-tmp：发布临时文件，发布执行完成后删除（不占用系统存储）
 *  - {prefix}-materials：素材库文件，持久保留
 */

const BUCKET_PREFIX = process.env.S3_BUCKET_PREFIX ?? 'media-console';

export const FILE_BUCKETS = [
  `${BUCKET_PREFIX}-publish-tmp`,
  `${BUCKET_PREFIX}-materials`,
] as const;
export type FileBucket = (typeof FILE_BUCKETS)[number];

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);
  /** 存储根目录（磁盘模式） */
  private readonly root: string;
  /** S3 客户端（S3 模式） */
  private readonly s3: any | null = null;
  private readonly s3Endpoint: string | null = null;
  private readonly s3Region: string;
  /** 上传并发限制 */
  private readonly partSize = 16 * 1024 * 1024;

  constructor() {
    const endpoint = process.env.S3_ENDPOINT?.trim();
    const accessKey = process.env.S3_ACCESS_KEY?.trim();
    const secretKey = process.env.S3_SECRET_KEY?.trim();
    this.s3Region = process.env.S3_REGION?.trim() || 'us-east-1';

    if (endpoint && accessKey && secretKey) {
      this.s3Endpoint = endpoint;
      this.s3 = new Minio.Client({
        endPoint: endpoint.replace(/^https?:\/\//, '').split(':')[0],
        port: Number(endpoint.split(':').pop()) || undefined,
        useSSL: endpoint.startsWith('https://'),
        accessKey,
        secretKey,
        region: this.s3Region,
      });
      this.logger.log(`文件存储: S3 模式 @ ${endpoint}（buckets: ${FILE_BUCKETS.join(', ')}）`);
    } else {
      const base = process.env.SOCIAL_UPLOAD_DIR
        ? process.env.SOCIAL_UPLOAD_DIR
        : join(process.env.APPDATA ?? join(tmpdir(), 'SocialManager'), 'SocialManager', 'uploads');
      this.root = base;
      for (const bucket of FILE_BUCKETS) mkdirSync(join(this.root, bucket), { recursive: true });
      this.logger.log(`文件存储: 磁盘模式 @ ${this.root}`);
    }
  }

  /** 生成唯一文件 key：{uuid}{ext} */
  generateKey(filename: string): string {
    const ext = extname(filename || '').toLowerCase().slice(0, 10);
    return `${randomUUID()}${ext}`;
  }

  private bucketOf(fileKey: string): { bucket: string; key: string } {
    const idx = fileKey.indexOf('/');
    if (idx <= 0 || idx === fileKey.length - 1) throw new Error(`invalid fileKey: ${fileKey}`);
    return { bucket: fileKey.slice(0, idx), key: fileKey.slice(idx + 1) };
  }

  /** 保存文件到指定 bucket */
  async save(
    bucket: FileBucket,
    key: string,
    buffer: Buffer,
    mime?: string,
  ): Promise<{ fileKey: string; size: number }> {
    const safeKey = key.replace(/[^A-Za-z0-9._-]/g, '');
    if (this.s3) {
      await this.s3.putObject(bucket, safeKey, buffer, buffer.length, { 'Content-Type': mime || 'application/octet-stream' });
    } else {
      const dir = join(this.root, bucket);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, safeKey), buffer);
    }
    return { fileKey: `${bucket}/${safeKey}`, size: buffer.length };
  }

  /**
   * 获取可在本机直接读取的本地文件路径。
   *  - 磁盘模式：直接返回存储路径
   *  - S3 模式：下载到系统临时目录并返回（发布执行器喂 playwright setInputFiles 需要）
   */
  async toLocalFile(fileKey: string): Promise<string> {
    if (!this.s3) return this.localPath(fileKey);
    const { bucket, key } = this.bucketOf(fileKey);
    const tmpFile = join(tmpdir(), `s3-${bucket}-${key.replace(/[^A-Za-z0-9._-]/g, '')}`);
    if (existsSync(tmpFile)) return tmpFile;
    await this.s3.fGetObject(bucket, key, tmpFile);
    return tmpFile;
  }

  /** 本地磁盘路径（仅磁盘模式可用；S3 模式请用 toLocalFile） */
  localPath(fileKey: string): string {
    const { bucket, key } = this.bucketOf(fileKey);
    if (this.s3) throw new Error('S3 模式下请使用 toLocalFile() 获取本地临时路径');
    return join(this.root, bucket, key);
  }

  async exists(fileKey: string): Promise<boolean> {
    if (this.s3) {
      try {
        const { bucket, key } = this.bucketOf(fileKey);
        await this.s3.statObject(bucket, key);
        return true;
      } catch {
        return false;
      }
    }
    try {
      return existsSync(this.localPath(fileKey));
    } catch {
      return false;
    }
  }

  async read(fileKey: string): Promise<Buffer | null> {
    if (this.s3) {
      try {
        const { bucket, key } = this.bucketOf(fileKey);
        const chunks: Buffer[] = [];
        const stream = await this.s3.getObject(bucket, key);
        for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        return Buffer.concat(chunks);
      } catch {
        return null;
      }
    }
    try {
      return readFileSync(this.localPath(fileKey));
    } catch {
      return null;
    }
  }

  async stat(fileKey: string): Promise<{ size: number; mime: string } | null> {
    if (this.s3) {
      try {
        const { bucket, key } = this.bucketOf(fileKey);
        const info = await this.s3.statObject(bucket, key);
        return { size: info.size ?? 0, mime: String(info.metaData?.['content-type'] || 'application/octet-stream') };
      } catch {
        return null;
      }
    }
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
      if (this.s3) {
        const { bucket, key } = this.bucketOf(fileKey);
        await this.s3.removeObject(bucket, key);
      } else {
        rmSync(this.localPath(fileKey), { force: true });
      }
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
