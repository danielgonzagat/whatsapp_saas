/**
 * Pure helpers extracted from `worker/processors/autopilot/autopilot-utils.ts`
 * so they can be unit-tested in isolation. Behaviour is byte-identical to the
 * original inline implementations.
 *
 * Keep this module free of side effects: no Prisma, no Redis, no providers,
 * no logger, no module-level state. Every function here is deterministic over
 * its inputs (the proactive-cycle helpers read `process.env`, which is
 * deterministic per the value held in the env at call time and is therefore
 * safe to unit-test with explicit stubs).
 */

import {
  type QuotedCustomerMessage,
  type UnknownRecord,
  DIACRITICS_RE,
  NON_ALNUM_SPACE_RE,
  WHITESPACE_G_RE,
  S_S_RE,
} from './autopilot-types';

/**
 * Counts how many whitespace-separated words a reply contains. Returns at
 * least 1 so downstream metric/budget logic never divides by zero on empty
 * strings.
 */
export function countReplyWords(value?: string | null): number {
  const words = String(value || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return Math.max(1, words.length);
}

/**
 * Returns true when the most recent customer message in `customerMessages`
 * was within the last 24 hours. Tolerates missing/invalid timestamps by
 * skipping them. Returns false when the array is empty or only contains
 * unparseable timestamps.
 */
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

/**
 * Normalizes a free-form action string to the canonical autopilot action
 * vocabulary. Unknown values fall back to `'FOLLOW_UP'`.
 */
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

/**
 * Returns true when the workspace settings enable any autonomous mode (LIVE,
 * BACKLOG, FULL). HUMAN_ONLY and SUSPENDED always return false. OFF falls
 * back to the legacy `autopilot.enabled` flag.
 */
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

/**
 * Stricter sibling of {@link isAutonomousEnabled}: only LIVE / BACKLOG / FULL
 * count as a CIA autonomy mode. Anything else (including legacy
 * `autopilot.enabled`) returns false.
 */
export function isCiaAutonomyMode(settings: UnknownRecord): boolean {
  const mode = String(settings?.autonomy?.mode || '').toUpperCase();
  return mode === 'LIVE' || mode === 'BACKLOG' || mode === 'FULL';
}

/**
 * Gates explicit proactive outreach behind both the env-level
 * `ALLOW_PROACTIVE_OUTREACH` switch and a workspace-level setting. Both
 * must be true for the helper to return true.
 */
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

/**
 * Composes {@link isExplicitProactiveOutreachAllowed} with the
 * `CIA_ENABLE_PROACTIVE_CYCLE` env override. The override can either enable
 * the cycle (when `autonomy.proactiveEnabled` is true) or hard-disable it.
 */
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

/**
 * Diacritic-stripped lowercased token text used for product / keyword
 * matching. Returns an empty string when the input is empty after
 * normalization.
 */
export function normalizeMatchableText(value: string): string {
  return (value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(DIACRITICS_RE, '')
    .replace(NON_ALNUM_SPACE_RE, ' ')
    .replace(WHITESPACE_G_RE, ' ')
    .trim();
}

/**
 * True when `candidateText` (after normalization) appears either as a
 * substring of `normalizedMessage` or via any of its >=4-char keyword
 * tokens.
 */
export function messageMatchesProductText(
  normalizedMessage: string,
  candidateText: string,
): boolean {
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

/**
 * Returns a shallow copy when `value` is a plain object, otherwise an empty
 * record. Arrays and primitives map to `{}`.
 */
export function normalizeJsonObject(value: unknown): UnknownRecord {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return { ...value };
  }
  return {};
}

/**
 * Attempts to parse `raw` as JSON. When the input is wrapped in surrounding
 * text, falls back to extracting the first `{ ... }` block. Returns null
 * when no valid JSON object can be recovered.
 */
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

/**
 * Maps a 0-100 lead score to a discrete purchase-probability bucket.
 * Thresholds: 85+ VERY_HIGH, 65+ HIGH, 40+ MEDIUM, else LOW.
 */
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
