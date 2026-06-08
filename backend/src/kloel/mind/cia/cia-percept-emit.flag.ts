/**
 * Feature flag for the ADDITIVE CIA → Mind percept emit.
 *
 * The CIA autonomous-agent subsystem (advisor / cognitive-health / runtime /
 * backlog-run) is an "orphan organ" w.r.t. cognition: when CIA *decides* an
 * autonomy posture or *executes* an autonomy action (a backlog run), it never
 * emits a percept into the Mind event spine, so the cognition loop is blind to
 * CIA's own activity. This flag, when set to exactly `'true'`, makes the CIA
 * action/decision seams ALSO emit ONE canonical `cognition.cia.*` percept into
 * the durable spine outbox (`RAC_MindOutboxEvent`) — the same table the Flows
 * percept and the decision ingestor read from (see
 * `flows-percept-emit.helper.ts`, `mind-event-ingestor.service.ts`).
 *
 * DEFAULT ON (one-Mind unification): the cognition loop must perceive every
 * surface, so CIA feeds the spine by default. Disable only via
 * `KLOEL_CIA_PERCEPT_ENABLED=false`. Best-effort: every emit is wrapped in
 * try/catch + warn-log so it can NEVER break the legacy CIA autonomy
 * write/dispatch or change CIA behavior / outputs, and the outbox write is an
 * idempotent upsert. No read path consumes this flag. No backfill.
 *
 * Inverse of the repo's `=== 'true'` idiom precisely because the safe default
 * here is ON (mirrors KLOEL_THINK_LOOP_ENABLED, flipped on for the same reason).
 *
 * @see backend/src/kloel/mind/cia/cia-percept-emit.helper.ts
 * @see backend/src/flows/flows-percept-emit.flag.ts (the pattern this mirrors)
 */
export function isCiaPerceptEmitEnabled(): boolean {
  return (process.env.KLOEL_CIA_PERCEPT_ENABLED ?? 'true').toLowerCase() !== 'false';
}
