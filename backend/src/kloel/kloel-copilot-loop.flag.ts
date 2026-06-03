/**
 * Feature flag for the COPILOT cognition learning loop (one-Mind unification).
 *
 * The Copilot reply surface (`CopilotService.suggest`) was historically a fully
 * isolated cognition island: it called OpenAI directly and never opened the
 * predictive-coding / decision-outcome loop, so none of its turns fed
 * RAC_MindPrediction / RAC_DecisionOutcome / RAC_MindBelief. This flag wires the
 * SAME proven loop the streaming `think()` path uses (P0-C) onto the Copilot
 * surface, attributed under a distinct `'copilot'` surface discriminator.
 *
 * DEFAULT OFF. The loop only fires when `KLOEL_COPILOT_LOOP_ENABLED` is exactly
 * `'true'` (case-insensitive). Mirrors the repo's established
 * `process.env.X === 'true'` flag idiom (e.g. KLOEL_THINK_LOOP_ENABLED /
 * GUEST_CHAT_ENABLED / HANDOFF_CONFIDENCE_GATE_ENABLED).
 *
 * When OFF the Copilot reply path is byte-for-byte the current behavior: the
 * single env read short-circuits {@link openCopilotLoop} to `null` before any
 * cognition service is touched — no new awaits, no new DB writes, zero added
 * latency on the reply critical path.
 */
export function isCopilotLoopEnabled(): boolean {
  return (process.env.KLOEL_COPILOT_LOOP_ENABLED ?? '').toLowerCase() === 'true';
}
