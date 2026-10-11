import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import type { GeoPlace } from '@shared/api.interface';

/** 高德输入提示 API：按关键词联想地址/POI */
const AMAP_INPUTTIPS_URL = 'https://restapi.amap.com/v3/assistant/inputtips';

@Injectable()
export class GeoService {
  private readonly logger = new Logger(GeoService.name);

  async searchPlaces(keywords: string, city?: string): Promise<GeoPlace[]> {
    const key = process.env.AMAP_KEY?.trim();
    if (!key) {
      throw new BadRequestException(
        '未配置高德 Key（env.local 设置 AMAP_KEY 后重启生效）',
      );
    }
    const kw = keywords.trim();
    if (!kw) return [];

    const params = new URLSearchParams({
      key,
      keywords: kw,
      city: city?.trim() || '',
      citylimit: 'false',
    });
    const resp = await fetch(`${AMAP_INPUTTIPS_URL}?${params.toString()}`, {
      headers: { Accept: 'application/json' },
    });
    if (!resp.ok) {
      this.logger.warn(`高德接口失败 status=${resp.status}`);
      throw new BadRequestException('位置服务暂时不可用，请稍后重试');
    }
    const data = (await resp.json()) as {
      status?: string;
      info?: string;
      tips?: Array<{
        id?: string;
        name?: string;
        address?: string;
        district?: string;
        adcode?: string;
        location?: string;
        typecode?: string;
      }>;
    };
    if (data.status !== '1') {
      this.logger.warn(`高德返回异常 info=${data.info}`);
      throw new BadRequestException(data.info || '位置搜索失败');
    }
    return (data.tips ?? []).map((t): GeoPlace => ({
      name: t.name ?? '',
      address: [t.address, t.district].filter(Boolean).join(' '),
      adcode: t.adcode ?? '',
      location: t.location ?? '',
      typecode: t.typecode ?? '',
    }));
  }
}
