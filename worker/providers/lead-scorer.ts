/**
 * @capability LeadScorer
 * @domain crm
 */
import { prisma } from '../db';

/**
 * Simplified lead scoring used in dev/test.
 * Computes a basic score from recent inbound activity and persists it on the contact.
 */
async function analyze(workspaceId: string, contactId: string) {
  const contact = await prisma.contact.findFirst({
    where: { id: contactId, workspaceId },
    include: {
      messages: {
        take: 20,
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  if (!contact) {
    return { leadScore: 0, sentiment: 'NEUTRAL' };
  }

  // Heuristic: recent inbound messages increase score
  const now = Date.now();
  let score = 0;
  for (const msg of contact.messages.filter((m) => m.direction === 'INBOUND')) {
    score += 5;
    const daysAgo = (now - msg.createdAt.getTime()) / (1000 * 3600 * 24);
    if (daysAgo < 1) {
      score += 10;
    } else if (daysAgo < 7) {
      score += 5;
    }
  }

  const leadScore = Math.max(0, Math.min(100, Math.round(score)));

  await prisma.contact.updateMany({
    where: { id: contactId, workspaceId },
    data: {
      leadScore,
      sentiment: contact.sentiment || 'NEUTRAL',
      purchaseProbability: contact.purchaseProbability || 'LOW',
    },
  });

  return { leadScore, sentiment: contact.sentiment || 'NEUTRAL' };
}

/** Lead scorer. */
export const LeadScorer = {
  analyze,
} as const;
