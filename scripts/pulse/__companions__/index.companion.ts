async function main() {
  const loadedEnvFiles = loadPulseLocalEnv(process.cwd());
  const gitnexusMode = process.argv.includes('gitnexus');
  if (gitnexusMode) {
    const { gitnexusCli } = await import('./gitnexus/cli');
    await gitnexusCli(process.argv.slice(process.argv.indexOf('gitnexus') + 1));
    return;
  }

  if (flags.autonomous) {
    const autonomyState = await runPulseAutonomousLoop(process.cwd(), {
      dryRun: flags.dryRun,
      continuous: flags.continuous,
      maxIterations: flags.maxIterations,
      intervalMs: flags.intervalMs,
      parallelAgents: flags.parallelAgents,
      maxWorkerRetries: flags.maxWorkerRetries,
      riskProfile:
        flags.riskProfile === 'safe' ||
        flags.riskProfile === 'balanced' ||
        flags.riskProfile === 'dangerous'
          ? flags.riskProfile
          : null,
      plannerModel: flags.plannerModel,
      codexModel: flags.codexModel,
      disableAgentPlanner: flags.disableAgentPlanner,
      executor: flags.executor,
    });
    console.log(JSON.stringify(autonomyState, null, 2));
    process.exit(autonomyState.status === 'failed' ? 1 : 0);
  }
  const bootstrapProfileSelection = flags.profile ? getProfileSelection(flags.profile, null) : null;
  let profileSelection = bootstrapProfileSelection;
  const effectiveTarget = deriveEffectiveTarget();
  const effectiveEnvironment = deriveEffectiveEnvironment();
  const humanReadableOutput = !flags.json && !flags.guidance && !flags.prove && !flags.vision;
  let effectiveRequestedSyntheticModes = [
    ...new Set([...requestedSyntheticModes, ...(profileSelection?.requestedModes || [])]),
  ];
  let effectiveActorModeRequested = effectiveRequestedSyntheticModes.length > 0;
  const tracer = new PulseExecutionTracer(process.cwd(), effectiveTarget, effectiveEnvironment);

  const config = detectConfig(process.cwd());
  config.certificationProfile = flags.profile;
  const fullScanTimeoutMs = deriveFullScanTimeoutMs(
    config,
    bootstrapProfileSelection?.includeParser,
    bootstrapProfileSelection?.parserTimeoutMs,
    bootstrapProfileSelection?.phaseTimeoutMs,
  );
  const mode = effectiveEnvironment.toUpperCase();
  printPulseStartupSummary({
    humanReadableOutput,
    config,
    mode,
    modeHasRuntimeParsers: mode !== 'SCAN',
    target: effectiveTarget,
    showTarget: Boolean(flags.final || flags.tier !== null || flags.profile),
    actorModes: effectiveRequestedSyntheticModes,
    loadedEnvFiles,
  });
  printRegisteredStagePlan(humanReadableOutput);

  // 2. Full scan
  const startTime = Date.now();
  let scanResult = await runRegisteredStage(
    tracer,
    'full-scan',
    () =>
      fullScan(config, {
        includeParser: bootstrapProfileSelection?.includeParser,
        parserTimeoutMs: bootstrapProfileSelection?.parserTimeoutMs,
        tracer,
      }),
    {
      timeoutMs: fullScanTimeoutMs,
      metadata: {
        profile: flags.profile || 'none',
        environment: effectiveEnvironment,
        parserTimeoutMs: bootstrapProfileSelection?.parserTimeoutMs ?? 0,
        dynamicTimeoutMs: fullScanTimeoutMs ?? 0,
      },
    },
  );
  const { health, coreData } = scanResult;
  profileSelection = flags.profile ? getProfileSelection(flags.profile, scanResult.manifest) : null;
  effectiveRequestedSyntheticModes = [
    ...new Set([...requestedSyntheticModes, ...(profileSelection?.requestedModes || [])]),
  ];
  effectiveActorModeRequested = effectiveRequestedSyntheticModes.length > 0;
  let certification = scanResult.certification;
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  if (humanReadableOutput) {
    console.log(`  Done in ${elapsed}s`);
  }
  tracer.setContext(effectiveTarget, effectiveEnvironment);

  const runtimeProbeIds = getRuntimeProbeIds(profileSelection?.runtimeProbeIds);
  tracer.startPhase('runtime-evidence', {
    ...buildStageMetadata('runtime-evidence'),
    probeCount: runtimeProbeIds.length,
  });
  const runtimeProbes: PulseRuntimeProbe[] = [];
  for (const probeId of runtimeProbeIds) {
    try {
      const probe = await runPhaseWithTrace(
        tracer,
        `runtime:${probeId}`,
        () =>
          collectRuntimeProbe(effectiveEnvironment, probeId, {
            requireDbConnectivity: profileSelection ? true : undefined,
          }),
        {
          timeoutMs: 12_000,
          metadata: {
            probeId,
          },
          onTimeout: () => buildTimedOutRuntimeProbe(probeId),
        },
      );
      runtimeProbes.push(probe);
    } catch (error) {
      runtimeProbes.push(buildFailedRuntimeProbe(probeId, error));
    }
  }
  const runtimeEvidence = summarizeRuntimeEvidence(effectiveEnvironment, runtimeProbes);
  tracer.finishPhase('runtime-evidence', 'passed', {
    metadata: {
      executedChecks: runtimeEvidence.executedChecks.length,
      missingEvidence: runtimeEvidence.probes.filter((probe) => probe.status === 'missing_evidence')
        .length,
      failedProbes: runtimeEvidence.probes.filter((probe) => probe.status === 'failed').length,
    },
  });
  const observabilityEvidence = await runRegisteredStage(
    tracer,
    'observability-evidence',
    () => collectObservabilityEvidence(config.rootDir, runtimeEvidence),
    { timeoutMs: 10_000 },
  );
  const recoveryEvidence = await runRegisteredStage(
    tracer,
    'recovery-evidence',
    () => collectRecoveryEvidence(config.rootDir),
    { timeoutMs: 10_000 },
  );
  let browserEvidence = await buildBrowserEvidenceForIndex({
    tracer,
    flags,
    humanReadableOutput,
    effectiveEnvironment,
    profileSelection,
    runtimeEvidence,
    certification,
  });

  const flowEnvironment = effectiveActorModeRequested ? 'total' : effectiveEnvironment;

  const flowEvidence = await runRegisteredStage(
    tracer,
    'declared-flows',
    () =>
      runDeclaredFlows({
        environment: flowEnvironment,
        manifest: scanResult.manifest,
        health: scanResult.health,
        parserInventory: scanResult.parserInventory,
        flowIds: profileSelection?.flowIds,
        enforceDiagnosticPreconditions: profileSelection?.profile !== 'core-critical',
      }),
    {
      timeoutMs: 90_000,
      metadata: {
        flowCount: profileSelection?.flowIds.length || 0,
        environment: flowEnvironment,
      },
      onTimeout: () => buildTimedOutFlowEvidence(profileSelection?.flowIds || []),
    },
  );

  const invariantEvidence = await runRegisteredStage(
    tracer,
    'declared-invariants',
    () =>
      Promise.resolve(
        runDeclaredInvariants({
          environment: effectiveEnvironment,
          manifest: scanResult.manifest,
          health: scanResult.health,
          parserInventory: scanResult.parserInventory,
          invariantIds: profileSelection?.invariantIds,
          enforceDiagnosticDependencies: profileSelection?.profile !== 'core-critical',
        }),
      ),
    {
      timeoutMs: 30_000,
      metadata: {
        invariantCount: profileSelection?.invariantIds.length || 0,
      },
      onTimeout: () => buildTimedOutInvariantEvidence(profileSelection?.invariantIds || []),
    },
  );

  const syntheticEvidence = await runRegisteredStage(
    tracer,
    'synthetic-actors',
    () =>
      Promise.resolve(
        runSyntheticActors({
          rootDir: config.rootDir,
          environment: effectiveEnvironment,
          manifest: scanResult.manifest,
          resolvedManifest: scanResult.resolvedManifest,
          codebaseTruth: scanResult.codebaseTruth,
          runtimeEvidence,
          browserEvidence,
          flowEvidence,
          requestedModes: effectiveRequestedSyntheticModes,
          scenarioIds: profileSelection?.scenarioIds,
        }),
      ),
    {
      timeoutMs: 10 * 60 * 1000,
      metadata: {
        requestedModes: effectiveRequestedSyntheticModes.join(','),
        scenarioCount: profileSelection?.scenarioIds.length || 0,
      },
      onTimeout: () => {
        const requestedScenarioIds = profileSelection?.scenarioIds || [];
        const customerScenarioIds = requestedScenarioIds.filter((id) => id.startsWith('customer-'));
        const operatorScenarioIds = requestedScenarioIds.filter((id) => id.startsWith('operator-'));
        const adminScenarioIds = requestedScenarioIds.filter((id) => id.startsWith('admin-'));
        const soakScenarioIds = requestedScenarioIds.filter(
          (id) => id.startsWith('system-') || id.startsWith('soak-'),
        );
        return {
          customer: buildTimedOutActorEvidence('customer', customerScenarioIds),
          operator: buildTimedOutActorEvidence('operator', operatorScenarioIds),
          admin: buildTimedOutActorEvidence('admin', adminScenarioIds),
          soak: buildTimedOutActorEvidence('soak', soakScenarioIds),
          syntheticCoverage: {
            executed: false,
            artifactPaths: ['PULSE_SCENARIO_COVERAGE.json'],
            summary: 'Synthetic coverage timed out before scenario execution completed.',
            totalPages: 0,
            userFacingPages: 0,
            coveredPages: 0,
            uncoveredPages: [],
            results: [],
          },
          worldState: buildTimedOutWorldState(
            runtimeEvidence.backendUrl,
            runtimeEvidence.frontendUrl,
            requestedScenarioIds,
          ),
        };
      },
    },
  );

  browserEvidence = deriveBrowserEvidenceFromActors(
    effectiveActorModeRequested,
    browserEvidence,
    syntheticEvidence,
  );

  const finalExecutionEvidencePayload = {
    ...certification.evidenceSummary,
    runtime: runtimeEvidence,
    browser: browserEvidence,
    flows: flowEvidence,
    invariants: invariantEvidence,
    observability: observabilityEvidence,
    recovery: recoveryEvidence,
    customer: syntheticEvidence.customer,
    operator: syntheticEvidence.operator,
    admin: syntheticEvidence.admin,
    soak: syntheticEvidence.soak,
    syntheticCoverage: syntheticEvidence.syntheticCoverage,
    worldState: syntheticEvidence.worldState,
    executionTrace: tracer.getSnapshot(),
  };
  const derivedStructuralGraph = buildStructuralGraph({
    rootDir: config.rootDir,
    coreData: scanResult.coreData,
    scopeState: scanResult.scopeState,
    resolvedManifest: scanResult.resolvedManifest,
    executionEvidence: finalExecutionEvidencePayload,
  });
  const derivedCapabilityState = buildCapabilityState({
    structuralGraph: derivedStructuralGraph,
    scopeState: scanResult.scopeState,
    codacyEvidence: scanResult.codacyEvidence,
    resolvedManifest: scanResult.resolvedManifest,
    executionEvidence: finalExecutionEvidencePayload,
  });
  const derivedFlowProjection = buildFlowProjection({
    structuralGraph: derivedStructuralGraph,
    capabilityState: derivedCapabilityState,
    codebaseTruth: scanResult.codebaseTruth,
    resolvedManifest: scanResult.resolvedManifest,
    scopeState: scanResult.scopeState,
    executionEvidence: finalExecutionEvidencePayload,
  });
  const derivedExternalSignalState = buildExternalSignalState({
    rootDir: config.rootDir,
    scopeState: scanResult.scopeState,
    codacyEvidence: scanResult.codacyEvidence,
    capabilityState: derivedCapabilityState,
    flowProjection: derivedFlowProjection,
    liveExternalState: createExternalSignalProfileState(
      effectiveTarget.profile,
      effectiveTarget.certificationScope,
    ),
  });
  const derivedExecutionChains = buildExecutionChains({
    structuralGraph: derivedStructuralGraph,
  });
  const derivedExecutionMatrix = buildExecutionMatrix({
    structuralGraph: derivedStructuralGraph,
    scopeState: scanResult.scopeState,
    executionChains: derivedExecutionChains,
    capabilityState: derivedCapabilityState,
    flowProjection: derivedFlowProjection,
    executionEvidence: finalExecutionEvidencePayload,
    externalSignalState: derivedExternalSignalState,
  });
  buildPathCoverageState(config.rootDir, derivedExecutionMatrix);

  const artifactsOverride = buildRegisteredArtifactOverrides({
    stageId: 'self-trust-verification',
    certification: scanResult.certification,
    externalSignalState: derivedExternalSignalState,
  });

  const selfTrustReport = await runRegisteredStage(
    tracer,
    'self-trust-verification',
    () =>
      Promise.resolve(
        runSelfTrustChecks({
          manifestPath: scanResult.manifestResult.manifestPath,
          parsersDir: `${config.rootDir}/scripts/pulse/parsers`,
          evidenceFile: `${config.rootDir}/PULSE_ARTIFACT_INDEX.json`,
          repoRoot: config.rootDir,
          breaks: scanResult.health.breaks,
          artifactsOverride,
        }),
      ),
    { timeoutMs: 5_000 },
  );

  const previousDirective = readOptionalJson<PulseDirectiveSnapshot>(
    `${config.rootDir}/PULSE_CLI_DIRECTIVE.json`,
  );
  const previousCertificate = readOptionalJson<{ status?: string; rawContent?: string }>(
    `${config.rootDir}/PULSE_CERTIFICATE.json`,
  );
  const previousCertificateSnapshot: PulseCertificateSnapshot | null = previousCertificate
    ? { status: previousCertificate.status }
    : null;
  const autonomyStateSnapshot =
    readOptionalJson<PulseAutonomyStateSnapshot>(
      `${config.rootDir}/.pulse/current/PULSE_AUTONOMY_STATE.json`,
    ) ?? null;

  certification = await runRegisteredStage(
    tracer,
    'final-certification',
    () =>
      Promise.resolve(
        computeCertification({
          rootDir: config.rootDir,
          manifestResult: scanResult.manifestResult,
          parserInventory: scanResult.parserInventory,
          health: scanResult.health,
          codebaseTruth: scanResult.codebaseTruth,
          resolvedManifest: scanResult.resolvedManifest,
          scopeState: scanResult.scopeState,
          codacyEvidence: scanResult.codacyEvidence,
          structuralGraph: derivedStructuralGraph,
          capabilityState: derivedCapabilityState,
          flowProjection: derivedFlowProjection,
          externalSignalState: derivedExternalSignalState,
          executionMatrix: derivedExecutionMatrix,
          certificationTarget: effectiveTarget,
          executionEvidence: finalExecutionEvidencePayload,
          previousDirective,
          previousCertificate: previousCertificateSnapshot,
          autonomyState: autonomyStateSnapshot,
          selfTrustReport,
        }),
      ),
    { timeoutMs: 15_000 },
  );
  certification = {
    ...certification,
    evidenceSummary: {
      ...certification.evidenceSummary,
      runtime: runtimeEvidence,
      browser: browserEvidence,
      flows: flowEvidence,
      invariants: invariantEvidence,
      observability: observabilityEvidence,
      recovery: recoveryEvidence,
      customer: syntheticEvidence.customer,
      operator: syntheticEvidence.operator,
      admin: syntheticEvidence.admin,
      soak: syntheticEvidence.soak,
      syntheticCoverage: syntheticEvidence.syntheticCoverage,
      worldState: syntheticEvidence.worldState,
      executionTrace: tracer.getSnapshot(),
    },
    selfTrustReport,
  };

  const structuralGraph = buildStructuralGraph({
    rootDir: config.rootDir,
    coreData: scanResult.coreData,
    scopeState: scanResult.scopeState,
    resolvedManifest: scanResult.resolvedManifest,
    executionEvidence: certification.evidenceSummary,
  });
  const executionChains = buildExecutionChains({
    structuralGraph,
  });
  const productGraph = buildProductModel({
    structuralGraph,
    scopeState: scanResult.scopeState,
    resolvedManifest: scanResult.resolvedManifest,
  });
  const capabilityState = buildCapabilityState({
    structuralGraph,
    scopeState: scanResult.scopeState,
    codacyEvidence: scanResult.codacyEvidence,
    resolvedManifest: scanResult.resolvedManifest,
    executionEvidence: certification.evidenceSummary,
  });
  const flowProjection = buildFlowProjection({
    structuralGraph,
    capabilityState,
    codebaseTruth: scanResult.codebaseTruth,
    resolvedManifest: scanResult.resolvedManifest,
    scopeState: scanResult.scopeState,
    executionEvidence: certification.evidenceSummary,
  });

  // Run external sources orchestration in parallel
  const externalSourcesConfig: ExternalSourcesConfig = {
    rootDir: config.rootDir,
    github: {
      owner: process.env.GITHUB_OWNER || '',
      repo: process.env.GITHUB_REPO || '',
      token: process.env.GITHUB_TOKEN,
    },
    sentry: {
      authToken: process.env.SENTRY_AUTH_TOKEN,
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
    },
    datadog: {
      apiKey: process.env.DATADOG_API_KEY,
      appKey: process.env.DATADOG_APP_KEY,
      site: process.env.DATADOG_SITE,
    },
    prometheus: {
      baseUrl: process.env.PROMETHEUS_BASE_URL || process.env.PULSE_PROMETHEUS_URL,
      bearerToken: process.env.PROMETHEUS_BEARER_TOKEN || process.env.PULSE_PROMETHEUS_TOKEN,
      query: process.env.PROMETHEUS_QUERY,
    },
    codecov: {
      token: process.env.CODECOV_TOKEN,
      owner: process.env.GITHUB_OWNER || '',
      repo: process.env.GITHUB_REPO || '',
    },
    dependabot: {
      token: process.env.GITHUB_TOKEN,
      owner: process.env.GITHUB_OWNER || '',
      repo: process.env.GITHUB_REPO || '',
    },
    profile: effectiveTarget.profile || undefined,
    certificationScope: effectiveTarget.certificationScope || effectiveTarget.profile || undefined,
  };
  const externalSourcesTask = runExternalSourcesOrchestrator(externalSourcesConfig).catch(
    () => null,
  );
  const externalSourcesTimeoutMs = deriveExternalSourcesTimeoutMs(externalSourcesConfig);

  const liveExternalState = await runRegisteredStage(
    tracer,
    'external-sources-orchestration',
    () => externalSourcesTask,
    {
      timeoutMs: externalSourcesTimeoutMs,
      onTimeout: () => null,
    },
  );
  const externalSignalState = buildExternalSignalState({
    rootDir: config.rootDir,
    scopeState: scanResult.scopeState,
    codacyEvidence: scanResult.codacyEvidence,
    capabilityState,
    flowProjection,
    liveExternalState,
  });
  const executionMatrix = buildExecutionMatrix({
    structuralGraph,
    scopeState: scanResult.scopeState,
    executionChains,
    capabilityState,
    flowProjection,
    executionEvidence: certification.evidenceSummary,
    externalSignalState,
  });
  buildPathCoverageState(config.rootDir, executionMatrix);
  certification = computeCertification({
    rootDir: config.rootDir,
    manifestResult: scanResult.manifestResult,
    parserInventory: scanResult.parserInventory,
    health: scanResult.health,
    codebaseTruth: scanResult.codebaseTruth,
    resolvedManifest: scanResult.resolvedManifest,
    scopeState: scanResult.scopeState,
    codacyEvidence: scanResult.codacyEvidence,
    structuralGraph,
    capabilityState,
    flowProjection,
    externalSignalState,
    executionMatrix,
    certificationTarget: effectiveTarget,
    executionEvidence: finalExecutionEvidencePayload,
    previousDirective,
    previousCertificate: previousCertificateSnapshot,
    autonomyState: autonomyStateSnapshot,
    selfTrustReport,
  });
  certification = {
    ...certification,
    selfTrustReport,
  };
  const parityGaps = buildParityGaps({
    codebaseTruth: scanResult.codebaseTruth,
    capabilityState,
    flowProjection,
    certification,
    resolvedManifest: scanResult.resolvedManifest,
    health: scanResult.health,
  });
  const productVision = buildProductVision({
    capabilityState,
    flowProjection,
    certification,
    scopeState: scanResult.scopeState,
    codacyEvidence: scanResult.codacyEvidence,
    resolvedManifest: scanResult.resolvedManifest,
    parityGaps,
    externalSignalState,
  });

  scanResult = {
    ...scanResult,
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
  };

  handlePulseOutput({
    flags,
    scanResult,
    health,
    certification,
    config,
    coreData,
    selfTrustReport,
  });

  const postWriteConsistency = runCrossArtifactConsistencyCheck(config.rootDir);
  if (!postWriteConsistency.pass) {
    console.error('\n⚠️  Post-write cross-artifact consistency check FAILED:');
    for (const d of postWriteConsistency.divergences) {
      console.error(`  - ${d.field}: ${d.sources.length} artifacts disagree`);
    }
  } else {
    console.log('\n✅ Post-write cross-artifact consistency: PASS');
  }

  // 5. Watch mode
  if (flags.watch) {
    await startDaemon(config);
  } else {
    if (queryModeRequested) {
      process.exit(0);
    }

    if (flags.certify) {
      process.exit(certification.status === 'CERTIFIED' ? 0 : 1);
    }

    const criticalBreaks = health.breaks.filter((b) => b.severity === 'high').length;
    process.exit(criticalBreaks > 0 ? 1 : 0);
  }
}

main().catch((e) => {
  console.error('PULSE error:', e.message || e);
  console.error(e.stack?.split('\n').slice(0, 8).join('\n'));
  process.exit(2);
});

