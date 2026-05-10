import { log } from './autopilot-utils';

const WORKER_ROLE = (process.env.WORKER_ROLE || 'all').toLowerCase();
export const SHOULD_RUN_AUTOPILOT_WORKER = WORKER_ROLE !== 'scheduler';

export const CONTACT_DAILY_LIMIT = Math.max(
  1,
  Number.parseInt(process.env.AUTOPILOT_CONTACT_DAILY_LIMIT || '5', 10) || 5,
);
export const WORKSPACE_DAILY_LIMIT = Math.max(
  1,
  Number.parseInt(process.env.AUTOPILOT_WORKSPACE_DAILY_LIMIT || '1000', 10) || 1000,
);
export const SILENCE_HOURS = Number.parseInt(process.env.AUTOPILOT_SILENCE_HOURS || '24', 10) || 24;
export const WINDOW_START = Number.parseInt(process.env.AUTOPILOT_WINDOW_START || '8', 10) || 8;
export const WINDOW_END = Number.parseInt(process.env.AUTOPILOT_WINDOW_END || '22', 10) || 22;
export const CYCLE_LIMIT = Number.parseInt(process.env.AUTOPILOT_CYCLE_LIMIT || '200', 10) || 200;
export const PENDING_MESSAGE_LIMIT = Math.max(
  1,
  Number.parseInt(process.env.AUTOPILOT_PENDING_MESSAGE_LIMIT || '12', 10) || 12,
);
export const SHARENON_DIGIT_REPLY_LOCK_MS = Math.max(
  60_000,
  Number.parseInt(process.env.AUTOPILOT_SHARENON_DIGIT_REPLY_LOCK_MS || '300000', 10) || 300_000,
);
export const CIA_MAIN_LOOP_LIMIT = Math.max(
  1,
  Number.parseInt(process.env.CIA_MAIN_LOOP_LIMIT || String(CYCLE_LIMIT), 10) || CYCLE_LIMIT,
);
export const CIA_MAX_ACTIONS_PER_CYCLE = Math.max(
  1,
  Math.min(10, Number.parseInt(process.env.CIA_MAX_ACTIONS_PER_CYCLE || '5', 10) || 5),
);
export const CIA_CONTACT_LOCK_TTL_SECONDS = Math.max(
  5,
  Number.parseInt(process.env.CIA_CONTACT_LOCK_TTL_SECONDS || '20', 10) || 20,
);
export const CIA_OPPORTUNITY_LOOKBACK_DAYS = Math.max(
  7,
  Number.parseInt(process.env.CIA_OPPORTUNITY_LOOKBACK_DAYS || '30', 10) || 30,
);
export const CIA_OPPORTUNITY_REFRESH_LIMIT = Math.max(
  50,
  Math.min(2000, Number.parseInt(process.env.CIA_OPPORTUNITY_REFRESH_LIMIT || '1000', 10) || 1000),
);
export const CIA_OPPORTUNITY_REFRESH_TTL_SECONDS = Math.max(
  120,
  Number.parseInt(process.env.CIA_OPPORTUNITY_REFRESH_TTL_SECONDS || '900', 10) || 900,
);
export const CIA_CONTACT_CATALOG_LOOKBACK_DAYS = Math.max(
  7,
  Number.parseInt(process.env.CIA_CONTACT_CATALOG_LOOKBACK_DAYS || '30', 10) || 30,
);
export const CIA_CONTACT_CATALOG_MAX_CHATS = Math.max(
  50,
  Math.min(5000, Number.parseInt(process.env.CIA_CONTACT_CATALOG_MAX_CHATS || '1000', 10) || 1000),
);
export const CIA_CONTACT_SCORE_MESSAGE_LIMIT = Math.max(
  12,
  Math.min(200, Number.parseInt(process.env.CIA_CONTACT_SCORE_MESSAGE_LIMIT || '40', 10) || 40),
);
export const CIA_BACKLOG_CONTINUATION_LIMIT = Math.max(
  50,
  Math.min(2000, Number.parseInt(process.env.CIA_BACKLOG_CONTINUATION_LIMIT || '500', 10) || 500),
);
export const CIA_REMOTE_PENDING_PROBE_LIMIT = Math.max(
  10,
  Math.min(200, Number.parseInt(process.env.CIA_REMOTE_PENDING_PROBE_LIMIT || '50', 10) || 50),
);
export const CONVERSATION_HISTORY_LIMIT = Math.max(
  0,
  Number.parseInt(process.env.AUTOPILOT_CONVERSATION_HISTORY_LIMIT || '0', 10) || 0,
);
export const WORKSPACE_SELF_IDENTITY_TTL_MS = Math.max(
  30_000,
  Number.parseInt(process.env.WAHA_SELF_IDENTITY_TTL_MS || '60000', 10) || 60_000,
);

const OPS_WEBHOOK =
  process.env.AUTOPILOT_ALERT_WEBHOOK || process.env.OPS_WEBHOOK_URL || process.env.DLQ_WEBHOOK_URL;

export async function notifyBillingSuspended(workspaceId?: string) {
  if (!OPS_WEBHOOK || !(global as never as { fetch: typeof fetch }).fetch) {
    return;
  }
  try {
    await (global as never as { fetch: typeof fetch }).fetch(OPS_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'billing_suspended_autopilot_skip',
        workspaceId,
        at: new Date().toISOString(),
        env: process.env.NODE_ENV || 'dev',
      }),
      signal: AbortSignal.timeout(10000),
    });
  } catch (err: unknown) {
    const errInstanceofError =
      err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'unknown error');
    log.warn('billing_suspend_notify_failed', { error: errInstanceofError?.message });
  }
}
