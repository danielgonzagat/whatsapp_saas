import { LooseObject, parseObject, safeStr, toStringList } from './common.helpers';

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
