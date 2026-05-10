import { prisma } from '../../db';
import { unifiedWhatsAppProvider as whatsappApiProvider } from '../../providers/unified-whatsapp-provider';
import { resolveCatalogChatActivityTimestamp } from './identity-resolve';
import { normalizeJsonObject, type UnknownRecord, CIA_CONTACT_CATALOG_LOOKBACK_DAYS, CIA_CONTACT_SCORE_MESSAGE_LIMIT } from './shared';
import { buildHeuristicCatalogScore, maybeScoreContactWithAi } from './opportunity';

export async function runScoreContact(data: UnknownRecord) {
  const workspaceId = String(data?.workspaceId || '').trim();
  const contactId = String(data?.contactId || '').trim();
  if (!workspaceId || !contactId) {
    return { scored: false, reason: 'missing_input' };
  }

  const cutoff = new Date(Date.now() - CIA_CONTACT_CATALOG_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    include: {
      deals: {
        where: { status: 'WON' },
        orderBy: { updatedAt: 'desc' },
        take: 3,
        select: {
          title: true,
          value: true,
          status: true,
          updatedAt: true,
        },
      },
      messages: {
        where: { createdAt: { gte: cutoff } },
        orderBy: { createdAt: 'desc' },
        take: CIA_CONTACT_SCORE_MESSAGE_LIMIT,
        select: {
          direction: true,
          content: true,
          createdAt: true,
        },
      },
      conversations: {
        where: { workspaceId },
        select: {
          unreadCount: true,
          lastMessageAt: true,
        },
        orderBy: { lastMessageAt: 'desc' },
        take: 1,
      },
    },
  });

  if (!contact) {
    return { scored: false, reason: 'contact_missing' };
  }

  let messages = [...(contact.messages || [])]
    .map((message) => ({
      direction: String(message.direction || '').toUpperCase(),
      content: String(message.content || '').trim(),
      createdAt: message.createdAt,
    }))
    .filter((message) => message.content)
    .sort(
      (left: UnknownRecord, right: UnknownRecord) =>
        new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
    );

  if (messages.length < 4 && data?.chatId) {
    const remoteMessages = await whatsappApiProvider
      .getChatMessages(workspaceId, String(data.chatId), {
        limit: CIA_CONTACT_SCORE_MESSAGE_LIMIT,
        offset: 0,
        downloadMedia: false,
      })
      .catch(() => []);
    if (remoteMessages.length) {
      messages = (remoteMessages as UnknownRecord[])
        .map((message: UnknownRecord) => ({
          direction:
            message?.fromMe === true ||
            message?.key?.fromMe === true ||
            message?.id?.fromMe === true
              ? 'OUTBOUND'
              : 'INBOUND',
          content: String(message?.body || message?.text?.body || message?.caption || '').trim(),
          createdAt:
            resolveCatalogChatActivityTimestamp(message) > 0
              ? new Date(resolveCatalogChatActivityTimestamp(message))
              : new Date(),
        }))
        .filter((message) => message.content)
        .sort(
          (left: UnknownRecord, right: UnknownRecord) =>
            new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
        );
    }
  }

  const history = messages
    .map((message) => `[${message.direction}] ${String(message.content || '').slice(0, 500)}`)
    .join('\n');
  const unreadCount = Number(contact.conversations?.[0]?.unreadCount || 0) || 0;
  const latestWonDeal = Array.isArray((contact as UnknownRecord).deals)
    ? (contact as UnknownRecord).deals?.[0]
    : null;
  const heuristic = buildHeuristicCatalogScore({
    joinedText: history,
    messages,
    unreadCount,
    optedOutAt: contact.optedOutAt,
    wonDealTitle: latestWonDeal?.title || null,
    wonDealValue: latestWonDeal?.value || null,
  });
  const aiScore = await maybeScoreContactWithAi({
    contactName: contact.name,
    phone: contact.phone,
    history,
    wonDealTitle: latestWonDeal?.title || null,
    wonDealValue: latestWonDeal?.value || null,
  });
  const score = aiScore || heuristic;
  const probabilityScore = Math.max(
    0,
    Math.min(1, Number(score.purchaseProbabilityScore || score.leadScore / 100) || 0),
  );
  const probabilityPercent = Math.max(
    0,
    Math.min(
      100,
      Math.round(Number(score.purchaseProbabilityPercent || probabilityScore * 100) || 0),
    ),
  );
  const compressedSummary = [
    `Contato: ${contact.name || contact.phone}`,
    `Status do cliente: ${score.buyerStatus}`,
    `Score: ${score.leadScore}/100`,
    score.buyerStatus === 'BOUGHT'
      ? `Probabilidade de recompra: ${score.purchaseProbability} (${probabilityPercent}%)`
      : `Probabilidade de compra: ${score.purchaseProbability} (${probabilityPercent}%)`,
    score.buyerStatus === 'BOUGHT'
      ? `Compra identificada: ${score.purchasedProduct || latestWonDeal?.title || 'produto não identificado'}`
      : null,
    score.purchaseValue ? `Valor pago: ${score.purchaseValue}` : null,
    `Intenção: ${score.intent}`,
    `Sentimento: ${score.sentiment}`,
    `Perfil inferido: ${score.demographics.gender}, ${score.demographics.ageRange}, ${score.demographics.location} (confiança ${Math.round(
      (Number(score.demographics.confidence || 0) || 0) * 100,
    )}%)`,
    `Próxima ação: ${score.nextBestAction}`,
    `Resumo: ${score.summary}`,
    score.purchaseReason ? `Motivo da compra: ${score.purchaseReason}` : null,
    score.notPurchasedReason ? `Motivo de não compra: ${score.notPurchasedReason}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const existingCustomFields = normalizeJsonObject(contact.customFields);
  await prisma.contact.updateMany({
    where: { id: contact.id, workspaceId },
    data: {
      leadScore: score.leadScore,
      sentiment: score.sentiment,
      purchaseProbability: score.purchaseProbability,
      nextBestAction: score.nextBestAction,
      aiSummary: score.summary,
      customFields: {
        ...existingCustomFields,
        purchaseProbabilityScore: Number(probabilityScore.toFixed(3)),
        purchaseProbabilityPercent: probabilityPercent,
        probabilityReasons: score.reasons,
        catalogedAt: existingCustomFields.catalogedAt || new Date().toISOString(),
        lastScoredAt: new Date().toISOString(),
        lastScoredSource: aiScore ? 'ai_catalog_score' : 'heuristic_catalog_score',
        intent: score.intent,
        buyerStatus: score.buyerStatus,
        purchasedProduct: score.purchasedProduct || latestWonDeal?.title || null,
        purchaseValue:
          score.purchaseValue ||
          ((Number(latestWonDeal?.value || 0) || 0) > 0
            ? Number(Number(latestWonDeal?.value || 0).toFixed(2))
            : null),
        purchaseReason: score.purchaseReason,
        notPurchasedReason: score.notPurchasedReason,
        preferences: score.preferences,
        importantDetails: score.importantDetails,
        demographics: score.demographics,
        fullSummary: score.summary,
      },
    },
  });

  await prisma.kloelMemory.upsert({
    where: {
      workspaceId_key: {
        workspaceId,
        key: `compressed_context:${contact.id}`,
      },
    },
    update: {
      value: {
        contactId: contact.id,
        phone: contact.phone,
        summary: compressedSummary,
        score: score.leadScore,
        purchaseProbability: score.purchaseProbability,
        purchaseProbabilityScore: Number(probabilityScore.toFixed(3)),
        purchaseProbabilityPercent: probabilityPercent,
        intent: score.intent,
        nextBestAction: score.nextBestAction,
        buyerStatus: score.buyerStatus,
        purchasedProduct: score.purchasedProduct || latestWonDeal?.title || null,
        purchaseValue:
          score.purchaseValue ||
          ((Number(latestWonDeal?.value || 0) || 0) > 0
            ? Number(Number(latestWonDeal?.value || 0).toFixed(2))
            : null),
        source: aiScore ? 'ai_catalog_score' : 'heuristic_catalog_score',
      },
      category: 'compressed_context',
      type: 'contact_context',
      content: compressedSummary,
      metadata: {
        contactId: contact.id,
        phone: contact.phone,
        score: score.leadScore,
        purchaseProbability: score.purchaseProbability,
        purchaseProbabilityScore: Number(probabilityScore.toFixed(3)),
        purchaseProbabilityPercent: probabilityPercent,
        intent: score.intent,
        buyerStatus: score.buyerStatus,
        reason: data?.reason || 'catalog_job',
      },
    },
    create: {
      workspaceId,
      key: `compressed_context:${contact.id}`,
      category: 'compressed_context',
      type: 'contact_context',
      content: compressedSummary,
      value: {
        contactId: contact.id,
        phone: contact.phone,
        summary: compressedSummary,
        score: score.leadScore,
        purchaseProbability: score.purchaseProbability,
        purchaseProbabilityScore: Number(probabilityScore.toFixed(3)),
        purchaseProbabilityPercent: probabilityPercent,
        intent: score.intent,
        nextBestAction: score.nextBestAction,
        buyerStatus: score.buyerStatus,
        purchasedProduct: score.purchasedProduct || latestWonDeal?.title || null,
        purchaseValue:
          score.purchaseValue ||
          ((Number(latestWonDeal?.value || 0) || 0) > 0
            ? Number(Number(latestWonDeal?.value || 0).toFixed(2))
            : null),
        source: aiScore ? 'ai_catalog_score' : 'heuristic_catalog_score',
      },
      metadata: {
        contactId: contact.id,
        phone: contact.phone,
        score: score.leadScore,
        purchaseProbability: score.purchaseProbability,
        purchaseProbabilityScore: Number(probabilityScore.toFixed(3)),
        purchaseProbabilityPercent: probabilityPercent,
        intent: score.intent,
        buyerStatus: score.buyerStatus,
        reason: data?.reason || 'catalog_job',
      },
    },
  });

  return {
    scored: true,
    contactId: contact.id,
    leadScore: score.leadScore,
    purchaseProbability: score.purchaseProbability,
    purchaseProbabilityScore: Number(probabilityScore.toFixed(3)),
    purchaseProbabilityPercent: probabilityPercent,
    buyerStatus: score.buyerStatus,
  };
}
