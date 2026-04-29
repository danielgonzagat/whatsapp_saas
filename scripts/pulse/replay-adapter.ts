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

import * as path from 'path';
import { safeJoin } from './lib/safe-path';
import { pathExists, readJsonFile, writeTextFile } from './safe-fs';
import type { Scenario, ScenarioStep } from './types.scenario-engine';
import type {
  ReplayEvent,
  ReplayScenarioCatalog,
  ReplaySession,
  ReplaySource,
  ReplayState,
  ReplayStatus,
} from './types.replay-adapter';

const REPLAY_STATE_FILENAME = 'PULSE_REPLAY_STATE.json';
const REPLAY_SCENARIOS_FILENAME = 'PULSE_REPLAY_SCENARIOS.json';

/** Minimum number of error events required to consider a session as failed. */
const MIN_ERROR_COUNT_FOR_FAILURE = 1;

/** Evidence file paths where replay data may exist. */
const REPLAY_EVIDENCE_FILES = ['PULSE_EXTERNAL_SIGNAL_STATE.json', 'PULSE_BROWSER_EVIDENCE.json'];

/**
 * Extract replay sessions from external signal state.
 *
 * Iterates signals from Sentry/Datadog adapters and reconstructs
 * replay session shapes when sufficient detail is available.
 */
function extractSessionsFromExternalSignals(filePath: string): ReplaySession[] {
  try {
    const raw = readJsonFile<unknown>(filePath);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return [];
    }

    const data = raw as Record<string, unknown>;
    const signals = Array.isArray(data.signals) ? data.signals : [];
    const adapters = Array.isArray(data.adapters) ? data.adapters : [];

    const sessions: ReplaySession[] = [];
    const seen = new Set<string>();

    for (const signal of signals as Array<Record<string, unknown>>) {
      const source = mapSignalSource(String(signal.source || ''));
      if (!source) {
        continue;
      }

      const sessionId = String(
        signal.id || `replay-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      );
      if (seen.has(sessionId)) {
        continue;
      }
      seen.add(sessionId);

      const hasError = typeof signal.severity === 'number' && signal.severity >= 7;

      sessions.push({
        sessionId,
        source,
        userId: String(signal.userId || signal.rawRef || null) || null,
        startTime: String(signal.observedAt || new Date().toISOString()),
        endTime: String(signal.observedAt || new Date().toISOString()),
        durationMs: 0,
        url: String(signal.routePatterns?.[0] || signal.summary || '/'),
        events: hasError
          ? [
              {
                type: 'error',
                timestamp: String(signal.observedAt || new Date().toISOString()),
                detail: {
                  summary: signal.summary,
                  severity: signal.severity,
                  tags: signal.tags,
                },
              },
            ]
          : [],
        errors: hasError
          ? [
              {
                message: String(signal.summary || 'unknown'),
                timestamp: String(signal.observedAt || ''),
              },
            ]
          : [],
        status: 'captured',
        convertedScenarioId: null,
      });
    }

    for (const adapter of adapters as Array<Record<string, unknown>>) {
      const adapterSignals = Array.isArray(adapter.signals) ? adapter.signals : [];
      for (const signal of adapterSignals as Array<Record<string, unknown>>) {
        const source = mapSignalSource(String(signal.source || adapter.source || ''));
        if (!source) {
          continue;
        }

        const sessionId = String(
          signal.id ||
            `replay-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        );
        if (seen.has(sessionId)) {
          continue;
        }
        seen.add(sessionId);

        const hasError = typeof signal.severity === 'number' && signal.severity >= 7;

        sessions.push({
          sessionId,
          source,
          userId: String(signal.userId || signal.rawRef || null) || null,
          startTime: String(signal.observedAt || new Date().toISOString()),
          endTime: String(signal.observedAt || new Date().toISOString()),
          durationMs: 0,
          url: String(signal.routePatterns?.[0] || signal.summary || '/'),
          events: hasError
            ? [
                {
                  type: 'error',
                  timestamp: String(signal.observedAt || new Date().toISOString()),
                  detail: { summary: signal.summary, severity: signal.severity },
                },
              ]
            : [],
          errors: hasError
            ? [
                {
                  message: String(signal.summary || 'unknown'),
                  timestamp: String(signal.observedAt || ''),
                },
              ]
            : [],
          status: 'captured',
          convertedScenarioId: null,
        });
      }
    }

    return sessions;
  } catch {
    return [];
  }
}

function mapSignalSource(raw: string): ReplaySource | null {
  const lowered = raw.toLowerCase();
  if (lowered.includes('sentry')) {
    return 'sentry_replay';
  }
  if (lowered.includes('datadog')) {
    return 'datadog_replay';
  }
  if (lowered.includes('openreplay')) {
    return 'openreplay';
  }
  if (lowered.includes('custom')) {
    return 'custom';
  }
  return null;
}

function resolveStatePath(rootDir: string): string {
  return safeJoin(rootDir, '.pulse', 'current', REPLAY_STATE_FILENAME);
}

/**
 * Classify a replay session for promotion decisions.
 *
 * - `permanent`: session has high-impact error evidence or mutating interactions.
 * - `temporary`: session errored on a non-critical surface.
 * - `discard`: no errors recorded in this session.
 */
export function classifyReplaySession(
  session: ReplaySession,
): 'permanent' | 'temporary' | 'discard' {
  if (session.errors.length < MIN_ERROR_COUNT_FOR_FAILURE) {
    return 'discard';
  }

  if (hasHighImpactReplayEvidence(session)) {
    return 'permanent';
  }

  return 'temporary';
}

function hasHighImpactReplayEvidence(session: ReplaySession): boolean {
  return session.events.some((event) => {
    if (event.type === 'error') {
      const severity = Number(event.detail.severity ?? 0);
      return Number.isFinite(severity) && severity >= 7;
    }

    if (event.type !== 'api_call') {
      return false;
    }

    const method = String(event.detail.method || event.detail.httpMethod || '').toUpperCase();
    return ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
  });
}

/**
 * Convert a production replay session into a scenario definition.
 *
 * Replay events are translated into {login, navigate, click, type, submit,
 * assert} steps so they can be executed by the scenario engine.
 */
export function convertReplayToScenario(session: ReplaySession): Scenario {
  const steps: ScenarioStep[] = [];
  let order = 0;

  steps.push({
    order: order++,
    kind: 'navigate',
    description: `Replay entrypoint: ${session.url || '/'}`,
    target: session.url || '/',
    expectedResult: 'Page loads without error',
    timeout: 15000,
  });

  if (session.userId) {
    steps.push({
      order: order++,
      kind: 'login',
      description: `Authenticate as replay user ${session.userId}`,
      target: '/auth/login',
      expectedResult: 'Session established',
      timeout: 30000,
    });
  }

  for (const event of session.events) {
    switch (event.type) {
      case 'click':
        steps.push({
          order: order++,
          kind: 'click',
          description: `Replay click: ${JSON.stringify(event.detail)}`,
          target: String(event.detail.target || event.detail.selector || 'button'),
          expectedResult: 'UI responds to interaction',
          timeout: 15000,
        });
        break;
      case 'input':
        steps.push({
          order: order++,
          kind: 'type',
          description: `Replay input: ${JSON.stringify(event.detail)}`,
          target: String(event.detail.target || event.detail.field || 'input'),
          expectedResult: 'Field accepts input',
          timeout: 15000,
        });
        break;
      case 'navigation':
        steps.push({
          order: order++,
          kind: 'navigate',
          description: `Replay navigation: ${JSON.stringify(event.detail)}`,
          target: String(event.detail.url || event.detail.path || '/'),
          expectedResult: 'Page loads without error',
          timeout: 15000,
        });
        break;
      case 'api_call':
        steps.push({
          order: order++,
          kind: 'api_call',
          description: `Replay API call: ${JSON.stringify(event.detail)}`,
          target: String(event.detail.url || event.detail.endpoint || '/api/'),
          expectedResult: 'HTTP 200 with expected body',
          timeout: 15000,
        });
        break;
      case 'error': {
        steps.push({
          order: order++,
          kind: 'assert',
          description: `Verify error not reproduced: ${JSON.stringify(event.detail)}`,
          target: 'observability',
          expectedResult: 'No matching error observed',
          timeout: 15000,
        });
        break;
      }
      default:
        break;
    }
  }

  const scenarioId = `scenario-replay-${session.sessionId}`;

  return {
    id: scenarioId,
    name: `Replay: ${session.url || session.sessionId}`,
    role: 'customer',
    flowId: `replay-${session.sessionId}`,
    category: 'surface-map',
    capabilityIds: [],
    preconditions: [],
    steps,
    status: 'not_run',
    lastRun: null,
    durationMs: session.durationMs,
    evidence: [REPLAY_STATE_FILENAME],
  };
}

function mergeSessions(all: ReplaySession[], incoming: ReplaySession[]): ReplaySession[] {
  const seen = new Set(all.map((s) => s.sessionId));
  const merged = [...all];
  for (const session of incoming) {
    if (!seen.has(session.sessionId)) {
      seen.add(session.sessionId);
      merged.push(session);
    }
  }
  return merged;
}

/**
 * Build the full replay state from production signals.
 *
 * Loads external signal data from Sentry/Datadog adapters, reconstructs
 * replay sessions, classifies each session, converts permanent sessions
 * to scenario definitions, and persists the result.
 *
 * @param rootDir - Repo root directory.
 * @returns The generated replay state with converted permanent scenarios.
 */
export function buildReplayState(rootDir: string): ReplayState {
  let sessions: ReplaySession[] = [];

  for (const fileName of REPLAY_EVIDENCE_FILES) {
    const filePath = path.join(rootDir, '.pulse', 'current', fileName);
    if (pathExists(filePath)) {
      const extracted = extractSessionsFromExternalSignals(filePath);
      sessions = mergeSessions(sessions, extracted);
    }
  }

  const permanentScenarios: ReplayState['permanentScenarios'] = [];

  for (const session of sessions) {
    const classification = classifyReplaySession(session);

    if (classification === 'discard') {
      session.status = 'archived';
      continue;
    }

    if (classification === 'temporary') {
      continue;
    }

    const scenario = convertReplayToScenario(session);
    permanentScenarios.push({
      replaySessionId: session.sessionId,
      scenarioId: scenario.id,
      reason: `Error on critical surface: ${session.errors.map((e) => e.message).join('; ')}`,
    });

    session.status = 'converted';
    session.convertedScenarioId = scenario.id;
  }

  const sessionsWithErrors = sessions.filter((s) => s.errors.length > 0).length;
  const convertedSessions = sessions.filter((s) => s.status === 'converted').length;

  const state: ReplayState = {
    generatedAt: new Date().toISOString(),
    summary: {
      totalSessions: sessions.length,
      convertedSessions,
      permanentScenarios: permanentScenarios.length,
      sessionsWithErrors,
    },
    sessions,
    permanentScenarios,
  };

  const outputPath = resolveStatePath(rootDir);
  writeTextFile(outputPath, JSON.stringify(state, null, 2));

  return state;
}

/**
 * Build the replay scenario catalog from production replays.
 *
 * Extracts all sessions classified as `permanent`, converts them to
 * Playwright-compatible scenario definitions, and persists the catalog
 * to `.pulse/current/PULSE_REPLAY_SCENARIOS.json`.
 *
 * This is the canonical output for the scenario engine to consume
 * when scheduling regression test runs from production replays.
 *
 * @param rootDir - Repo root directory.
 * @param existingState - Optional pre-built replay state to avoid re-extraction.
 * @returns The replay scenario catalog.
 */
export function buildReplayScenarioCatalog(
  rootDir: string,
  existingState?: ReplayState,
): ReplayScenarioCatalog {
  const state = existingState ?? buildReplayState(rootDir);
  const permanentSessions = state.sessions.filter((s) => s.status === 'converted');

  const sources = new Set<ReplaySource>();
  const bySource: Record<string, number> = {};
  const scenarioEntries: ReplayScenarioCatalog['scenarios'] = [];

  for (const session of permanentSessions) {
    sources.add(session.source);

    const scenario = convertReplayToScenario(session);
    const promoEntry = state.permanentScenarios.find(
      (p) => p.replaySessionId === session.sessionId,
    );

    const steps: ReplayScenarioCatalog['scenarios'][number]['steps'] = scenario.steps.map((s) => ({
      order: s.order,
      kind: s.kind,
      description: s.description,
      target: s.target,
      expectedResult: s.expectedResult,
      timeout: s.timeout,
    }));

    scenarioEntries.push({
      name: scenario.name,
      id: scenario.id,
      sourceSessionId: session.sessionId,
      source: session.source,
      originUrl: session.url,
      promotionReason: promoEntry?.reason ?? 'Classified as permanent replay evidence',
      steps,
    });

    bySource[session.source] = (bySource[session.source] ?? 0) + 1;
  }

  const catalog: ReplayScenarioCatalog = {
    generatedAt: new Date().toISOString(),
    sources: [...sources],
    summary: {
      totalScenarios: scenarioEntries.length,
      bySource,
    },
    scenarios: scenarioEntries,
  };

  const scenariosPath = safeJoin(rootDir, '.pulse', 'current', REPLAY_SCENARIOS_FILENAME);
  writeTextFile(scenariosPath, JSON.stringify(catalog, null, 2));

  return catalog;
}
