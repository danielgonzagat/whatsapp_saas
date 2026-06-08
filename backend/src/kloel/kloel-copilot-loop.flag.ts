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
 * DEFAULT ON (one-Mind unification): the cognition loop must perceive every
 * surface, so the Copilot reply path closes the predictive-coding /
 * decision-outcome loop by default. Disable only via
 * `KLOEL_COPILOT_LOOP_ENABLED=false`. Inverse of the repo's `=== 'true'` idiom
 * precisely because the safe default here is ON (mirrors KLOEL_THINK_LOOP_ENABLED,
 * flipped on for the same reason).
 *
 * When explicitly disabled the Copilot reply path is byte-for-byte the legacy
 * behavior: the single env read short-circuits {@link openCopilotLoop} to `null`
 * before any cognition service is touched — no new awaits, no new DB writes,
 * zero added latency. When ON, the loop is fire-and-forget + try/catch-wrapped so
 * it can never block or crash the reply path.
 */
export function isCopilotLoopEnabled(): boolean {
  return (process.env.KLOEL_COPILOT_LOOP_ENABLED ?? 'true').toLowerCase() !== 'false';
}
