import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import type {
  CreateMaterialRequest,
  MaterialBatchDeleteRequest,
  MaterialBatchMoveRequest,
  UpdateMaterialRequest,
} from '@shared/api.interface';

export class CreateMaterialDto implements CreateMaterialRequest {
  @IsString()
  @MaxLength(200)
  name!: string;

  @IsString()
  @IsIn(['image', 'video'])
  type!: 'image' | 'video';

  @IsString()
  filePath!: string;

  @IsString()
  fileUrl!: string;

  @IsInt()
  @Min(0)
  fileSize!: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  groupName?: string | null;

  @IsOptional()
  @IsInt()
  width?: number | null;

  @IsOptional()
  @IsInt()
  height?: number | null;

  @IsOptional()
  @IsString()
  thumbnailUrl?: string | null;
}

export class UpdateMaterialDto implements UpdateMaterialRequest {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  groupName?: string | null;
}

export class MaterialBatchDeleteDto implements MaterialBatchDeleteRequest {
  @IsArray()
  @IsString({ each: true })
  ids!: string[];
}

export class MaterialBatchMoveDto implements MaterialBatchMoveRequest {
  @IsArray()
  @IsString({ each: true })
  ids!: string[];

  @IsString()
  groupName!: string | null;
}

export class CreateGroupDto {
  @IsString()
  @MaxLength(100)
  name!: string;
}

export class UpdateGroupDto {
  @IsString()
  @MaxLength(100)
  name!: string;
}
