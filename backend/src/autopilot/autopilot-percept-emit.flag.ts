/**
 * Feature flag for the ADDITIVE Autopilot → Mind percept/decision emit.
 *
 * The Autopilot cycle (`autopilot-cycle.service.ts` +
 * `autopilot-cycle-executor.service.ts`) runs its own OpenAI analyze→decide→act
 * loop. It is an "orphan organ" w.r.t. cognition: when autopilot *decides* an
 * action for a conversation or *executes* an autonomous action (queues a send),
 * it never emits a percept into the Mind event spine, so the cognition loop is
 * blind to autopilot's own activity. This flag, when set to exactly `'true'`,
 * makes those autopilot decision/action seams ALSO:
 *   1. emit ONE canonical `cognition.autopilot.*` percept into the durable spine
 *      outbox (`RAC_MindOutboxEvent`) — the same table the Flows / CIA / Voice
 *      percepts and the decision ingestor read from (see
 *      `flows-percept-emit.helper.ts`, `cia/cia-percept-emit.helper.ts`,
 *      `mind-event-ingestor.service.ts`); and
 *   2. record each autopilot autonomous action as a decision in the decision
 *      ledger (`DecisionOutcomeService.recordDecision`) so the Mind perceives +
 *      learns from autopilot's autonomous actions.
 *
 * DEFAULT OFF. Best-effort: every emit/record is wrapped in try/catch + warn-log
 * so it can NEVER break the legacy autopilot decide/execute path or change
 * autopilot behavior / outputs. No read path consumes this flag. No backfill.
 *
 * Mirrors the repo's established `process.env.X === 'true'` flag idiom
 * (e.g. KLOEL_CIA_PERCEPT_ENABLED / KLOEL_VOICE_PERCEPT_ENABLED).
 *
 * @see backend/src/autopilot/autopilot-percept-emit.helper.ts
 * @see backend/src/kloel/mind/cia/cia-percept-emit.flag.ts (the pattern this mirrors)
 */
export function isAutopilotPerceptEmitEnabled(): boolean {
  return (process.env.KLOEL_AUTOPILOT_PERCEPT_ENABLED ?? '').toLowerCase() === 'true';
}
