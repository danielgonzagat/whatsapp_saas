import {
  resolveTimestamp,
  normalizeJsonObject,
  normalizeProbabilityScore,
  normalizeDateValue,
} from './whatsapp.service.normalization.companion';

export type CatalogConversationSummary = {
  id: string;
  contactId: string;
  unreadCount: number | null;
  status: string | null;
  mode: string | null;
  lastMessageAt: Date | null;
};

export type CatalogContactEntry = {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  leadScore: number;
  sentiment: string;
  purchaseProbability: string;
  purchaseProbabilityScore: number;
  purchaseProbabilityPercent: number;
  buyerStatus: string;
  purchasedProduct: string | null;
  purchaseValue: number | null;
  purchaseReason: string | null;
  notPurchasedReason: string | null;
  nextBestAction: string | null;
  aiSummary: string | null;
  fullSummary: string | null;
  intent: string | null;
  remotePushName: string | null;
  demographics: {
    gender: string;
    ageRange: string;
    location: string;
    confidence: number;
  };
  preferences: string[];
  importantDetails: string[];
  probabilityReasons: string[];
  cataloged: boolean;
  catalogedAt: string | null;
  lastScoredAt: string | null;
  whatsappSavedAt: string | null;
  lastRemoteChatId: string | null;
  lastResolvedChatId: string | null;
  conversationCount: number;
  unreadCount: number;
  lastConversationAt: string | null;
  lastConversationStatus: string | null;
  lastConversationMode: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  latestRelevantTimestamp: number;
};

export function buildCatalogContactEntry(
  contact: {
    id: string;
    phone: string;
    name: string | null;
    email: string | null;
    leadScore: number | null;
    sentiment: string | null;
    purchaseProbability: string | null;
    nextBestAction: string | null;
    aiSummary: string | null;
    customFields: unknown;
    createdAt: Date | null;
    updatedAt: Date | null;
  },
  relatedConversations: CatalogConversationSummary[],
  resolveTrustedContactName: (phone: string, ...candidates: unknown[]) => string,
): CatalogContactEntry {
  const customFields = normalizeJsonObject(contact.customFields);

  const lastConversation = relatedConversations[0] || null;
  const lastConversationAt =
    normalizeDateValue(resolveTimestamp, lastConversation?.lastMessageAt) || null;
  const unreadCount = relatedConversations.reduce(
    (sum, conversation) => sum + Math.max(0, Number(conversation?.unreadCount || 0) || 0),
    0,
  );
  const catalogedAt = normalizeDateValue(resolveTimestamp, customFields.catalogedAt);
  const lastScoredAt = normalizeDateValue(resolveTimestamp, customFields.lastScoredAt);
  const whatsappSavedAt = normalizeDateValue(resolveTimestamp, customFields.whatsappSavedAt);
  const remotePushName =
    typeof customFields.remotePushName === 'string' ? customFields.remotePushName : null;
  const lastRemoteChatId =
    typeof customFields.lastRemoteChatId === 'string' ? customFields.lastRemoteChatId : null;
  const lastResolvedChatId =
    typeof customFields.lastResolvedChatId === 'string' ? customFields.lastResolvedChatId : null;
  const purchaseProbabilityScore = normalizeProbabilityScore(
    customFields.purchaseProbabilityScore,
    contact.purchaseProbability,
  );
  const purchaseProbabilityPercent = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        Number(customFields.purchaseProbabilityPercent ?? purchaseProbabilityScore * 100) || 0,
      ),
    ),
  );
  const probabilityReasons = Array.isArray(customFields.probabilityReasons)
    ? customFields.probabilityReasons
        .map((reason: unknown) => (typeof reason === 'string' ? reason : '').trim())
        .filter(Boolean)
    : [];
  const preferences = Array.isArray(customFields.preferences)
    ? customFields.preferences
        .map((item: unknown) => (typeof item === 'string' ? item : '').trim())
        .filter(Boolean)
    : [];
  const importantDetails = Array.isArray(customFields.importantDetails)
    ? customFields.importantDetails
        .map((item: unknown) => (typeof item === 'string' ? item : '').trim())
        .filter(Boolean)
    : [];
  const demographicsFields = normalizeJsonObject(customFields.demographics);
  const demographics =
    Object.keys(demographicsFields).length > 0
      ? {
          gender:
            typeof demographicsFields.gender === 'string' ? demographicsFields.gender : 'UNKNOWN',
          ageRange:
            typeof demographicsFields.ageRange === 'string'
              ? demographicsFields.ageRange
              : 'UNKNOWN',
          location:
            typeof demographicsFields.location === 'string'
              ? demographicsFields.location
              : 'UNKNOWN',
          confidence: Math.max(0, Math.min(1, Number(demographicsFields.confidence || 0) || 0)),
        }
      : {
          gender: 'UNKNOWN',
          ageRange: 'UNKNOWN',
          location: 'UNKNOWN',
          confidence: 0,
        };
  const rawBuyerStatus =
    typeof customFields.buyerStatus === 'string'
      ? customFields.buyerStatus.trim().toUpperCase()
      : '';
  const buyerStatus = ['BOUGHT', 'NOT_BOUGHT', 'UNKNOWN'].includes(rawBuyerStatus)
    ? rawBuyerStatus
    : 'UNKNOWN';
  const cataloged =
    !!catalogedAt ||
    !!lastScoredAt ||
    !!whatsappSavedAt ||
    !!String(contact.aiSummary || '').trim() ||
    probabilityReasons.length > 0 ||
    Number.isFinite(Number(customFields.purchaseProbabilityScore));

  const latestRelevantTimestamp = Math.max(
    resolveTimestamp({ createdAt: lastConversationAt }),
    resolveTimestamp({ createdAt: catalogedAt }),
    resolveTimestamp({ createdAt: lastScoredAt }),
    resolveTimestamp({ createdAt: contact.updatedAt }),
  );

  return {
    id: contact.id,
    phone: contact.phone,
    name: resolveTrustedContactName(contact.phone, remotePushName, contact.name) || null,
    email: contact.email || null,
    leadScore: Math.max(0, Number(contact.leadScore || 0) || 0),
    sentiment: contact.sentiment || 'NEUTRAL',
    purchaseProbability: contact.purchaseProbability || 'LOW',
    purchaseProbabilityScore,
    purchaseProbabilityPercent,
    buyerStatus,
    purchasedProduct:
      typeof customFields.purchasedProduct === 'string' ? customFields.purchasedProduct : null,
    purchaseValue: Number.isFinite(Number(customFields.purchaseValue))
      ? Number(customFields.purchaseValue)
      : null,
    purchaseReason:
      typeof customFields.purchaseReason === 'string' ? customFields.purchaseReason : null,
    notPurchasedReason:
      typeof customFields.notPurchasedReason === 'string' ? customFields.notPurchasedReason : null,
    nextBestAction: contact.nextBestAction || null,
    aiSummary: contact.aiSummary || null,
    fullSummary:
      typeof customFields.fullSummary === 'string'
        ? customFields.fullSummary
        : contact.aiSummary || null,
    intent: typeof customFields.intent === 'string' ? customFields.intent : null,
    remotePushName,
    demographics,
    preferences,
    importantDetails,
    probabilityReasons,
    cataloged,
    catalogedAt,
    lastScoredAt,
    whatsappSavedAt,
    lastRemoteChatId,
    lastResolvedChatId,
    conversationCount: relatedConversations.length,
    unreadCount,
    lastConversationAt,
    lastConversationStatus: lastConversation?.status || null,
    lastConversationMode: lastConversation?.mode || null,
    createdAt: contact.createdAt?.toISOString?.() || null,
    updatedAt: contact.updatedAt?.toISOString?.() || null,
    latestRelevantTimestamp,
  };
}

export function filterAndSortCatalogEntries(
  entries: CatalogContactEntry[],
  options: {
    onlyCataloged?: boolean;
    cutoff: number;
  },
): Omit<CatalogContactEntry, 'latestRelevantTimestamp'>[] {
  const { onlyCataloged, cutoff } = options;
  return entries
    .filter((entry) => {
      if (onlyCataloged && !entry.cataloged) {
        return false;
      }
      return entry.latestRelevantTimestamp >= cutoff;
    })
    .sort((a, b) => {
      const catalogTimestampA = Math.max(
        resolveTimestamp({ createdAt: a.catalogedAt }),
        resolveTimestamp({ createdAt: a.lastScoredAt }),
      );
      const catalogTimestampB = Math.max(
        resolveTimestamp({ createdAt: b.catalogedAt }),
        resolveTimestamp({ createdAt: b.lastScoredAt }),
      );
      if (catalogTimestampA !== catalogTimestampB) {
        return catalogTimestampB - catalogTimestampA;
      }
      if (a.purchaseProbabilityScore !== b.purchaseProbabilityScore) {
        return b.purchaseProbabilityScore - a.purchaseProbabilityScore;
      }
      return b.latestRelevantTimestamp - a.latestRelevantTimestamp;
    })
    .map(({ latestRelevantTimestamp: _latestRelevantTimestamp, ...entry }) => entry);
}
