import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { NeedLogin } from '@lark-apaas/fullstack-nestjs-core';
import type { MetricBatchResponse, MetricsSummaryResponse } from '@shared/api.interface';
import { CreateMetricDto, ImportMetricsDto } from './metrics.dto';
import { MetricsService } from './metrics.service';

@UsePipes(new ValidationPipe({ transform: true, forbidUnknownValues: true }))
@Controller('api/social/metrics')
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  /** 单条手工录入（upsert：同账号同日覆盖更新） */
  @NeedLogin()
  @Post()
  async create(@Body() dto: CreateMetricDto): Promise<void> {
    await this.metricsService.createMetric(dto);
  }

  /** CSV 批量导入：逐条校验并 upsert，部分失败不整体回滚 */
  @NeedLogin()
  @Post('batch')
  async importBatch(@Body() dto: ImportMetricsDto): Promise<MetricBatchResponse> {
    return this.metricsService.importMetrics(dto.items);
  }

  /** 区间统计看板：默认近 30 天 */
  @NeedLogin()
  @Get('summary')
  async getSummary(
    @Query('start') start?: string,
    @Query('end') end?: string,
  ): Promise<MetricsSummaryResponse> {
    return this.metricsService.getSummary(start, end);
  }
}
