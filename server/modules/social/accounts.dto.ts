import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import type {
  AccountBatchMoveRequest,
  CreateAccountRequest,
  UpdateAccountRequest,
} from '@shared/api.interface';

// shared SocialPlatform 有 7 个字面量，逐一核对：
// douyin / xiaohongshu / bilibili / shipinhao / weibo / kuaishou / youtube
const PLATFORM_VALUES = [
  'douyin',
  'xiaohongshu',
  'bilibili',
  'shipinhao',
  'weibo',
  'kuaishou',
  'youtube',
] as const;

// shared AccountStatus 有 2 个字面量：active / paused
const STATUS_VALUES = ['active', 'paused'] as const;

export class CreateAccountDto implements CreateAccountRequest {
  @IsString()
  @IsIn([...PLATFORM_VALUES])
  platform!:
    | 'douyin'
    | 'xiaohongshu'
    | 'bilibili'
    | 'shipinhao'
    | 'weibo'
    | 'kuaishou'
    | 'youtube';

  @IsString()
  @Length(1, 100)
  accountName!: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  homeUrl?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(2000000000)
  followersCount?: number;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @Length(0, 100)
  groupName?: string | null;

  @IsOptional()
  @IsString()
  @IsIn([...STATUS_VALUES])
  status?: 'active' | 'paused';

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  note?: string | null;
}

export class CreateGroupDto {
  @IsString()
  @Length(1, 100)
  name!: string;
}

export class UpdateGroupDto {
  @IsString()
  @Length(1, 100)
  name!: string;
}

export class AccountBatchMoveDto implements AccountBatchMoveRequest {
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  ids!: string[];

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @Length(0, 100)
  groupName?: string | null;
}

export class UpdateAccountDto implements UpdateAccountRequest {
  @IsOptional()
  @IsString()
  @Length(1, 100)
  accountName?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  homeUrl?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(2000000000)
  followersCount?: number;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @Length(0, 100)
  groupName?: string | null;

  @IsOptional()
  @IsString()
  @IsIn([...STATUS_VALUES])
  status?: 'active' | 'paused';

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  note?: string | null;
}
