import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { NeedLogin } from '@lark-apaas/fullstack-nestjs-core';
import type { TopicLibrary, TopicGroup } from '@shared/api.interface';
import { TopicsService } from './topics.service';

@Controller('api/social/topics')
export class TopicsController {
  constructor(private readonly topicsService: TopicsService) {}

  /** 话题库全量（分组 + 组内标签） */
  @NeedLogin()
  @Get()
  listLibrary(): Promise<TopicLibrary> {
    return this.topicsService.listLibrary();
  }

  @NeedLogin()
  @Post('groups')
  createGroup(@Body('name') name: string): Promise<TopicGroup> {
    return this.topicsService.createGroup(name ?? '');
  }

  @NeedLogin()
  @Patch('groups/:id')
  renameGroup(
    @Param('id') id: string,
    @Body('name') name: string,
  ): Promise<void> {
    return this.topicsService.renameGroup(id, name ?? '');
  }

  @NeedLogin()
  @Delete('groups/:id')
  deleteGroup(@Param('id') id: string): Promise<void> {
    return this.topicsService.deleteGroup(id);
  }

  /** 分组内添加话题（names 数组，回车/空格输入的关键词批量） */
  @NeedLogin()
  @Post('groups/:id/tags')
  addTags(
    @Param('id') id: string,
    @Body('names') names: string[],
  ): Promise<void> {
    return this.topicsService.addTags(id, Array.isArray(names) ? names : []);
  }

  /** 快捷入库：发布表单输入的话题写入「常用」分组（自动创建），话题=标签通用适配 */
  @NeedLogin()
  @Post('quick-add')
  quickAdd(@Body('names') names: string[]): Promise<TopicGroup> {
    return this.topicsService.quickAdd(Array.isArray(names) ? names : []);
  }

  @NeedLogin()
  @Delete('tags/:id')
  deleteTag(@Param('id') id: string): Promise<void> {
    return this.topicsService.deleteTag(id);
  }
}
