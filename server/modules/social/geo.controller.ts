import { Controller, Get, Query } from '@nestjs/common';
import { NeedLogin } from '@lark-apaas/fullstack-nestjs-core';
import type { GeoPlace } from '@shared/api.interface';
import { GeoService } from './geo.service';

@Controller('api/social/geo')
export class GeoController {
  constructor(private readonly geoService: GeoService) {}

  /** 高德关键词联想地址/POI（发布页「位置」字段） */
  @NeedLogin()
  @Get('place')
  searchPlaces(
    @Query('keywords') keywords: string,
    @Query('city') city?: string,
  ): Promise<GeoPlace[]> {
    return this.geoService.searchPlaces(keywords ?? '', city);
  }
}
