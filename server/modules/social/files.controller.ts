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
    const thumb = files?.thumb?.[0];

    // S3 模式：走后台任务，前端轮询 /upload-progress/:taskId 拿 MinIO 真实进度
    if (this.filesService.isS3) {
      const taskId = await this.filesService.startUploadTask(
        b,
        key,
        file.buffer,
        file.mimetype,
        thumb?.buffer,
      );
      return {
        taskId,
        phase: 'uploading',
      } as unknown as FileUploadResponse;
    }

    // 磁盘模式：本地写盘很快，同步返回
    const { fileKey } = await this.filesService.save(b, key, file.buffer, file.mimetype);
    const stat = await this.filesService.stat(fileKey);

    // 可选：视频截帧缩略图随同上传，存为 <key>.thumb.jpg
    let thumbUrl: string | null = null;
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

  /** 查询上传任务进度（S3 模式 multipart 真实进度） */
  @NeedLogin()
  @Get('upload-progress/:taskId')
  async uploadProgress(@Param('taskId') taskId: string): Promise<{
    taskId: string;
    percent: number;
    phase: 'uploading' | 'done' | 'error';
    fileKey?: string;
    url?: string;
    thumbUrl?: string | null;
    error?: string;
  }> {
    const task = this.filesService.getUploadTask(taskId);
    if (!task) {
      return { taskId, percent: 0, phase: 'error', error: '任务不存在' };
    }
    return { taskId, ...task };
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
    // 视频播放等场景允许缓存，避免每次重复拉取
    res.setHeader('Cache-Control', 'private, max-age=3600');
    // 自动填表：注入函数在平台发布页（跨域）fetch 媒体文件，需允许跨域读取
    res.setHeader('Access-Control-Allow-Origin', '*');

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
      const stream = await this.filesService.createReadStream(fileKey, start, end);
      if (!stream) {
        res.status(404).send('not found');
        return;
      }
      res.status(206);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Content-Type', stat.mime);
      res.setHeader('Content-Length', end - start + 1);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
      stream.on('error', () => {
        res.destroy();
      });
      stream.pipe(res);
      return;
    }

    // 无 Range（视频元素探测/首次加载）：流式返回，边读边发，不等整包
    const stream = await this.filesService.createReadStream(fileKey);
    if (!stream) {
      res.status(404).send('not found');
      return;
    }
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', stat.mime);
    res.setHeader('Content-Length', stat.size);
    stream.on('error', () => {
      res.destroy();
    });
    stream.pipe(res);
  }
}
