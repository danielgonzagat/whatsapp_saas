import { extractAsciiDigits } from '../../../common/phone/phone-normalization.util';
import { readText } from '../../../common/utils';

/**
 * Strip non-digit characters from a WhatsApp number string.
 *
 * Thin wrapper over the canonical {@link extractAsciiDigits}; kept under
 * the WhatsApp-channel-namespaced name to preserve the legacy DI surface
 * that `WhatsappService` / `WhatsappSessionService` / `WhatsappMediaService`
 * pass into their chat backlog/reconciler helpers.
 *
 * @see backend/src/common/phone/phone-normalization.util.ts
 * @see docs/architecture/DEPRECATION_MAP.md (phone normalization row)
 */
export function normalizeNumber(num: string): string {
  return extractAsciiDigits(num);
}

export function normalizeJsonObjExt(value: unknown): Record<string, unknown> {
  if (!value) {
    return {};
  }
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
    return {};
  }
  if (typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export function resolveTimestampExt(value: unknown): number {
  const v = value as Record<string, unknown> | undefined;
  const vChat = v?._chat as Record<string, unknown> | undefined;
  const vLm = v?.lastMessage as Record<string, unknown> | undefined;
  const vLmd = vLm?._data as Record<string, unknown> | undefined;
  for (const c of [
    vChat?.conversationTimestamp,
    vChat?.lastMessageRecvTimestamp,
    v?.conversationTimestamp,
    v?.lastMessageRecvTimestamp,
    vLm?.timestamp,
    vLmd?.messageTimestamp,
    v?.timestamp,
    v?.t,
    v?.createdAt,
    v?.lastMessageTimestamp,
    v?.last_time,
  ]) {
    if (typeof c === 'number' && Number.isFinite(c)) {
      return c > 1e12 ? c : c * 1000;
    }
    if (typeof c === 'string') {
      const n = Number(c);
      if (Number.isFinite(n) && n > 0) {
        return n > 1e12 ? n : n * 1000;
      }
      const d = new Date(c);
      if (!Number.isNaN(d.getTime())) {
        return d.getTime();
      }
    }
  }
  return 0;
}

export function toIsoTimestamp(timestamp: number): string | null {
  if (!timestamp || !Number.isFinite(timestamp)) {
    return null;
  }
  return new Date(timestamp).toISOString();
}

export function normalizeProbabilityScoreExt(score: unknown, bucket?: string | null): number {
  const numeric = Number(score);
  if (Number.isFinite(numeric)) {
    return Math.max(0, Math.min(1, Number(numeric.toFixed(3))));
  }
  switch (
    String(bucket || '')
      .trim()
      .toUpperCase()
  ) {
    case 'VERY_HIGH':
      return 0.95;
    case 'HIGH':
      return 0.8;
    case 'MEDIUM':
      return 0.5;
    case 'LOW':
      return 0.15;
    default:
      return 0;
  }
}

export function isAutonomousEnabledExt(settings: Record<string, unknown>): boolean {
  const autonomy = normalizeJsonObjExt(settings.autonomy);
  const autopilot = normalizeJsonObjExt(settings.autopilot);
  const mode = readText(autonomy.mode).toUpperCase();
  if (mode) {
    return mode === 'LIVE' || mode === 'BACKLOG' || mode === 'FULL';
  }
  return autopilot.enabled === true;
}

export function normalizeHashExt(text: string): string {
  return Buffer.from(text || '')
    .toString('base64')
    .slice(0, 32);
}
