/**
 * Feature flag for the ADDITIVE Money Machine -> Mind percept emit.
 *
 * The Money Machine (`backend/src/growth/money-machine.service.ts`) is an
 * "orphan organ" w.r.t. cognition: when `MoneyMachineService.activate` *scans*
 * a workspace's leads for reactivation opportunities and *auto-generates* a
 * reactivation campaign, it never emits a percept into the Mind event spine, so
 * the cognition loop is blind to the money engine's activity and the
 * campaign-generation is never recorded as a decision the Mind perceives. This
 * flag, when set to exactly `'true'`, makes those two Money Machine seams ALSO
 * emit canonical `cognition.money.*` percepts into the durable spine outbox
 * (`RAC_MindOutboxEvent`) — the same table the Flows / Voice / CIA percepts and
 * the `MindEventSpine` ingestor read from (see `flows-percept-emit.helper.ts`,
 * `voice-percept-emit.helper.ts`, `mind-event-spine.service.ts`).
 *
 * The `cognition.money.campaign_generated` percept IS the
 * campaign-generation-as-decision record: `MindEventSpine.recordCommercial`
 * maps each outbox event into a commercial decision row (intent / action /
 * status) the Mind perceives, so emitting it feeds the money engine's decision
 * into the cognition ledger without changing the campaign-generation logic.
 *
 * DEFAULT OFF. Best-effort: every emit is wrapped in try/catch + warn-log so it
 * can NEVER break the legacy lead scan / campaign + flow creation or change
 * Money Machine behavior / outputs. No read path consumes this flag. No
 * backfill. Flag-OFF is byte-identical to today (synchronous early-return, no
 * DB call).
 *
 * Mirrors the repo's established `process.env.X === 'true'` flag idiom
 * (e.g. KLOEL_FLOWS_PERCEPT_ENABLED / KLOEL_VOICE_PERCEPT_ENABLED).
 *
 * @see backend/src/growth/money-percept-emit.helper.ts
 * @see backend/src/growth/money-machine.service.ts (activate)
 * @see backend/src/voice/voice-percept-emit.flag.ts (the pattern this mirrors)
 */
export function isMoneyPerceptEmitEnabled(): boolean {
  return (process.env.KLOEL_MONEY_PERCEPT_ENABLED ?? '').toLowerCase() === 'true';
}
