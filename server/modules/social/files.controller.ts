import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { NeedLogin } from '@lark-apaas/fullstack-nestjs-core';
import type { Response } from 'express';
import type { FileUploadResponse } from '@shared/api.interface';
import { FilesService, FILE_BUCKETS, type FileBucket } from './files.service';

@Controller('api/social/files')
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  /** 统一上传：multipart/form-data，字段 file（文件）+ bucket（publish-tmp|materials） */
  @NeedLogin()
  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 2 * 1024 * 1024 * 1024 }, // 2GB 上限（覆盖各平台视频文件规格）
    }),
  )
  async upload(
    @UploadedFile() file: { originalname?: string; buffer?: Buffer; mimetype?: string } | undefined,
    @Body('bucket') bucket?: string,
  ): Promise<FileUploadResponse> {
    if (!file?.buffer) {
      throw new Error('缺少文件内容（file 字段）');
    }
    const b: FileBucket = (FILE_BUCKETS as readonly string[]).includes(bucket ?? '')
      ? (bucket as FileBucket)
      : 'publish-tmp';
    const key = this.filesService.generateKey(file.originalname ?? 'file');
    const { fileKey } = await this.filesService.save(b, key, file.buffer, file.mimetype);
    const stat = await this.filesService.stat(fileKey);
    return {
      fileKey,
      url: `/api/social/files/${fileKey}`,
      size: stat?.size ?? file.buffer.length,
      mime: stat?.mime ?? file.mimetype ?? 'application/octet-stream',
    };
  }

  /** 读取文件（封面预览/下载；key 形如 publish-tmp/xxx.mp4） */
  @Get(':bucket/:key')
  async read(
    @Param('bucket') bucket: string,
    @Param('key') key: string,
    @Res() res: Response,
  ): Promise<void> {
    const fileKey = `${bucket}/${key}`;
    const stat = await this.filesService.stat(fileKey);
    if (!stat) {
      res.status(404).send('not found');
      return;
    }
    res.setHeader('Content-Type', stat.mime);
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Cache-Control', 'no-store');
    const buf = await this.filesService.read(fileKey);
    if (!buf) {
      res.status(404).send('not found');
      return;
    }
    res.end(buf);
  }
}
