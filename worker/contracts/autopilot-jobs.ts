/**
 * Queue contract for critical Autopilot jobs shared between backend
 * producers and worker consumers. The file is mirrored in the worker
 * tree and CI enforces byte-for-byte equality.
 */

export const AUTOPILOT_SWEEP_UNREAD_CONVERSATIONS_JOB = 'sweep-unread-conversations';
/** Autopilot_backlog_modes. */
export const AUTOPILOT_BACKLOG_MODES = [
  'reply_all_recent_first',
  'reply_only_new',
  'prioritize_hot',
] as const;

/** Autopilot backlog mode type. */
export type AutopilotBacklogMode = (typeof AUTOPILOT_BACKLOG_MODES)[number];

/** Sweep unread conversations job input shape. */
export interface SweepUnreadConversationsJobInput {
  workspaceId: string;
  runId: string;
  limit?: number | null;
  mode?: AutopilotBacklogMode | null;
  triggeredBy?: string | null;
}

/** Sweep unread conversations job data shape. */
export interface SweepUnreadConversationsJobData {
  workspaceId: string;
  runId: string;
  limit: number;
  mode: AutopilotBacklogMode;
  triggeredBy?: string;
}

function asObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function coerceToRawString(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim();
  }
  return '';
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  const normalized = coerceToRawString(value);
  return normalized.length > 0 ? normalized : undefined;
}

function requireNonEmptyString(
  object: Record<string, unknown>,
  field: keyof SweepUnreadConversationsJobInput,
): string {
  const normalized = normalizeOptionalString(object[field]);
  if (!normalized) {
    throw new Error(`Missing required field "${String(field)}"`);
  }
  return normalized;
}

function normalizeLimit(value: unknown): number {
  const parsed = Number(value ?? 500);
  if (!Number.isFinite(parsed)) {
    return 500;
  }
  return Math.max(1, Math.min(2000, Math.trunc(parsed)));
}

function normalizeMode(value: unknown): AutopilotBacklogMode {
  const normalized = normalizeOptionalString(value);
  if (normalized && AUTOPILOT_BACKLOG_MODES.includes(normalized as AutopilotBacklogMode)) {
    return normalized as AutopilotBacklogMode;
  }
  return 'reply_all_recent_first';
}

/** Parse sweep unread conversations job data. */
export function parseSweepUnreadConversationsJobData(
  value: unknown,
): SweepUnreadConversationsJobData {
  const input = asObject(value, AUTOPILOT_SWEEP_UNREAD_CONVERSATIONS_JOB);
  const workspaceId = requireNonEmptyString(input, 'workspaceId');
  const runId = requireNonEmptyString(input, 'runId');
  const limit = normalizeLimit(input.limit);
  const mode = normalizeMode(input.mode);
  const triggeredBy = normalizeOptionalString(input.triggeredBy);

  return triggeredBy
    ? { workspaceId, runId, limit, mode, triggeredBy }
    : { workspaceId, runId, limit, mode };
}

/** Build sweep unread conversations job data. */
export function buildSweepUnreadConversationsJobData(
  input: SweepUnreadConversationsJobInput,
): SweepUnreadConversationsJobData {
  return parseSweepUnreadConversationsJobData(input);
}
