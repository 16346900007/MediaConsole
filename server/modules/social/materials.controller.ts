import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { NeedLogin } from '@lark-apaas/fullstack-nestjs-core';
import type {
  MaterialGroup,
  MaterialItem,
  MaterialListResponse,
  MaterialUsageResponse,
} from '@shared/api.interface';
import { MaterialsService } from './materials.service';
import {
  CreateGroupDto,
  CreateMaterialDto,
  MaterialBatchDeleteDto,
  MaterialBatchMoveDto,
  UpdateGroupDto,
  UpdateMaterialDto,
} from './materials.dto';

@Controller('api/social/materials')
export class MaterialsController {
  constructor(private readonly materialsService: MaterialsService) {}

  @Get()
  async listMaterials(
    @Query('type') type?: string,
    @Query('group') group?: string,
    @Query('keyword') keyword?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ): Promise<MaterialListResponse> {
    const pageNum = page ? parseInt(page, 10) : 1;
    const size = pageSize ? parseInt(pageSize, 10) : 12;
    return this.materialsService.listMaterials({
      type,
      group,
      keyword,
      page: pageNum,
      pageSize: size,
    });
  }

  @Get('groups')
  async listGroups(): Promise<MaterialGroup[]> {
    return this.materialsService.listGroups();
  }

  @Get('usage')
  async getUsage(): Promise<MaterialUsageResponse> {
    return this.materialsService.getUsage();
  }

  @NeedLogin()
  @Post()
  async createMaterial(
    @Body() dto: CreateMaterialDto,
  ): Promise<MaterialItem> {
    return this.materialsService.createMaterial(dto);
  }

  @NeedLogin()
  @Patch(':id')
  async updateMaterial(
    @Param('id') id: string,
    @Body() dto: UpdateMaterialDto,
  ): Promise<MaterialItem> {
    return this.materialsService.updateMaterial(id, dto);
  }

  @NeedLogin()
  @Delete(':id')
  async deleteMaterial(@Param('id') id: string): Promise<void> {
    return this.materialsService.deleteMaterial(id);
  }

  @NeedLogin()
  @Post('batch-delete')
  async batchDelete(
    @Body() dto: MaterialBatchDeleteDto,
  ): Promise<void> {
    return this.materialsService.batchDelete(dto);
  }

  @NeedLogin()
  @Post('batch-move')
  async batchMove(@Body() dto: MaterialBatchMoveDto): Promise<void> {
    return this.materialsService.batchMove(dto);
  }

  @NeedLogin()
  @Post('groups')
  async createGroup(@Body() dto: CreateGroupDto): Promise<void> {
    return this.materialsService.createGroup(dto.name);
  }

  @NeedLogin()
  @Patch('groups/:name')
  async renameGroup(
    @Param('name') name: string,
    @Body() dto: UpdateGroupDto,
  ): Promise<void> {
    return this.materialsService.renameGroup(name, dto.name);
  }

  @NeedLogin()
  @Delete('groups/:name')
  async deleteGroup(@Param('name') name: string): Promise<void> {
    return this.materialsService.deleteGroup(name);
  }
}
