import { redis } from '../../redis-client';
import { prisma } from '../../db';
import { WorkerLogger } from '../../logger';

export const log = new WorkerLogger('autopilot');

export function countReplyWords(value?: string | null): number {
  const words = String(value || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return Math.max(1, words.length);
}

import { type QuotedCustomerMessage } from './autopilot-types';

export function isRecentLiveConversation(customerMessages: QuotedCustomerMessage[]): boolean {
  if (!Array.isArray(customerMessages) || customerMessages.length === 0) {
    return false;
  }

  const latestTimestamp = customerMessages
    .map((message) => {
      const value = message?.createdAt ? new Date(message.createdAt).getTime() : Number.NaN;
      return Number.isFinite(value) ? value : null;
    })
    .filter((value): value is number => typeof value === 'number')
    .sort((left, right) => right - left)[0];

  if (!latestTimestamp) {
    return false;
  }

  return Date.now() - latestTimestamp <= 24 * 60 * 60 * 1000;
}

export function normalizeAction(raw: string): string {
  const val = (raw || '').toUpperCase();
  const allowed = new Set([
    'SEND_OFFER',
    'SEND_PRICE',
    'SEND_CALENDAR',
    'HANDLE_OBJECTION',
    'TRANSFER_AGENT',
    'FOLLOW_UP',
    'FOLLOW_UP_STRONG',
    'ANTI_CHURN',
    'QUALIFY',
    'GHOST_CLOSER',
    'LEAD_UNLOCKER',
  ]);
  if (allowed.has(val)) {
    return val;
  }
  if (val === 'OFFER') {
    return 'SEND_OFFER';
  }
  if (val === 'OBJECTION') {
    return 'HANDLE_OBJECTION';
  }
  if (val === 'UPSELL') {
    return 'FOLLOW_UP';
  }
  return 'FOLLOW_UP';
}

import { type UnknownRecord } from './autopilot-types';

export function isAutonomousEnabled(settings: UnknownRecord): boolean {
  const mode = String(settings?.autonomy?.mode || '').toUpperCase();
  if (mode === 'LIVE' || mode === 'BACKLOG' || mode === 'FULL') {
    return true;
  }
  if (mode === 'HUMAN_ONLY' || mode === 'SUSPENDED') {
    return false;
  }
  if (mode === 'OFF') {
    return settings?.autopilot?.enabled === true;
  }
  if (mode) {
    return mode === 'LIVE' || mode === 'BACKLOG' || mode === 'FULL';
  }
  return settings?.autopilot?.enabled === true;
}

export function isCiaAutonomyMode(settings: UnknownRecord): boolean {
  const mode = String(settings?.autonomy?.mode || '').toUpperCase();
  return mode === 'LIVE' || mode === 'BACKLOG' || mode === 'FULL';
}

export function isExplicitProactiveOutreachAllowed(settings: UnknownRecord): boolean {
  const envGate = String(process.env.ALLOW_PROACTIVE_OUTREACH || 'false')
    .trim()
    .toLowerCase();

  if (!['true', '1', 'on', 'yes'].includes(envGate)) {
    return false;
  }

  return (
    settings?.autonomy?.proactiveEnabled === true || settings?.autopilot?.proactiveEnabled === true
  );
}

export function isCiaProactiveCycleEnabled(settings: UnknownRecord): boolean {
  if (!isExplicitProactiveOutreachAllowed(settings)) {
    return false;
  }

  const override = String(process.env.CIA_ENABLE_PROACTIVE_CYCLE || 'false')
    .trim()
    .toLowerCase();

  if (['true', '1', 'on', 'yes'].includes(override)) {
    return settings?.autonomy?.proactiveEnabled === true;
  }

  if (['false', '0', 'off', 'no'].includes(override)) {
    return false;
  }

  return settings?.autonomy?.proactiveEnabled === true;
}

import { DIACRITICS_RE, NON_ALNUM_SPACE_RE, WHITESPACE_G_RE } from './autopilot-types';

export function normalizeMatchableText(value: string): string {
  return (value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(DIACRITICS_RE, '')
    .replace(NON_ALNUM_SPACE_RE, ' ')
    .replace(WHITESPACE_G_RE, ' ')
    .trim();
}

export function messageMatchesProductText(normalizedMessage: string, candidateText: string): boolean {
  const normalizedCandidate = normalizeMatchableText(candidateText);
  if (!normalizedCandidate) {
    return false;
  }

  if (normalizedMessage.includes(normalizedCandidate)) {
    return true;
  }

  const keywords = normalizedCandidate.split(' ').filter((token) => token.length >= 4);

  return keywords.some((token) => normalizedMessage.includes(token));
}

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

export function normalizeJsonObject(value: unknown): UnknownRecord {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return { ...value };
  }
  return {};
}

import { S_S_RE } from './autopilot-types';

export function extractFirstJsonObject(raw: string): UnknownRecord | null {
  const text = String(raw || '').trim();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(S_S_RE);
    if (!match) {
      return null;
    }
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

export function scoreToProbabilityBucket(score: number): 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH' {
  if (score >= 85) {
    return 'VERY_HIGH';
  }
  if (score >= 65) {
    return 'HIGH';
  }
  if (score >= 40) {
    return 'MEDIUM';
  }
  return 'LOW';
}

export async function reportSmokeTest(smokeTestId: string | undefined, payload: Record<string, unknown>) {
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
