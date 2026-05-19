export type GuestCheckSettings = {
  guestMode?: boolean;
  anonymousGuest?: boolean;
  workspaceMode?: string;
  authMode?: string;
  auth?: { anonymous?: boolean };
};

export function safeStr(v: unknown, fb = ''): string {
  return typeof v === 'string'
    ? v
    : typeof v === 'number' || typeof v === 'boolean'
      ? String(v)
      : fb;
}

export const CATCHUP_SWEEP_LIMIT = Math.max(
  1,
  Math.min(2000, Number.parseInt(process.env.WAHA_CATCHUP_SWEEP_LIMIT || '500', 10) || 500),
);

export const CATCHUP_LOCK_TTL_SECONDS = 180;

export const CATCHUP_MIN_TRIGGER_INTERVAL_SECONDS = Math.max(
  15,
  Number.parseInt(process.env.WAHA_CATCHUP_MIN_TRIGGER_INTERVAL_SECONDS || '60', 10) || 60,
);

export const CATCHUP_MAX_CHATS = Math.max(
  1,
  Number.parseInt(process.env.WAHA_CATCHUP_MAX_CHATS || '1000', 10) || 1000,
);

export const CATCHUP_MAX_MESSAGES_PER_CHAT = Math.max(
  1,
  Number.parseInt(process.env.WAHA_CATCHUP_MAX_MESSAGES_PER_CHAT || '100', 10) || 100,
);

const CATCHUP_LOOKBACK_MS = Math.max(
  60_000,
  Number.parseInt(process.env.WAHA_CATCHUP_LOOKBACK_MS || `${12 * 60 * 60 * 1000}`, 10) ||
    12 * 60 * 60 * 1000,
);

export const CATCHUP_FIRST_RUN_LOOKBACK_MS = Math.max(
  CATCHUP_LOOKBACK_MS,
  Number.parseInt(
    process.env.WAHA_CATCHUP_FIRST_RUN_LOOKBACK_MS || `${30 * 24 * 60 * 60 * 1000}`,
    10,
  ) || 30 * 24 * 60 * 60 * 1000,
);

export const CATCHUP_MAX_PASSES = Math.max(
  1,
  Number.parseInt(process.env.WAHA_CATCHUP_MAX_PASSES || '5', 10) || 5,
);

export const CATCHUP_MAX_PAGES_PER_CHAT = Math.max(
  1,
  Number.parseInt(process.env.WAHA_CATCHUP_MAX_PAGES_PER_CHAT || '10', 10) || 10,
);

export const CATCHUP_FALLBACK_CHATS_PER_PASS = (() => {
  const p = Number.parseInt(process.env.WAHA_CATCHUP_FALLBACK_CHATS_PER_PASS || '100', 10);
  return Number.isFinite(p) ? p : 0;
})();

export const CATCHUP_INCLUDE_ZERO_UNREAD_ACTIVITY =
  String(process.env.WAHA_CATCHUP_INCLUDE_ZERO_UNREAD_ACTIVITY || 'true').toLowerCase() === 'true';

export const CATCHUP_FALLBACK_PAGES_PER_CHAT = Math.max(
  1,
  Number.parseInt(process.env.WAHA_CATCHUP_FALLBACK_PAGES_PER_CHAT || '2', 10) || 2,
);

export const CATCHUP_MARK_READ_WITHOUT_REPLY =
  String(process.env.WAHA_CATCHUP_MARK_READ_WITHOUT_REPLY || 'true')
    .trim()
    .toLowerCase() === 'true';

export const CATCHUP_LID_MAP_CACHE_TTL_MS = Math.max(
  60_000,
  Number.parseInt(process.env.WAHA_LID_MAP_CACHE_TTL_MS || '300000', 10) || 300_000,
);
