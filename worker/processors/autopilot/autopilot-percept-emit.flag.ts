/**
 * Feature flag for the ADDITIVE Autopilot → Mind percept emit.
 *
 * The Autopilot CIA action path executes outreach actions (`runCiaAction` in
 * `cia-action.ts`) and records its own decision/proof logs, but it never emits
 * a percept into the Mind event spine — so the cognition loop is blind to
 * autopilot action activity. This flag, when set to exactly `'true'`, makes
 * `runCiaAction` ALSO emit ONE canonical `cognition.autopilot.action_executed`
 * percept into the durable spine outbox (`RAC_MindOutboxEvent`) — the same
 * table the Flows surface and the self-evolution cron emit into.
 *
 * DEFAULT OFF. Best-effort: the emit is wrapped in try/catch + warn-log so it
 * can NEVER break the legacy CIA action dispatch or change action behavior /
 * outcomes. No read path consumes this flag. No backfill.
 *
 * Mirrors the repo's established `process.env.X === 'true'` flag idiom
 * (e.g. KLOEL_FLOWS_PERCEPT_ENABLED / KLOEL_THINK_LOOP_ENABLED).
 *
 * @see worker/processors/autopilot/autopilot-percept-emit.helper.ts
 * @see worker/processors/autopilot/cia-action.ts (runCiaAction)
 * @see backend/src/flows/flows-percept-emit.flag.ts (reference pattern)
 */
export function isAutopilotPerceptEmitEnabled(): boolean {
  return (process.env.KLOEL_AUTOPILOT_PERCEPT_ENABLED ?? '').toLowerCase() === 'true';
}
