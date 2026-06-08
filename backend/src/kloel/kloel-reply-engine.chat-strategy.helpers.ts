import type { MindBanditService } from './mind/policy/mind-bandit.service';

/**
 * Flag-gated CLOSURE of the `chat_strategy` MindBandit loop.
 *
 * The gap this closes: `chat_strategy` is DECIDED but never LEARNS. The mind
 * signal builder selects a `chat_strategy` arm via the canonical bandit's
 * read-only `selectArm` (see `build-mind-signals.helper.ts` ~L335) — read-only by
 * design, it never increments pulls and never records an outcome. There is no
 * `recordOutcome('chat_strategy', ...)` anywhere, so the arm that was selected
 * never sees the reward the reply path already computes. The bandit decides
 * forever on its Beta(1,1) prior: a decision with no feedback.
 *
 * This module carries the SELECTED arm from the decision point to the reply
 * OUTCOME close path and records the SAME reward signal the reply outcome already
 * computes (reply length-adequacy — see `isAdequateReplyForBandit`). The
 * `selectArm` call stays read-only and untouched; we re-derive the same arm here
 * (deterministic on the current arm stats, identical to what `buildMindSignals`
 * surfaced) purely to attribute the reward — this is ADDITIVE loop-closing, not a
 * change to the decision logic.
 *
 * Gate: `KLOEL_CHAT_STRATEGY_LEARN` (default OFF). When OFF → no `selectArm`, no
 * `recordOutcome` → the bandit's stats are byte-identical to today (read-only
 * `selectArm` in `buildMindSignals` is unaffected either way). When ON → the
 * selected arm learns from the reply reward. Everything is fail-open: a bandit
 * error never breaks a reply.
 *
 * @see backend/src/kloel/mind/build-mind-signals.helper.ts (the read-only decision)
 * @see backend/src/kloel/mind/policy/mind-bandit.service.ts (selectArm / recordOutcome)
 * @see backend/src/kloel/kloel-reply-engine.bandit.helpers.ts (the reply_style sibling)
 */

/** Minimal structural logger — decoupled from any concrete logger class. */
type WarnLogger = { warn: (message: string, context?: Record<string, unknown>) => void };

/** Canonical decision type — must match `selectArm(workspaceId, 'chat_strategy')`. */
export const CHAT_STRATEGY_DECISION_TYPE = 'chat_strategy';

/**
 * Default-OFF learning gate. OFF → the `chat_strategy` bandit never records an
 * outcome, so its stats stay exactly as they are today (decide-only).
 */
export function isChatStrategyLearnEnabled(): boolean {
  return process.env.KLOEL_CHAT_STRATEGY_LEARN === 'true';
}

/**
 * Carry the SELECTED `chat_strategy` arm from the decision point to the reply
 * outcome close path. Returns the selected arm, or null when the learning gate is
 * OFF / the service is unavailable / no arm exists / fail-open on error.
 *
 * Uses the canonical read-only `selectArm` — same deterministic selection the
 * mind signals surfaced — so the arm we later reward is the arm that was chosen.
 * When the gate is OFF this is a no-op (no call), preserving today's behavior.
 */
export async function selectChatStrategyArm(
  mindBanditService: MindBanditService | undefined,
  opts: { workspaceId: string | undefined; logger: WarnLogger },
): Promise<{ arm: string } | null> {
  if (!isChatStrategyLearnEnabled() || !mindBanditService?.selectArm || !opts.workspaceId) {
    return null;
  }
  try {
    const selected = await mindBanditService.selectArm(
      opts.workspaceId,
      CHAT_STRATEGY_DECISION_TYPE,
    );
    if (!selected) {
      return null;
    }
    return { arm: selected.arm };
  } catch (error: unknown) {
    opts.logger.warn('kloel_chat_strategy_bandit_select_failed', {
      workspaceId: opts.workspaceId,
      reason: error instanceof Error ? error.message : 'unknown',
    });
    return null;
  }
}

/**
 * Record the `chat_strategy` bandit outcome (Bayesian update) for the arm carried
 * from the decision point. Fail-open. `won` is the reply reward (the same
 * length-adequacy signal the reply outcome already computes).
 *
 * Skips silently when the service / workspaceId / arm is missing — and the caller
 * only ever holds an arm when the learning gate was ON at decision time, so an
 * OFF gate records nothing.
 */
export async function recordChatStrategyOutcome(
  mindBanditService: MindBanditService | undefined,
  opts: { workspaceId: string | undefined; arm: string; won: boolean; logger: WarnLogger },
): Promise<void> {
  if (!mindBanditService || !opts.workspaceId || !opts.arm) {
    return;
  }
  try {
    await mindBanditService.recordOutcome({
      arm: opts.arm,
      decisionType: CHAT_STRATEGY_DECISION_TYPE,
      outcome: opts.won ? 1 : 0,
      workspaceId: opts.workspaceId,
    });
  } catch (error: unknown) {
    opts.logger.warn('kloel_chat_strategy_bandit_record_failed', {
      workspaceId: opts.workspaceId,
      arm: opts.arm,
      reason: error instanceof Error ? error.message : 'unknown',
    });
  }
}
