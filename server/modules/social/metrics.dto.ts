import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';
import type { MetricInput } from '@shared/api.interface';

export const METRIC_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 单条手工录入：严格校验（配合路由级 ValidationPipe）
 */
export class CreateMetricDto implements MetricInput {
  @IsUUID(undefined, { message: '账号 ID 必须为 UUID' })
  accountId!: string;

  @Matches(METRIC_DATE_PATTERN, { message: '日期格式必须为 YYYY-MM-DD' })
  date!: string;

  @IsOptional()
  @IsInt({ message: '播放数必须为整数' })
  @Min(0, { message: '播放数不能为负数' })
  views?: number;

  @IsOptional()
  @IsInt({ message: '点赞数必须为整数' })
  @Min(0, { message: '点赞数不能为负数' })
  likes?: number;

  @IsOptional()
  @IsInt({ message: '评论数必须为整数' })
  @Min(0, { message: '评论数不能为负数' })
  comments?: number;

  @IsOptional()
  @IsInt({ message: '分享数必须为整数' })
  @Min(0, { message: '分享数不能为负数' })
  shares?: number;

  @IsOptional()
  @IsInt({ message: '涨粉数必须为整数' })
  @Min(0, { message: '涨粉数不能为负数' })
  followersDelta?: number;
}

/**
 * 批量导入行：刻意做宽松校验。
 * 原因：date 格式错 / 负数等行级错误需要逐条记入 errors 返回给前端，
 * 而不是被管道层 class-validator 以 400 拒绝整批请求。
 * 行级校验全部下沉到 MetricsService.importMetrics。
 */
export class ImportMetricItemDto implements MetricInput {
  @IsString()
  accountId!: string;

  @IsString()
  date!: string;

  @IsOptional()
  views?: number;

  @IsOptional()
  likes?: number;

  @IsOptional()
  comments?: number;

  @IsOptional()
  shares?: number;

  @IsOptional()
  followersDelta?: number;
}

export class ImportMetricsDto {
  @IsArray()
  @ArrayMaxSize(1000, { message: '单次最多导入 1000 条' })
  @ValidateNested({ each: true })
  @Type(() => ImportMetricItemDto)
  items!: ImportMetricItemDto[];
}
