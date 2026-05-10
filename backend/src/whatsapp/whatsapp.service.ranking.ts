import { resolveTimestampExt } from './whatsapp-service.helpers';

interface ProbabilisticEntry {
  purchaseProbabilityScore: number;
  leadScore: number;
  lastConversationAt: string | null;
}

export function rankByPurchaseProbability<T extends ProbabilisticEntry>(entries: T[]): T[] {
  return [...entries].sort((a, b) => {
    if (a.purchaseProbabilityScore !== b.purchaseProbabilityScore)
      return b.purchaseProbabilityScore - a.purchaseProbabilityScore;
    if (a.leadScore !== b.leadScore) return b.leadScore - a.leadScore;
    return (
      resolveTimestampExt({ createdAt: b.lastConversationAt }) -
      resolveTimestampExt({ createdAt: a.lastConversationAt })
    );
  });
}
