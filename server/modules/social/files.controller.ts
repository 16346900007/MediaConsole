import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  Res,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { NeedLogin } from '@lark-apaas/fullstack-nestjs-core';
import type { Request, Response } from 'express';
import type { FileUploadResponse } from '@shared/api.interface';
import { FilesService } from './files.service';
@Controller('api/social/files')
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  /** 统一上传：multipart/form-data，字段 file（文件）+ bucket（publish-tmp|materials）+ thumb（可选视频截帧图） */
  @NeedLogin()
  @Post('upload')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'file', maxCount: 1 },
        { name: 'thumb', maxCount: 1 },
      ],
      {
        limits: { fileSize: 2 * 1024 * 1024 * 1024 }, // 2GB 上限（覆盖各平台视频文件规格）
      },
    ),
  )
  async upload(
    @UploadedFiles()
    files: {
      file?: { originalname?: string; buffer?: Buffer; mimetype?: string }[];
      thumb?: { originalname?: string; buffer?: Buffer; mimetype?: string }[];
    },
    @Body('bucket') bucket?: string,
  ): Promise<FileUploadResponse> {
    const file = files?.file?.[0];
    if (!file?.buffer) {
      throw new Error('缺少文件内容（file 字段）');
    }
    // 桶名归一：兼容前端短名（publish-tmp/materials）与带前缀真实桶名
    const b = this.filesService.resolveBucket(bucket);
    const key = this.filesService.generateKey(file.originalname ?? 'file');
    const { fileKey } = await this.filesService.save(b, key, file.buffer, file.mimetype);
    const stat = await this.filesService.stat(fileKey);

    // 可选：视频截帧缩略图随同上传，存为 <key>.thumb.jpg
    let thumbUrl: string | null = null;
    const thumb = files?.thumb?.[0];
    if (thumb?.buffer) {
      const thumbKey = `${key}.thumb.jpg`;
      await this.filesService.save(b, thumbKey, thumb.buffer, thumb.mimetype ?? 'image/jpeg');
      thumbUrl = `/api/social/files/${b}/${thumbKey}`;
    }

    return {
      fileKey,
      url: `/api/social/files/${fileKey}`,
      size: stat?.size ?? file.buffer.length,
      mime: stat?.mime ?? file.mimetype ?? 'application/octet-stream',
      thumbUrl,
    };
  }

  /** 读取文件（封面预览/下载；key 形如 publish-tmp/xxx.mp4；支持 HTTP Range 分段，视频 seek/抽帧必需） */
  @Get(':bucket/:key')
  async read(
    @Param('bucket') bucket: string,
    @Param('key') key: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const fileKey = `${bucket}/${key}`;
    const stat = await this.filesService.stat(fileKey);
    if (!stat) {
      res.status(404).send('not found');
      return;
    }
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'no-store');

    const range = req.headers.range;
    if (range) {
      const m = /bytes=(\d*)-(\d*)/.exec(range);
      const size = stat.size;
      let start = m && m[1] ? parseInt(m[1], 10) : 0;
      let end = m && m[2] ? parseInt(m[2], 10) : size - 1;
      if (Number.isNaN(start) || Number.isNaN(end)) {
        res.setHeader('Content-Range', `bytes */${size}`);
        res.status(416).send('range not satisfiable');
        return;
      }
      if (end >= size) end = size - 1;
      if (start > end || start >= size) {
        res.setHeader('Content-Range', `bytes */${size}`);
        res.status(416).send('range not satisfiable');
        return;
      }
      const buf = await this.filesService.readRange(fileKey, start, end);
      if (!buf) {
        res.status(404).send('not found');
        return;
      }
      res.status(206);
      res.setHeader('Content-Type', stat.mime);
      res.setHeader('Content-Length', buf.length);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
      res.end(buf);
      return;
    }

    res.setHeader('Content-Type', stat.mime);
    res.setHeader('Content-Length', stat.size);
    const buf = await this.filesService.read(fileKey);
    if (!buf) {
      res.status(404).send('not found');
      return;
    }
    res.end(buf);
  }
}
