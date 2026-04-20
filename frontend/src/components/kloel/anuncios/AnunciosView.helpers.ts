// Pure helpers extracted from AnunciosView.tsx to reduce cyclomatic
// complexity on the Meta-data hydration useEffects. Behaviour is
// byte-identical to the original inline implementation.

export interface PlatformMetrics {
  /** Spend property. */
  spend: number;
  /** Revenue property. */
  revenue: number;
  /** Roas property. */
  roas: number;
  /** Conversions property. */
  conversions: number;
  /** Impressions property. */
  impressions: number;
  /** Clicks property. */
  clicks: number;
  /** Ctr property. */
  ctr: number;
  /** Cpc property. */
  cpc: number;
  /** Connected property. */
  connected: boolean;
}

type InsightData = Record<string, unknown>;

function parseFloatOrZero(raw: unknown): number {
  return Number.parseFloat(String(raw ?? '0')) || 0;
}

function parseIntOrZero(raw: unknown): number {
  return Number.parseInt(String(raw ?? '0'), 10) || 0;
}

function pickFirstInsight(metaInsights: Record<string, unknown>): InsightData {
  const data = (metaInsights as { data?: unknown }).data;
  if (Array.isArray(data)) {
    return (data[0] as InsightData) ?? metaInsights;
  }
  return metaInsights as InsightData;
}

function computePurchaseRevenue(d: InsightData): number {
  const actionValues = d.action_values as Array<Record<string, unknown>> | undefined;
  const purchase = actionValues?.find?.(
    (a) => a.action_type === 'offsite_conversion.fb_pixel_purchase',
  );
  const roasList = d.purchase_roas as Array<Record<string, unknown>> | undefined;
  const roasFirst = roasList?.[0];
  const valueSource = purchase?.value ?? roasFirst?.value ?? '0';
  const spendMultiplier = Number.parseFloat(String(d.spend ?? '1'));
  return (
    Number.parseFloat(String(valueSource)) *
    (Number.isFinite(spendMultiplier) ? spendMultiplier : 1)
  );
}

/** Extract meta platform metrics. */
export function extractMetaPlatformMetrics(metaInsights: Record<string, unknown>): PlatformMetrics {
  const d = pickFirstInsight(metaInsights);
  const roasList = d.purchase_roas as Array<Record<string, unknown>> | undefined;
  const actionsLen =
    typeof d.conversions !== 'undefined'
      ? d.conversions
      : ((d.actions as unknown[] | undefined)?.length ?? '0');
  return {
    connected: true,
    spend: parseFloatOrZero(d.spend),
    impressions: parseIntOrZero(d.impressions),
    clicks: parseIntOrZero(d.clicks),
    conversions: parseIntOrZero(actionsLen),
    ctr: parseFloatOrZero(d.ctr),
    cpc: parseFloatOrZero(d.cpc),
    revenue: computePurchaseRevenue(d),
    roas: parseFloatOrZero(roasList?.[0]?.value),
  };
}

/** Empty platform metrics. */
export function emptyPlatformMetrics(): PlatformMetrics {
  return {
    connected: false,
    spend: 0,
    revenue: 0,
    roas: 0,
    conversions: 0,
    impressions: 0,
    clicks: 0,
    ctr: 0,
    cpc: 0,
  };
}

/** Mapped campaign shape. */
export interface MappedCampaign {
  /** Id property. */
  id: string;
  /** Platform property. */
  platform: 'meta';
  /** Name property. */
  name: string;
  /** Status property. */
  status: string;
  /** Spend property. */
  spend: number;
  /** Revenue property. */
  revenue: number;
  /** Roas property. */
  roas: number;
  /** Conv property. */
  conv: number;
  /** Ctr property. */
  ctr: number;
  /** Cpc property. */
  cpc: number;
  /** Trend property. */
  trend: 'up' | 'down';
}

function pickInsightsList(c: Record<string, unknown>): Array<Record<string, unknown>> {
  const candidate = c.insights;
  if (
    candidate &&
    typeof candidate === 'object' &&
    Array.isArray((candidate as { data?: unknown[] }).data)
  ) {
    return (candidate as { data: Array<Record<string, unknown>> }).data;
  }
  return [];
}

function toArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

/** Map meta campaign. */
export function mapMetaCampaign(c: Record<string, unknown>): MappedCampaign {
  const id =
    typeof c.id === 'string' ? c.id : `campaign-${Math.random().toString(36).slice(2, 10)}`;
  const firstInsight = pickInsightsList(c)[0] || {};
  const actionValues = toArray<Record<string, unknown>>(firstInsight.action_values);
  const purchaseRoas = toArray<Record<string, unknown>>(firstInsight.purchase_roas);

  const purchase = actionValues.find(
    (a) => a.action_type === 'offsite_conversion.fb_pixel_purchase',
  );
  const statusLabel = String(c.status || c.effective_status || 'PAUSED').toLowerCase();
  const roasValue = Number.parseFloat(String(purchaseRoas[0]?.value || '0'));

  return {
    id,
    platform: 'meta',
    name: typeof c.name === 'string' ? c.name : `Campaign ${id}`,
    status: statusLabel === 'active' ? 'active' : 'paused',
    spend: Number.parseFloat(String(c.spend || firstInsight.spend || '0')),
    revenue: Number.parseFloat(String(purchase?.value || '0')),
    roas: roasValue,
    conv: Number.parseInt(String(firstInsight.conversions || '0'), 10),
    ctr: Number.parseFloat(String(firstInsight.ctr || '0')),
    cpc: Number.parseFloat(String(firstInsight.cpc || '0')),
    trend: roasValue > 1 ? 'up' : 'down',
  };
}

/** Extract meta campaigns from response. */
export function extractMetaCampaignsFromResponse(
  metaCampaigns: unknown,
): Array<Record<string, unknown>> {
  if (
    metaCampaigns &&
    typeof metaCampaigns === 'object' &&
    Array.isArray((metaCampaigns as { data?: unknown[] }).data)
  ) {
    return (metaCampaigns as { data: Array<Record<string, unknown>> }).data;
  }
  return Array.isArray(metaCampaigns) ? (metaCampaigns as Array<Record<string, unknown>>) : [];
}
