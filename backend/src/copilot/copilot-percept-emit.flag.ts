/**
 * Feature flag for the ADDITIVE Copilot → Mind percept emit.
 *
 * The Copilot subsystem (`backend/src/copilot`) is the last "orphan organ"
 * w.r.t. cognition perception: it already *reads* Mind beliefs (the COPILOT
 * learning loop in `kloel-copilot-loop.helpers.ts` opens/closes the
 * predictive-coding loop) but it never *emits* a percept into the Mind event
 * spine, breaking symmetry with the other 5 wired modules (Flows / CIA /
 * Autopilot / Voice / Money). This flag, when NOT set to `'false'`, makes the
 * Copilot reply seam (`CopilotService.suggest`, after its learning loop closes)
 * ALSO emit ONE canonical `cognition.copilot.chat_reply` percept into the
 * durable spine outbox (`RAC_MindOutboxEvent`) — the same table the Flows / CIA
 * / Voice percepts and the decision ingestor read from (see
 * `voice-percept-emit.helper.ts`, `cia/cia-percept-emit.helper.ts`,
 * `mind-event-ingestor.service.ts`).
 *
 * DEFAULT ON (one-Mind unification): the cognition loop must perceive every
 * surface, so a Copilot chat reply feeds the spine by default. Disable only via
 * `KLOEL_COPILOT_PERCEPT_ENABLED=false`. Best-effort: every emit is wrapped in
 * try/catch + warn-log (idempotent outbox upsert) so it can NEVER break the
 * legacy Copilot suggestion or change Copilot behavior / outputs. No backfill.
 *
 * Inverse of the repo's `=== 'true'` idiom precisely because the safe default
 * here is ON (mirrors KLOEL_VOICE_PERCEPT_ENABLED / KLOEL_CIA_PERCEPT_ENABLED).
 *
 * @see backend/src/copilot/copilot-percept-emit.helper.ts
 * @see backend/src/voice/voice-percept-emit.flag.ts (the pattern this mirrors)
 * @see backend/src/kloel/mind/cia/cia-percept-emit.flag.ts
 */
export function isCopilotPerceptEmitEnabled(): boolean {
  return (process.env.KLOEL_COPILOT_PERCEPT_ENABLED ?? 'true').toLowerCase() !== 'false';
}
