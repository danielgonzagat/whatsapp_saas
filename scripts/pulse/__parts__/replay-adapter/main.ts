import * as path from 'path';
import { safeJoin } from '../../lib/safe-path';
import { isObservedMutatingMethod } from '../../dynamic-reality-grammar';
import { pathExists, writeTextFile } from '../../safe-fs';
import type { Scenario, ScenarioStep } from '../../types.scenario-engine';
import type {
  ReplayScenarioCatalog,
  ReplaySession,
  ReplaySource,
  ReplayState,
} from '../../types.replay-adapter';
import { extractSessionsFromExternalSignals, mergeSessions } from './session-extraction';

const REPLAY_STATE_FILENAME = 'PULSE_REPLAY_STATE.json';
const REPLAY_SCENARIOS_FILENAME = 'PULSE_REPLAY_SCENARIOS.json';

const REPLAY_EVIDENCE_FILES = ['PULSE_EXTERNAL_SIGNAL_STATE.json', 'PULSE_BROWSER_EVIDENCE.json'];

function resolveStatePath(rootDir: string): string {
  return safeJoin(rootDir, '.pulse', 'current', REPLAY_STATE_FILENAME);
}

export function classifyReplaySession(
  session: ReplaySession,
): 'permanent' | 'temporary' | 'discard' {
  if (session.errors.length < 1) {
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
