import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import type {
  CreateContentRequest,
  SaveVariantsRequest,
  UpdateContentRequest,
  VariantInput,
} from '@shared/api.interface';

export class CreateContentDto implements CreateContentRequest {
  @IsString()
  @MaxLength(200)
  title!: string;

  @IsIn(['article', 'video'])
  contentType!: 'article' | 'video';

  @IsOptional()
  @IsString()
  body?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsString()
  coverUrl?: string | null;

  @IsOptional()
  @IsIn(['draft', 'ready', 'archived'])
  status?: 'draft' | 'ready' | 'archived';
}

export class UpdateContentDto implements UpdateContentRequest {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsIn(['article', 'video'])
  contentType?: 'article' | 'video';

  @IsOptional()
  @IsString()
  body?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsString()
  coverUrl?: string | null;

  @IsOptional()
  @IsIn(['draft', 'ready', 'archived'])
  status?: 'draft' | 'ready' | 'archived';
}

export class VariantInputDto implements VariantInput {
  @IsIn([
    'douyin',
    'xiaohongshu',
    'bilibili',
    'shipinhao',
    'weibo',
    'kuaishou',
    'youtube',
  ])
  platform!:
    | 'douyin'
    | 'xiaohongshu'
    | 'bilibili'
    | 'shipinhao'
    | 'weibo'
    | 'kuaishou'
    | 'youtube';

  @IsOptional()
  @IsString()
  adaptedTitle?: string | null;

  @IsOptional()
  @IsString()
  adaptedBody?: string | null;
}

export class SaveVariantsDto implements SaveVariantsRequest {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VariantInputDto)
  variants!: VariantInputDto[];
}
