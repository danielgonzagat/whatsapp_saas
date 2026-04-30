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
import { randomBytes } from 'crypto';
import { safeJoin } from './lib/safe-path';
import { isObservedMutatingMethod } from './dynamic-reality-grammar';
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

function createReplaySessionIdFallback(): string {
  return `replay-${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`;
}

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

      const sessionId = String(signal.id || createReplaySessionIdFallback());
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

        const sessionId = String(signal.id || createReplaySessionIdFallback());
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
  const normalized = normalizeSignalSourceToken(raw);

  return normalized.length > 0 ? normalized : null;
}

function normalizeSignalSourceToken(raw: string): string {
  const output: string[] = [];
  for (const char of raw.trim().toLowerCase()) {
    const isLetter = char >= 'a' && char <= 'z';
    const isDigit = char >= '0' && char <= '9';
    if (isLetter || isDigit) {
      output.push(char);
      continue;
    }
    if (output.length > 0 && output[output.length - 1] !== '_') {
      output.push('_');
    }
  }
  while (output[0] === '_') {
    output.shift();
  }
  while (output[output.length - 1] === '_') {
    output.pop();
  }
  return output.join('');
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

    const method = String(event.detail.method || event.detail.httpMethod || '');
    return isObservedMutatingMethod(method);
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
import "./__companions__/replay-adapter.companion";
