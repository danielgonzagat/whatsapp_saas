/**
 * Feature flag for the ADDITIVE Voice → Mind percept emit.
 *
 * The Voice subsystem (`backend/src/voice`) is an "orphan organ" w.r.t.
 * cognition: when a workspace *clones/configures* a voice profile
 * (`VoiceService.createVoiceProfile`) or *executes* a voice action by
 * dispatching a text-to-speech job (`VoiceService.generateAudio`), it never
 * emits a percept into the Mind event spine, so the cognition loop is blind to
 * the workspace's voice activity. This flag, when set to exactly `'true'`,
 * makes those two Voice seams ALSO emit ONE canonical `cognition.voice.*`
 * percept into the durable spine outbox (`RAC_MindOutboxEvent`) — the same
 * table the Flows / CIA percepts and the decision ingestor read from (see
 * `flows-percept-emit.helper.ts`, `cia/cia-percept-emit.helper.ts`,
 * `mind-event-ingestor.service.ts`).
 *
 * DEFAULT OFF. Best-effort: every emit is wrapped in try/catch + warn-log so it
 * can NEVER break the legacy voice-profile create / voice-job dispatch or
 * change Voice behavior / outputs. No read path consumes this flag. No
 * backfill.
 *
 * Mirrors the repo's established `process.env.X === 'true'` flag idiom
 * (e.g. KLOEL_FLOWS_PERCEPT_ENABLED / KLOEL_CIA_PERCEPT_ENABLED).
 *
 * @see backend/src/voice/voice-percept-emit.helper.ts
 * @see backend/src/kloel/mind/cia/cia-percept-emit.flag.ts (the pattern this mirrors)
 */
export function isVoicePerceptEmitEnabled(): boolean {
  return (process.env.KLOEL_VOICE_PERCEPT_ENABLED ?? '').toLowerCase() === 'true';
}
