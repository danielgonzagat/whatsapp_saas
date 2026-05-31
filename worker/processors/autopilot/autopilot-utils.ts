import { redis } from '../../redis-client';
import { prisma } from '../../db';
import { WorkerLogger } from '../../logger';

import { type UnknownRecord } from './autopilot-types';
import { normalizeMatchableText, messageMatchesProductText } from './autopilot-utils.helpers';

export const log = new WorkerLogger('autopilot');

// Pure helpers live in `./autopilot-utils.helpers` so they can be unit-tested
// in isolation. They are re-exported here to preserve the historical import
// surface (`from './autopilot-utils'`).
export {
  countReplyWords,
  isRecentLiveConversation,
  normalizeAction,
  isAutonomousEnabled,
  isCiaAutonomyMode,
  isExplicitProactiveOutreachAllowed,
  isCiaProactiveCycleEnabled,
  normalizeMatchableText,
  messageMatchesProductText,
  normalizeJsonObject,
  extractFirstJsonObject,
  scoreToProbabilityBucket,
} from './autopilot-utils.helpers';

export async function findWorkspaceProductMatches(
  workspaceId: string,
  messageContent: string,
): Promise<string[]> {
  const normalizedMessage = normalizeMatchableText(messageContent);
  if (!normalizedMessage) {
    return [];
  }

  const [products, memoryProducts] = await Promise.all([
    prisma.product.findMany({
      where: { workspaceId, active: true },
      select: { name: true, description: true },
      take: 50,
    }),
    prisma.kloelMemory.findMany({
      where: {
        workspaceId,
        OR: [{ type: 'product' }, { category: 'products' }],
      },
      select: { value: true },
      take: 50,
    }),
  ]);

  const candidates = [
    ...products.flatMap((product: UnknownRecord) => [
      { label: product.name, matchText: product.name },
      { label: product.name, matchText: product.description },
    ]),
    ...memoryProducts.flatMap((memory: UnknownRecord) => [
      { label: memory?.value?.name, matchText: memory?.value?.name },
      { label: memory?.value?.name, matchText: memory?.value?.description },
    ]),
  ];

  return Array.from(
    new Set(
      candidates
        .filter(({ label, matchText }) => {
          return Boolean(
            label && messageMatchesProductText(normalizedMessage, String(matchText || '')),
          );
        })
        .map(({ label }) => String(label)),
    ),
  );
}

export async function reportSmokeTest(
  smokeTestId: string | undefined,
  payload: Record<string, unknown>,
) {
  if (!smokeTestId) {
    return;
  }
  await redis.set(
    `autopilot:smoke:${smokeTestId}`,
    JSON.stringify({
      smokeTestId,
      updatedAt: new Date().toISOString(),
      ...payload,
    }),
    'EX',
    300,
  );
}
