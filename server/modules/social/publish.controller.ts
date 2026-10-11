import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { NeedLogin } from '@lark-apaas/fullstack-nestjs-core';
import type { PublishTask, PublishTaskInput } from '@shared/api.interface';
import { PublishService } from './publish.service';

@Controller('api/social/publish')
export class PublishController {
  constructor(private readonly publishService: PublishService) {}

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
}
