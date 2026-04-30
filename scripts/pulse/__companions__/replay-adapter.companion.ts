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

