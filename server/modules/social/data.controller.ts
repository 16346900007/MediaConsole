import {
  Controller,
  Get,
  Post,
  Query,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { NeedLogin } from '@lark-apaas/fullstack-nestjs-core';
import type {
  DataOverviewResponse,
  DataSyncResponse,
  SocialPost,
} from '@shared/api.interface';
import { DataService } from './data.service';

@UsePipes(new ValidationPipe({ transform: true, forbidUnknownValues: true }))
@Controller('api/social/data')
export class DataController {
  constructor(private readonly dataService: DataService) {}

  /** 数据总览：6 KPI 聚合 + 账号/平台分布，可选按账号筛选 */
  @NeedLogin()
  @Get('overview')
  async overview(
    @Query('accountId') accountId?: string,
  ): Promise<DataOverviewResponse> {
    return this.dataService.getOverview(accountId);
  }

  /** 账号作品列表 */
  @NeedLogin()
  @Get('posts')
  async posts(@Query('accountId') accountId: string): Promise<SocialPost[]> {
    return this.dataService.listPosts(accountId);
  }

  /** 触发同步（异步执行，默认全部账号，可传 accountId 单账号） */
  @NeedLogin()
  @Post('sync')
  async sync(
    @Query('accountId') accountId?: string,
  ): Promise<DataSyncResponse> {
    return this.dataService.sync(accountId);
  }
}
