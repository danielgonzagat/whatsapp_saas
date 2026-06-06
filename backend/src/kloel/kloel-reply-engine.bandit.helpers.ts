import type { MindBanditService } from './mind/policy/mind-bandit.service';

/**
 * Flag-gated MindBandit routing for the chat REPLY-STYLE decision.
 *
 * Brain→Mind gap this closes: the chat path already PREDICTS and LEARNS (belief /
 * surprise / global-prior), but it never DECIDES through the canonical bandit —
 * reply strategy is otherwise hardcoded. This routes ONE real chat decision (the
 * reply-verbosity style) through the canonical Thompson/UCB bandit
 * (`MindBanditService`, decisionType `reply_style`), so Kloel actually LEARNS
 * which style works per-workspace from a real, varying reward.
 *
 * Gate: `KLOEL_REPLY_STYLE_BANDIT_ENABLED` (default OFF) → no choose, no
 * directive, no outcome record → byte-identical hardcoded behavior. Everything
 * here is fail-open: a bandit error never breaks a reply.
 *
 * REWARD (honest + modest): adequacy of the produced reply (non-degenerate
 * length). Degenerate/too-short replies are a real failure mode in this codebase
 * (cf. `isShortLlmOutput`, which flags `< 5` chars). This is a length-adequacy
 * PROXY — a real but weak signal that genuinely varies by style; an
 * engagement-based reward (did the user reply / convert) is the follow-up
 * upgrade, which requires delayed outcome attribution.
 *
 * @see backend/src/kloel/mind/policy/mind-bandit.service.ts
 * @see backend/src/kloel/kloel-reply-engine.service.ts
 */

/** Minimal structural logger — decoupled from any concrete logger class. */
type WarnLogger = { warn: (message: string, context?: Record<string, unknown>) => void };

export const REPLY_STYLE_DECISION_TYPE = 'reply_style';

/** The reply-style arms the bandit explores. `balanced` is the neutral baseline. */
export const REPLY_STYLE_ARMS = ['concise', 'balanced', 'detailed'] as const;
export type ReplyStyleArm = (typeof REPLY_STYLE_ARMS)[number];

/** Minimum trimmed length for a reply to count as a bandit WIN (non-degenerate). */
const ADEQUATE_REPLY_MIN_CHARS = 24;

export function isReplyStyleBanditEnabled(): boolean {
  return process.env.KLOEL_REPLY_STYLE_BANDIT_ENABLED === 'true';
}

/**
 * Map an arm to a runtime-context directive appended to the generation prompt.
 * `balanced` is the neutral baseline (empty directive → unchanged prompt).
 */
export function replyStyleDirective(arm: string): string {
  switch (arm) {
    case 'concise':
      return 'DIRETRIZ DE ESTILO: responda de forma curta e direta, indo ao ponto (no máximo 2-3 frases), sem rodeios.';
    case 'detailed':
      return 'DIRETRIZ DE ESTILO: responda de forma completa e detalhada, explicando o raciocínio e os próximos passos com clareza.';
    case 'balanced':
    default:
      return '';
  }
}

/**
 * Reward signal for the reply-style bandit: true when the produced reply is
 * non-degenerate (adequate length), false otherwise. A length-adequacy proxy
 * (see file header) — real and varying, modest by design.
 */
export function isAdequateReplyForBandit(reply: string): boolean {
  return !!reply && reply.trim().length >= ADEQUATE_REPLY_MIN_CHARS;
}

/**
 * Choose a reply-style arm via the canonical bandit. Returns the chosen arm + its
 * directive, or null when disabled / unavailable / fail-open. Self-seeds the arm
 * set on first use (idempotent register when `choose` finds none), so steady
 * state is a single `choose`.
 */
export async function chooseReplyStyleArm(
  mindBanditService: MindBanditService | undefined,
  opts: { workspaceId: string | undefined; logger: WarnLogger },
): Promise<{ arm: string; directive: string } | null> {
  if (!isReplyStyleBanditEnabled() || !mindBanditService || !opts.workspaceId) {
    return null;
  }
  try {
    let chosen = await mindBanditService.choose(opts.workspaceId, REPLY_STYLE_DECISION_TYPE);
    if (!chosen) {
      // First use for this workspace: seed the arm set (idempotent), then choose.
      await mindBanditService.register({
        arms: [...REPLY_STYLE_ARMS],
        decisionType: REPLY_STYLE_DECISION_TYPE,
        workspaceId: opts.workspaceId,
      });
      chosen = await mindBanditService.choose(opts.workspaceId, REPLY_STYLE_DECISION_TYPE);
    }
    if (!chosen) {
      return null;
    }
    return { arm: chosen.arm, directive: replyStyleDirective(chosen.arm) };
  } catch (error: unknown) {
    opts.logger.warn('kloel_reply_style_bandit_choose_failed', {
      workspaceId: opts.workspaceId,
      reason: error instanceof Error ? error.message : 'unknown',
    });
    return null;
  }
}

/**
 * Record the reply-style bandit outcome (Bayesian update). Fail-open. `won` is
 * the adequacy reward (see `isAdequateReplyForBandit`).
 */
export async function recordReplyStyleOutcome(
  mindBanditService: MindBanditService | undefined,
  opts: { workspaceId: string | undefined; arm: string; won: boolean; logger: WarnLogger },
): Promise<void> {
  if (!mindBanditService || !opts.workspaceId || !opts.arm) {
    return;
  }
  try {
    await mindBanditService.recordOutcome({
      arm: opts.arm,
      decisionType: REPLY_STYLE_DECISION_TYPE,
      outcome: opts.won ? 1 : 0,
      workspaceId: opts.workspaceId,
    });
  } catch (error: unknown) {
    opts.logger.warn('kloel_reply_style_bandit_record_failed', {
      workspaceId: opts.workspaceId,
      arm: opts.arm,
      reason: error instanceof Error ? error.message : 'unknown',
    });
  }
}
