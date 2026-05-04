/**
 * Execute full PULSE scan.
 *
 * @param config - Pulse configuration.
 * @param options - Scan options.
 * @returns Complete scan result.
 */
export async function fullScan(
  config: PulseConfig,
  options: FullScanOptions = {},
): Promise<FullScanResult> {
  // Core parsers (1-6)
  options.tracer?.startPhase('scan:core-parsers');
  const prismaModels = parseSchema(config);
  const backendRoutes = parseBackendRoutes(config);
  const serviceTraces = traceServices(config);
  const apiCalls = parseAPICalls(config);
  const proxyRoutes = parseProxyRoutes(config);
  const hookRegistry = buildHookRegistry(config);
  const uiElements = parseUIElements(config, hookRegistry);
  const facades = detectFacades(config);
  options.tracer?.finishPhase('scan:core-parsers', 'passed', {
    metadata: {
      apiCalls: apiCalls.length,
      backendRoutes: backendRoutes.length,
      facades: facades.length,
      prismaModels: prismaModels.length,
      proxyRoutes: proxyRoutes.length,
      serviceTraces: serviceTraces.length,
      uiElements: uiElements.length,
    },
  });

  const coreData: CoreParserData = {
    uiElements,
    apiCalls,
    backendRoutes,
    prismaModels,
    serviceTraces,
    proxyRoutes,
    facades,
    hookRegistry,
  };

  // Extended parsers (7+) — collect all breaks, support async parsers
  const extendedBreaks: Break[] = [];
  options.tracer?.startPhase('scan:extended-parser-inventory');
  const parserInventory = loadParserInventory(config, {
    includeParser: options.includeParser,
  });
  options.tracer?.finishPhase('scan:extended-parser-inventory', 'passed', {
    metadata: {
      discoveredChecks: parserInventory.discoveredChecks.length,
      loadedChecks: parserInventory.loadedChecks.length,
      unavailableChecks: parserInventory.unavailableChecks.length,
    },
  });

  for (const unavailable of parserInventory.unavailableChecks) {
    extendedBreaks.push({
      type: 'CHECK_UNAVAILABLE',
      severity: 'high',
      file: unavailable.file,
      line: 1,
      description: `PULSE parser "${unavailable.name}" could not be loaded`,
      detail: unavailable.reason,
      source: 'parser-registry',
    });
  }

  options.tracer?.startPhase('scan:extended-parsers', {
    parserCount: parserInventory.loadedChecks.length,
  });
  const parserTimeoutMs = options.parserTimeoutMs || 30_000;
  for (const parser of parserInventory.loadedChecks) {
    options.tracer?.startPhase(`parser:${parser.name}`, {
      timeoutMs: parserTimeoutMs,
    });
    try {
      const breaks = await runParserWithTimeout(parser, config, parserTimeoutMs);
      extendedBreaks.push(
        ...breaks.map((item) => ({
          ...item,
          source: item.source || parser.name,
        })),
      );
      options.tracer?.finishPhase(`parser:${parser.name}`, 'passed', {
        metadata: {
          breakCount: breaks.length,
        },
      });
    } catch (e) {
      const message = (e as Error).message || 'Unknown parser execution failure';
      parserInventory.unavailableChecks.push({
        name: parser.name,
        file: parser.file,
        reason: message,
      });
      extendedBreaks.push({
        type: 'CHECK_UNAVAILABLE',
        severity: 'high',
        file: parser.file,
        line: 1,
        description: `PULSE parser "${parser.name}" failed during execution`,
        detail: message,
        source: parser.name,
      });
      options.tracer?.finishPhase(
        `parser:${parser.name}`,
        message.includes('timed out after') ? 'timed_out' : 'failed',
        {
          errorSummary: message,
        },
      );
    }
  }
  options.tracer?.finishPhase('scan:extended-parsers', 'passed', {
    metadata: {
      breakCount: extendedBreaks.length,
      parserCount: parserInventory.loadedChecks.length,
    },
  });

  options.tracer?.startPhase('scan:manifest');
  const manifestResult = loadPulseManifest(config, coreData);
  extendedBreaks.push(...manifestResult.issues);
  options.tracer?.finishPhase('scan:manifest', 'passed', {
    metadata: {
      issues: manifestResult.issues.length,
      unknownSurfaces: manifestResult.unknownSurfaces.length,
      unsupportedStacks: manifestResult.unsupportedStacks.length,
    },
  });

  options.tracer?.startPhase('scan:graph');
  const health = buildGraph({
    uiElements,
    apiCalls,
    backendRoutes,
    prismaModels,
    serviceTraces,
    proxyRoutes,
    facades,
    globalPrefix: config.globalPrefix,
    config,
    extendedBreaks,
  });
  options.tracer?.finishPhase('scan:graph', 'passed', {
    metadata: {
      score: health.score,
      breakCount: health.breaks.length,
    },
  });

  options.tracer?.startPhase('scan:truth');
  const scopeState = buildScopeState(config.rootDir);
  const codebaseTruth = extractCodebaseTruth(config, coreData, manifestResult.manifest);
  const resolvedManifest = buildResolvedManifest(
    manifestResult.manifest,
    manifestResult.manifestPath,
    codebaseTruth,
    scopeState,
  );
  const codacyEvidence = buildCodacyEvidence(scopeState);
  const structuralGraph = buildStructuralGraph({
    rootDir: config.rootDir,
    coreData,
    scopeState,
    resolvedManifest,
  });
  const executionChains = buildExecutionChains({
    structuralGraph,
  });
  const productGraph = buildProductModel({
    structuralGraph,
    scopeState,
    resolvedManifest,
  });
  const capabilityState = buildCapabilityState({
    structuralGraph,
    scopeState,
    codacyEvidence,
    resolvedManifest,
  });
  const flowProjection = buildFlowProjection({
    structuralGraph,
    capabilityState,
    codebaseTruth,
    resolvedManifest,
    scopeState,
  });
  const externalSignalState = buildExternalSignalState({
    rootDir: config.rootDir,
    scopeState,
    codacyEvidence,
    capabilityState,
    flowProjection,
  });
  options.tracer?.finishPhase('scan:truth', 'passed', {
    metadata: {
      pages: codebaseTruth.summary.totalPages,
      modules: resolvedManifest.summary.totalModules,
      flowGroups: resolvedManifest.summary.totalFlowGroups,
      scopeFiles: scopeState.summary.totalFiles,
      capabilities: capabilityState.summary.totalCapabilities,
      projectedFlows: flowProjection.summary.totalFlows,
    },
  });

  options.tracer?.startPhase('scan:certification');
  const preliminaryCertification = computeCertification({
    rootDir: config.rootDir,
    manifestResult,
    parserInventory,
    health,
    codebaseTruth,
    resolvedManifest,
    scopeState,
    codacyEvidence,
    structuralGraph,
    capabilityState,
    flowProjection,
    externalSignalState,
  });
  const executionMatrix = buildExecutionMatrix({
    structuralGraph,
    scopeState,
    executionChains,
    capabilityState,
    flowProjection,
    executionEvidence: preliminaryCertification.evidenceSummary,
    externalSignalState,
  });
  buildPathCoverageState(config.rootDir, executionMatrix);
  const certification = computeCertification({
    rootDir: config.rootDir,
    manifestResult,
    parserInventory,
    health,
    codebaseTruth,
    resolvedManifest,
    scopeState,
    codacyEvidence,
    structuralGraph,
    capabilityState,
    flowProjection,
    externalSignalState,
    executionMatrix,
  });
  const parityGaps = buildParityGaps({
    codebaseTruth,
    capabilityState,
    flowProjection,
    certification,
    resolvedManifest,
    health,
  });
  const productVision = buildProductVision({
    capabilityState,
    flowProjection,
    certification,
    scopeState,
    codacyEvidence,
    resolvedManifest,
    parityGaps,
    externalSignalState,
  });
  options.tracer?.finishPhase('scan:certification', 'passed', {
    metadata: {
      status: certification.status,
      score: certification.score,
    },
  });

  // ── Perfectness scan phase ──────────────────────────────────────────────
  // All perfectness modules produce their own artifacts in .pulse/current/.
  // They run as a post-certification enrichment layer and preserve per-module
  // failures as evidence instead of hiding them from the autonomy layer.
  const perfectnessStart = Date.now();

  options.tracer?.startPhase('scan:perfectness', {
    moduleCount: 28,
  });

  const perfectnessRuns = await Promise.all([
    // Foundation
    safeRun('ast-call-graph', () => buildAstCallGraph(config.rootDir)),
    safeRun('scope-engine', () => buildScopeEngineState(config.rootDir)),
    safeRun('behavior-graph', () => generateBehaviorGraph(config.rootDir)),
    safeRun('merkle-dag', () => buildMerkleDag(config.rootDir, structuralGraph)),
    // Runtime
    safeRun('otel-runtime', () => collectRuntimeTraces(config.rootDir)),
    safeRun('runtime-fusion', () => buildRuntimeFusionState(config.rootDir)),
    // Execution & Testing
    safeRun('property-tester', () => buildPropertyTestEvidence(config.rootDir)),
    safeRun('execution-harness', () => buildExecutionHarness(config.rootDir)),
    safeRun('ui-crawler', () => buildUICrawlerCatalog(config.rootDir)),
    safeRun('api-fuzzer', () => buildAPIFuzzCatalog(config.rootDir)),
    // Data & State
    safeRun('dataflow-engine', () => buildDataflowState(config.rootDir)),
    safeRun('contract-tester', () => buildContractTestEvidence(config.rootDir)),
    safeRun('dod-engine', () => buildDoDEngineState(config.rootDir)),
    // Production & Observability
    safeRun('observability-coverage', () => buildObservabilityCoverage(config.rootDir)),
    safeRun('scenario-engine', () => buildScenarioCatalog(config.rootDir)),
    safeRun('replay-adapter', () => buildReplayState(config.rootDir)),
    safeRun('production-proof', () => buildProductionProofState(config.rootDir)),
    // Chaos & Coverage
    safeRun('chaos-engine', () => buildChaosCatalog(config.rootDir)),
    safeRun('path-coverage-engine', () => buildPathCoverageState(config.rootDir)),
    // Intelligence & Memory
    safeRun('probabilistic-risk', () => buildProbabilisticRisk(config.rootDir)),
    safeRun('structural-memory', () => buildStructuralMemory(config.rootDir)),
    safeRun('false-positive-adjudicator', () => buildFPAdjudicationState(config.rootDir)),
    // Authority
    safeRun('authority-engine', () => evaluateAuthorityState(config.rootDir)),
    safeRun('audit-chain', () => buildAuditChain(config.rootDir)),
    // Architecture
    safeRun('gitnexus-freshness', () => checkGitNexusFreshness(config.rootDir)),
    safeRun('plugin-system', () => loadPluginRegistry(config.rootDir)),
    safeRun('safety-sandbox', () => buildSandboxState(config.rootDir)),
    safeRun('perfectness-test', () =>
      evaluatePerfectness(config.rootDir, new Date().toISOString()),
    ),
  ]);

  const proofSynthesisRun = await safeRun('proof-synthesis', () =>
    buildProofSynthesisState(config.rootDir),
  );
  const commandGraphRun = await safeRun('command-graph', () =>
    writePulseCommandGraphArtifact(config.rootDir),
  );
  const allPerfectnessRuns = [...perfectnessRuns, proofSynthesisRun, commandGraphRun];
  const failedAllPerfectnessRuns = allPerfectnessRuns.filter((run) => run.status === 'failed');
  const perfectnessArtifactDir = path.join(config.rootDir, '.pulse', 'current');
  ensureDir(perfectnessArtifactDir, { recursive: true });
  writeTextFile(
    path.join(perfectnessArtifactDir, 'PULSE_PERFECTNESS_LAYER_STATE.json'),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        status: failedAllPerfectnessRuns.length === 0 ? 'pass' : 'partial',
        moduleCount: allPerfectnessRuns.length,
        passedModules: allPerfectnessRuns.length - failedAllPerfectnessRuns.length,
        failedModules: failedAllPerfectnessRuns.length,
        runs: allPerfectnessRuns,
      },
      null,
      2,
    ),
  );

  options.tracer?.finishPhase(
    'scan:perfectness',
    failedAllPerfectnessRuns.length === 0 ? 'passed' : 'failed',
    {
      errorSummary:
        failedAllPerfectnessRuns.length === 0
          ? undefined
          : `${failedAllPerfectnessRuns.length} perfectness module(s) failed`,
      metadata: {
        durationMs: Date.now() - perfectnessStart,
        moduleCount: allPerfectnessRuns.length,
        failedModules: failedAllPerfectnessRuns.length,
      },
    },
  );

  return {
    health,
    coreData,
    extendedBreaks,
    manifest: manifestResult.manifest,
    manifestResult,
    codebaseTruth,
    resolvedManifest,
    scopeState,
    codacyEvidence,
    structuralGraph,
    executionChains,
    executionMatrix,
    productGraph,
    capabilityState,
    flowProjection,
    parityGaps,
    externalSignalState,
    productVision,
    certification,
    parserInventory,
  };
}

