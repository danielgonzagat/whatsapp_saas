/**
 * Feature flag for the ADDITIVE Flows → Mind percept emit.
 *
 * The Flows execution path is an "orphan organ": when a flow run completes
 * (persisted via `FlowsService.logExecution` with `status: 'COMPLETED'`), it
 * never emits a percept into the Mind event spine, so the cognition loop is
 * blind to flow activity. This flag, when set to exactly `'true'`, makes
 * `FlowsService.logExecution` ALSO emit ONE canonical
 * `cognition.flow.node_completed` percept into the durable spine outbox
 * (`RAC_MindOutboxEvent`) — the same table other surfaces emit into (see
 * `MindEventSpine.recordCommercial`, `agent-runtime.scheduler.enqueueDueJob`).
 *
 * DEFAULT ON (one-Mind unification): the cognition loop must perceive every
 * surface, so completed flows feed the spine by default. Disable only via
 * `KLOEL_FLOWS_PERCEPT_ENABLED=false`. Best-effort: the emit is wrapped in
 * try/catch + warn-log so it can NEVER break the legacy `flowExecution.create`
 * write or change flow execution behavior / outputs. No read path consumes this
 * flag. No backfill.
 *
 * Inverse of the repo's `=== 'true'` idiom precisely because the safe default
 * here is ON (mirrors KLOEL_THINK_LOOP_ENABLED).
 *
 * @see backend/src/flows/flows-percept-emit.helper.ts
 * @see backend/src/flows/flows.service.ts (logExecution)
 */
export function isFlowsPerceptEmitEnabled(): boolean {
  return (process.env.KLOEL_FLOWS_PERCEPT_ENABLED ?? 'true').toLowerCase() !== 'false';
}
