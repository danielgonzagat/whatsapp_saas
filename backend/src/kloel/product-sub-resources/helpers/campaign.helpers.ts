import { LooseObject, parseObject, safeStr, toStringList } from './common.helpers';

export interface CampaignMetrics {
  sentCount: number;
  deliveredCount: number;
  readCount: number;
  failedCount: number;
  repliedCount: number;
  convertedCount: number;
  conversionRate: number;
  totalSpentCents: number;
  revenueCents: number;
  roas: number;
}

export interface AdAlertContext {
  workspaceId: string;
  ruleId: string;
  ruleName: string;
  campaignBudgetExhausted: boolean;
  metric: CampaignMetrics;
  threshold: string;
  windowHours: number;
  campaign: string;
}

export function buildCampaignMetrics(stats: LooseObject): CampaignMetrics {
  const sent = Number(stats.sent || 0);
  const delivered = Number(stats.delivered || 0);
  const read = Number(stats.read || 0);
  const failed = Number(stats.failed || 0);
  const replied = Number(stats.replied || 0);
  const converted = Number(stats.converted || 0);
  const conversionRate = delivered > 0 ? converted / delivered : 0;
  const totalSpentCents = Number(stats.totalSpentCents || 0);
  const revenueCents = Number(stats.revenueCents || 0);
  const roas = totalSpentCents > 0 ? revenueCents / totalSpentCents : 0;

  return {
    sentCount: sent,
    deliveredCount: delivered,
    readCount: read,
    failedCount: failed,
    repliedCount: replied,
    convertedCount: converted,
    conversionRate,
    totalSpentCents,
    revenueCents,
    roas,
  };
}

export function findLinkedCampaignForProductCampaign(
  campaigns: LooseObject[],
  productCampaign: LooseObject,
) {
  return (
    campaigns.find((campaign) => {
      const filters = parseObject(campaign.filters);
      return (
        filters.productCampaignId === productCampaign.id ||
        filters.productCampaignCode === productCampaign.code
      );
    }) || null
  );
}

export function buildDefaultCampaignMessage(product: LooseObject) {
  const productName = safeStr(product.name, 'esta oferta').trim();
  return [
    'Olá {{name}}, separei uma oportunidade especial para ',
    productName,
    '. Responda esta mensagem e eu envio os detalhes e o link certo para você agora.',
  ].join('');
}

export function serializeProductCampaignRecord(
  productCampaign: LooseObject,
  linkedCampaign?: LooseObject | null,
) {
  const filters = parseObject(linkedCampaign?.filters);
  const stats = parseObject(linkedCampaign?.stats);

  return {
    ...productCampaign,
    linkedCampaignId: linkedCampaign?.id || null,
    status: linkedCampaign?.status || 'DRAFT',
    scheduledAt: linkedCampaign?.scheduledAt || null,
    messageTemplate: linkedCampaign?.messageTemplate || '',
    aiStrategy: linkedCampaign?.aiStrategy || 'BALANCED',
    tags: toStringList(filters.tags),
    smartTime: Boolean(filters.smartTime),
    sentCount: Number(stats.sent || 0),
    deliveredCount: Number(stats.delivered || 0),
    readCount: Number(stats.read || 0),
    failedCount: Number(stats.failed || 0),
    repliedCount: Number(stats.replied || 0),
  };
}
