/**
 * Anti-storm guard for the WhatsApp inbound MIND percept on the CATCHUP path.
 *
 * The inbound processor calls `triggerWhatsappMindPercept` for every message it
 * ingests. On the live path that is one percept per real-time inbound message —
 * naturally rate-limited by human conversation cadence. On the CATCHUP path,
 * however, a single backfill run replays the historical backlog of a chat (up to
 * hundreds of messages) through the same `process()` method sequentially, so an
 * unguarded percept fires once per historical message — a replay storm that
 * floods the MIND substrate with a burst of stale perceptions in seconds.
 *
 * This guard bounds catchup percepts to a cap per workspace per rolling window.
 * Beyond the cap the percept is SKIPPED (the message is still fully persisted,
 * so the mind-bg consolidation tick still incorporates the backfill — just
 * without a per-message real-time perception spike). The live (non-catchup) path
 * is never throttled.
 *
 * FAIL-OPEN by construction: the only mutation is bumping an in-memory counter;
 * the caller treats any thrown error as "emit" so the guard can never suppress a
 * live percept or break ingestion.
 */
import type { InboundMessage } from './inbound-processor.helpers';

/** Max catchup percepts emitted per workspace within one rolling window. */
export const CATCHUP_PERCEPT_CAP = 25;
/** Rolling window length for the catchup percept cap. */
export const CATCHUP_PERCEPT_WINDOW_MS = 60 * 1000;

export interface CatchupPerceptWindow {
  count: number;
  windowStartMs: number;
}

/**
 * Decide whether the inbound MIND percept should fire for this message.
 *
 *  - Live (non-catchup) messages: ALWAYS emit (returns true), no state touched.
 *  - Catchup messages: emit only while under the per-workspace cap for the
 *    current rolling window; skip once the cap is reached.
 *
 * `state` is a per-processor Map owned by the caller (the singleton inbound
 * processor). `nowMs` is injected for testability.
 */
export function shouldEmitInboundPercept(
  msg: Pick<InboundMessage, 'ingestMode' | 'workspaceId'>,
  state: Map<string, CatchupPerceptWindow>,
  nowMs: number,
): boolean {
  if (msg.ingestMode !== 'catchup') {
    return true;
  }

  const key = msg.workspaceId;
  const window = state.get(key);

  if (window === undefined || nowMs - window.windowStartMs >= CATCHUP_PERCEPT_WINDOW_MS) {
    state.set(key, { count: 1, windowStartMs: nowMs });
    return true;
  }

  if (window.count >= CATCHUP_PERCEPT_CAP) {
    return false;
  }

  window.count += 1;
  return true;
}
