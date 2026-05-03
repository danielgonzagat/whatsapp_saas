/**
 * PULSE Wave 5 — Production Replay Adapter
 *
 * Converts production user sessions (from Sentry, Datadog, etc.) into
 * permanent Playwright regression scenarios. Sessions with high-impact errors
 * or mutating interactions are promoted to permanent scenarios stored in the
 * scenario catalog.
 *
 * Persisted to `.pulse/current/PULSE_REPLAY_STATE.json`.
 */
export {
  classifyReplaySession,
  convertReplayToScenario,
  buildReplayState,
  buildReplayScenarioCatalog,
} from './__parts__/replay-adapter/main';
