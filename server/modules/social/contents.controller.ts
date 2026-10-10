import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { NeedLogin } from '@lark-apaas/fullstack-nestjs-core';
import type {
  ContentListResponse,
  SocialContent,
  SocialContentDetail,
} from '@shared/api.interface';
import { ContentsService } from './contents.service';
import {
  CreateContentDto,
  SaveVariantsDto,
  UpdateContentDto,
} from './contents.dto';

@Controller('api/social/contents')
export class ContentsController {
  constructor(private readonly contentsService: ContentsService) {}

  @Get()
  async list(
    @Query('status') status?: string,
    @Query('contentType') contentType?: string,
    @Query('keyword') keyword?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ): Promise<ContentListResponse> {
    const pageNum = Math.max(1, Number(page) || 1);
    const sizeNum = Math.min(50, Math.max(1, Number(pageSize) || 10));
    return this.contentsService.list({
      status: status === '' ? undefined : status,
      contentType: contentType === '' ? undefined : contentType,
      keyword: keyword === '' ? undefined : keyword,
      page: pageNum,
      pageSize: sizeNum,
    });
  }

  @Get(':id')
  async getDetail(@Param('id') id: string): Promise<SocialContentDetail> {
    return this.contentsService.getDetail(id);
  }

  @NeedLogin()
  @Post()
  async create(@Body() dto: CreateContentDto): Promise<SocialContent> {
    return this.contentsService.create(dto);
  }

  @NeedLogin()
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateContentDto,
  ): Promise<SocialContent> {
    return this.contentsService.update(id, dto);
  }

  @NeedLogin()
  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string): Promise<void> {
    await this.contentsService.remove(id);
  }

  @NeedLogin()
  @Put(':id/variants')
  async saveVariants(
    @Param('id') id: string,
    @Body() dto: SaveVariantsDto,
  ): Promise<void> {
    await this.contentsService.saveVariants(id, dto);
  }
}
