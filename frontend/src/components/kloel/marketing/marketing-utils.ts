import type { ChannelRealData } from './MarketingTypes';

interface RawProductLike {
  name?: string;
  title?: string;
  price?: number;
  amount?: number;
  sold?: number;
  quantitySold?: number;
  sales?: number;
  img?: string;
  emoji?: string;
  image?: string;
}

interface MappedProduct {
  name: string;
  price: number;
  sold: number;
  img: string;
}

export function mapTopProducts(rawProducts: unknown): MappedProduct[] {
  if (!rawProducts || !Array.isArray(rawProducts) || rawProducts.length === 0) {
    return [];
  }
  return (rawProducts as RawProductLike[]).slice(0, 3).map((p) => ({
    name: p.name || p.title || 'Produto',
    price: p.price ?? p.amount ?? 0,
    sold: p.sold ?? p.quantitySold ?? p.sales ?? 0,
    img: p.img || p.emoji || p.image || '\uD83D\uDCE6',
  }));
}

export function toChannelDataMap(realChannels: unknown): Record<string, ChannelRealData> {
  if (!realChannels || typeof realChannels !== 'object') {
    return {};
  }
  const map: Record<string, ChannelRealData> = {};
  for (const [key, val] of Object.entries(realChannels as Record<string, unknown>)) {
    if (val && typeof val === 'object') {
      map[key] = val as ChannelRealData;
    }
  }
  return map;
}

export function isBrainAvgResponseMeaningful(
  avgResponseTime: string | number | null | undefined,
): boolean {
  if (typeof avgResponseTime === 'number') {
    return avgResponseTime > 0;
  }
  if (typeof avgResponseTime === 'string') {
    const trimmed = avgResponseTime.trim();
    return trimmed !== '' && trimmed !== '--';
  }
  return false;
}
