import type { CatalogConversationSummary, WsDeps } from './whatsapp-service.types';
import {
  normalizeJsonObjExt,
  normalizeProbabilityScoreExt,
  resolveTimestampExt,
  toIsoTimestamp,
} from './whatsapp-service.helpers';

export async function collectCatalogContactEntriesExt(
  deps: Pick<WsDeps, 'prisma'> & { resolveName: (p: string, ...c: unknown[]) => string },
  workspaceId: string,
  options?: { days?: number; onlyCataloged?: boolean },
) {
  const days = Math.max(1, Math.min(365, Number(options?.days || 30) || 30));
  const onlyCataloged = options?.onlyCataloged !== false;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const [contacts, conversations] = await Promise.all([
    deps.prisma.contact.findMany({
      where: { workspaceId },
      orderBy: { updatedAt: 'desc' },
      take: 2000,
    }),
    deps.prisma.conversation.findMany({
      where: { workspaceId },
      select: {
        id: true,
        contactId: true,
        unreadCount: true,
        status: true,
        mode: true,
        lastMessageAt: true,
      },
      orderBy: { lastMessageAt: 'desc' },
      take: 4000,
    }),
  ]);
  const cbC = new Map<string, CatalogConversationSummary[]>();
  for (const c of conversations || []) {
    const items = cbC.get(c.contactId) || [];
    items.push(c);
    cbC.set(c.contactId, items);
  }
  const ndv = (v: unknown) => {
    const ts = resolveTimestampExt({ createdAt: v });
    return toIsoTimestamp(ts);
  };
  return (contacts || [])
    .map((contact) => {
      const cf = normalizeJsonObjExt(contact.customFields);
      const rcs = (cbC.get(contact.id) || [])
        .slice()
        .sort(
          (a, b) =>
            resolveTimestampExt({ createdAt: b.lastMessageAt }) -
            resolveTimestampExt({ createdAt: a.lastMessageAt }),
        );
      const lastC = rcs[0] || null;
      const lca = ndv(lastC?.lastMessageAt) || null;
      const ur = rcs.reduce((s, c) => s + Math.max(0, Number(c?.unreadCount || 0) || 0), 0);
      const catAt = ndv(cf.catalogedAt);
      const scoredAt = ndv(cf.lastScoredAt);
      const waAt = ndv(cf.whatsappSavedAt);
      const rpn = typeof cf.remotePushName === 'string' ? cf.remotePushName : null;
      const lrcId = typeof cf.lastRemoteChatId === 'string' ? cf.lastRemoteChatId : null;
      const lrscId = typeof cf.lastResolvedChatId === 'string' ? cf.lastResolvedChatId : null;
      const pps = normalizeProbabilityScoreExt(
        cf.purchaseProbabilityScore,
        contact.purchaseProbability,
      );
      const ppp = Math.max(
        0,
        Math.min(100, Math.round(Number(cf.purchaseProbabilityPercent ?? pps * 100) || 0)),
      );
      const pReasons = Array.isArray(cf.probabilityReasons)
        ? cf.probabilityReasons
            .map((r: unknown) => (typeof r === 'string' ? r : '').trim())
            .filter(Boolean)
        : [];
      const pref = Array.isArray(cf.preferences)
        ? cf.preferences
            .map((i: unknown) => (typeof i === 'string' ? i : '').trim())
            .filter(Boolean)
        : [];
      const imp = Array.isArray(cf.importantDetails)
        ? cf.importantDetails
            .map((i: unknown) => (typeof i === 'string' ? i : '').trim())
            .filter(Boolean)
        : [];
      const dem = normalizeJsonObjExt(cf.demographics);
      const demographics =
        Object.keys(dem).length > 0
          ? {
              gender: typeof dem.gender === 'string' ? dem.gender : 'UNKNOWN',
              ageRange: typeof dem.ageRange === 'string' ? dem.ageRange : 'UNKNOWN',
              location: typeof dem.location === 'string' ? dem.location : 'UNKNOWN',
              confidence: Math.max(0, Math.min(1, Number(dem.confidence || 0) || 0)),
            }
          : { gender: 'UNKNOWN', ageRange: 'UNKNOWN', location: 'UNKNOWN', confidence: 0 };
      const rbs = typeof cf.buyerStatus === 'string' ? cf.buyerStatus.trim().toUpperCase() : '';
      const buyerStatus = ['BOUGHT', 'NOT_BOUGHT', 'UNKNOWN'].includes(rbs) ? rbs : 'UNKNOWN';
      const cataloged =
        !!catAt ||
        !!scoredAt ||
        !!waAt ||
        !!String(contact.aiSummary || '').trim() ||
        pReasons.length > 0 ||
        Number.isFinite(Number(cf.purchaseProbabilityScore));
      const lrt = Math.max(
        resolveTimestampExt({ createdAt: lca }),
        resolveTimestampExt({ createdAt: catAt }),
        resolveTimestampExt({ createdAt: scoredAt }),
        resolveTimestampExt({ createdAt: contact.updatedAt }),
      );
      return {
        id: contact.id,
        phone: contact.phone,
        name: deps.resolveName(contact.phone, rpn, contact.name) || null,
        email: contact.email || null,
        leadScore: Math.max(0, Number(contact.leadScore || 0) || 0),
        sentiment: contact.sentiment || 'NEUTRAL',
        purchaseProbability: contact.purchaseProbability || 'LOW',
        purchaseProbabilityScore: pps,
        purchaseProbabilityPercent: ppp,
        buyerStatus,
        purchasedProduct: typeof cf.purchasedProduct === 'string' ? cf.purchasedProduct : null,
        purchaseValue: Number.isFinite(Number(cf.purchaseValue)) ? Number(cf.purchaseValue) : null,
        purchaseReason: typeof cf.purchaseReason === 'string' ? cf.purchaseReason : null,
        notPurchasedReason:
          typeof cf.notPurchasedReason === 'string' ? cf.notPurchasedReason : null,
        nextBestAction: contact.nextBestAction || null,
        aiSummary: contact.aiSummary || null,
        fullSummary:
          typeof cf.fullSummary === 'string' ? cf.fullSummary : contact.aiSummary || null,
        intent: typeof cf.intent === 'string' ? cf.intent : null,
        remotePushName: rpn,
        demographics,
        preferences: pref,
        importantDetails: imp,
        probabilityReasons: pReasons,
        cataloged,
        catalogedAt: catAt,
        lastScoredAt: scoredAt,
        whatsappSavedAt: waAt,
        lastRemoteChatId: lrcId,
        lastResolvedChatId: lrscId,
        conversationCount: rcs.length,
        unreadCount: ur,
        lastConversationAt: lca,
        lastConversationStatus: lastC?.status || null,
        lastConversationMode: lastC?.mode || null,
        createdAt: contact.createdAt?.toISOString?.() || null,
        updatedAt: contact.updatedAt?.toISOString?.() || null,
        latestRelevantTimestamp: lrt,
      };
    })
    .filter((e) => {
      if (onlyCataloged && !e.cataloged) return false;
      return e.latestRelevantTimestamp >= cutoff;
    })
    .sort((a, b) => {
      const ca = Math.max(
        resolveTimestampExt({ createdAt: a.catalogedAt }),
        resolveTimestampExt({ createdAt: a.lastScoredAt }),
      );
      const cb = Math.max(
        resolveTimestampExt({ createdAt: b.catalogedAt }),
        resolveTimestampExt({ createdAt: b.lastScoredAt }),
      );
      if (ca !== cb) return cb - ca;
      if (a.purchaseProbabilityScore !== b.purchaseProbabilityScore)
        return b.purchaseProbabilityScore - a.purchaseProbabilityScore;
      return b.latestRelevantTimestamp - a.latestRelevantTimestamp;
    })
    .map(({ latestRelevantTimestamp: _, ...entry }) => entry);
}
