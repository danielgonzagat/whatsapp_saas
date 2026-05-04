/** Build projected product vision from current capability and flow states. */
export function buildProductVision(input: BuildProductVisionInput): PulseProductVision {
  const capSeq = deriveStateSequence(
    input.capabilityState.summary as unknown as Record<string, unknown>,
    'Capabilities',
    input.capabilityState.capabilities.map((item) => item.status),
  );
  const flowSeq = deriveStateSequence(
    input.flowProjection.summary as unknown as Record<string, unknown>,
    'Flows',
    input.flowProjection.flows.map((item) => item.status),
  );
  const capBest = strongestState(capSeq);
  const capWeak = weakestState(capSeq);
  const flowBest = strongestState(flowSeq);
  const flowWeak = weakestState(flowSeq);
  const productUnits = input.capabilityState.capabilities.filter(
    (capability) => capability.userFacing || hasItems(capability.routePatterns),
  );
  const scopedUnits = hasItems(productUnits) ? productUnits : input.capabilityState.capabilities;
  const totalUnits = Math.max(scopedUnits.length, one());
  const totalFlows = Math.max(input.flowProjection.summary.totalFlows, one());
  const readyUnits = scopedUnits.filter((capability) =>
    isMaterializedState(capability.status, capSeq),
  ).length;
  const readyRuns = input.flowProjection.flows.filter((flow) =>
    isMaterializedState(flow.status, flowSeq),
  ).length;
  const unitRatio = quotient(readyUnits, totalUnits);
  const runRatio = quotient(readyRuns, totalFlows);
  const readiness = projectionBand(
    unitRatio,
    runRatio,
    input.codacyEvidence.summary.highIssues,
    capSeq,
    flowSeq,
  );
  const productFacingWeakUnits = scopedUnits.filter(
    (capability) => capability.status === capWeak,
  ).length;
  const systemWeakUnits = input.capabilityState.summary.phantomCapabilities;

  const mergedEntries = mergeModules(input.resolvedManifest.modules);
  const surfaces = mergedEntries
    .filter((entry) => entry.userFacing && entry.coverageStatus !== 'excluded')
    .map((entry) => {
      const unitHits = input.capabilityState.capabilities.filter((capability) =>
        unitHitsModule(capability, entry),
      );
      const capIds = unitHits.map((capability) => capability.id);
      const runHits = input.flowProjection.flows.filter((flow) =>
        runHitsModule(flow, entry, capIds),
      );
      const status = bestStatus(
        unitHits.map((capability) => capability.status),
        runHits.map((flow) => flow.status),
        capSeq,
      );
      const blockers = buildSurfaceBlockers(unitHits, runHits, entry, capSeq, flowSeq);
      return {
        id: `surface:${entry.key}`,
        name: entry.name,
        declaredByManifest: entry.declaredByManifest,
        critical: entry.critical,
        status,
        truthMode: chooseTruthMode([
          ...unitHits.map((capability) => capability.truthMode),
          ...runHits.map((flow) => flow.truthMode),
          !hasItems(unitHits) && !hasItems(runHits) ? 'aspirational' : 'inferred',
        ]),
        completion: buildCapabilityCompletion(unitHits, runHits, capSeq, flowSeq),
        routePatterns: unique([
          ...entry.routeRoots,
          ...unitHits.flatMap((capability) => capability.routePatterns),
          ...runHits.flatMap((flow) => flow.routePatterns),
        ]).sort(),
        capabilityIds: capIds.sort(),
        flowIds: runHits.map((flow) => flow.id).sort(),
        blockers,
      };
    })
    .sort((left, right) => {
      if (left.declaredByManifest !== right.declaredByManifest) {
        return Number(right.declaredByManifest) - Number(left.declaredByManifest);
      }
      if (left.critical !== right.critical) {
        return Number(right.critical) - Number(left.critical);
      }
      if (left.status !== right.status) {
        return stateWeight(right.status, capSeq) - stateWeight(left.status, capSeq);
      }
      if (left.completion !== right.completion) {
        return right.completion - left.completion;
      }
      return left.name.localeCompare(right.name);
    });

  const runtimeProbes = input.certification.evidenceSummary.runtime.probes || [];
  const runResults = input.certification.evidenceSummary.flows.results || [];
  const runResultStates = runResults.map((entry) => entry.status);
  const runtimeProbeStates = runtimeProbes.map((entry) => entry.status);
  const completeRuntimeProbeState = observedHead(unique(runtimeProbeStates));
  const experiences = input.resolvedManifest.scenarioSpecs
    .filter((scenario) => scenario.critical)
    .map((scenario) => {
      const scenarioFamilies = deriveStructuralFamilies([
        ...scenario.moduleKeys,
        ...scenario.routePatterns,
        ...scenario.flowSpecs,
      ]);
      const experienceSurfaces = surfaces.filter((surface) =>
        familiesOverlap(
          scenarioFamilies,
          deriveStructuralFamilies([surface.id, surface.name, ...surface.routePatterns]),
        ),
      );
      const experienceUnits = unique(
        experienceSurfaces.flatMap((surface) => surface.capabilityIds),
      );
      const experienceRuns = input.flowProjection.flows.filter((flow) => {
        const runStructuralFamilies = deriveStructuralFamilies([
          flow.id,
          flow.name,
          ...flow.routePatterns,
        ]);
        const pathHit = familiesOverlap(scenarioFamilies, runStructuralFamilies);
        const unitHit = flow.capabilityIds.some((capabilityId) =>
          experienceUnits.includes(capabilityId),
        );
        const declaredRunHit = familiesOverlap(scenario.flowSpecs, [flow.id, flow.name]);
        return pathHit || unitHit || declaredRunHit;
      });
      const executionWeights = scenario.flowSpecs.map((runSpec) => {
        const result = runResults.find((entry) => entry.flowId === runSpec);
        if (!result) {
          return zero();
        }
        return observedRankWeight(result.status, runResultStates);
      });
      const runtimeWeight = observedAverage(
        scenario.runtimeProbes.map((probeId) => {
          const probe = runtimeProbes.find((entry) => entry.probeId === probeId);
          return probe ? observedRankWeight(probe.status, runtimeProbeStates) : zero();
        }),
      );
      const surfaceWeight = observedAverage(
        experienceSurfaces.map((surface) => surface.completion),
      );
      const runWeight = observedAverage(
        experienceRuns.map((flow) => stateWeight(flow.status, flowSeq)),
      );
      const completion = observedAverage([
        ...(hasItems(experienceSurfaces) ? [surfaceWeight] : []),
        ...(hasItems(experienceRuns) ? [runWeight] : []),
        ...(hasItems(executionWeights) ? [observedAverage(executionWeights)] : []),
        ...(hasItems(scenario.runtimeProbes) ? [runtimeWeight] : []),
      ]);
      const status: PulseFlowProjectionStatus =
        stateFromCompletion(completion, flowSeq) ?? flowWeak ?? 'phantom';

      const blockers = unique([
        ...scenario.runtimeProbes
          .filter((probeId) => !runtimeProbes.some((probe) => probe.probeId === probeId))
          .map((probeId) => `Runtime probe ${probeId} is still missing from live evidence.`),
        ...scenario.runtimeProbes
          .map((probeId) => runtimeProbes.find((probe) => probe.probeId === probeId))
          .filter((probe): probe is NonNullable<typeof probe> => Boolean(probe))
          .filter((probe) =>
            completeRuntimeProbeState ? probe.status !== completeRuntimeProbeState : true,
          )
          .map((probe) => probe.summary || `Runtime probe ${probe.probeId} is not passing.`),
        ...experienceSurfaces.flatMap((surface) =>
          surface.blockers.slice(zero(), Math.max(one(), surface.blockers.length)),
        ),
        ...experienceRuns
          .filter((flow) => flow.status !== flowBest)
          .map((flow) => flow.blockingReasons[0] || `${flow.name} remains ${flow.status}.`),
      ])
        .filter(Boolean)
        .slice(
          zero(),
          leadingSpan(
            scenario.runtimeProbes.length,
            experienceSurfaces.length,
            experienceRuns.length,
          ),
        );

      return {
        id: scenario.id,
        name: humanize(scenario.id),
        status,
        truthMode: chooseTruthMode([
          ...experienceSurfaces.map((surface) => surface.truthMode),
          ...experienceRuns.map((flow) => flow.truthMode),
          completion === 0 ? 'aspirational' : 'inferred',
        ]),
        completion,
        routePatterns: unique(scenario.routePatterns).sort(),
        capabilityIds: experienceUnits.sort(),
        flowIds: unique([...scenario.flowSpecs, ...experienceRuns.map((flow) => flow.id)]).sort(),
        blockers,
        expectedOutcome: compact(
          scenario.notes ||
            `Experience ${scenario.id} should converge as a coherent product journey with real persistence and visible outcomes.`,
          260,
        ),
      };
    })
    .sort(
      (left, right) => right.completion - left.completion || left.name.localeCompare(right.name),
    );

  const promiseToProductionDelta = {
    declaredSurfaces: surfaces.length,
    realSurfaces: surfaces.filter((surface) => surface.status === capSeq[0]).length,
    partialSurfaces: surfaces.filter((surface) => surface.status === capSeq[1]).length,
    latentSurfaces: surfaces.filter((surface) => surface.status === capSeq[2]).length,
    phantomSurfaces: surfaces.filter((surface) => surface.status === capWeak).length,
    productFacingPhantomCapabilities: productFacingWeakUnits,
    systemPhantomCapabilities: systemWeakUnits,
    criticalGaps: surfaces
      .filter(
        (surface) =>
          surface.status !== capBest &&
          (surface.declaredByManifest || surface.critical || multiple(surface.routePatterns)),
      )
      .slice(zero(), leadingSpan(surfaces.length, input.parityGaps.gaps.length))
      .map(
        (surface) =>
          `${surface.name}: ${surface.blockers[0] || `${surface.status} surface with incomplete materialization.`}`,
      ),
  };

  const externalSignals = input.externalSignalState?.signals || [];
  const blockerSpan = leadingSpan(
    externalSignals.length,
    promiseToProductionDelta.criticalGaps.length,
    input.parityGaps.gaps.length,
    experiences.length,
    scopedUnits.length,
  );
  const leadingBlockers = unique([
    ...[...externalSignals]
      .sort((left, right) => right.impactScore - left.impactScore)
      .slice(zero(), blockerSpan)
      .map((signal) => `${signal.source}/${signal.type}: ${signal.summary}`),
    ...promiseToProductionDelta.criticalGaps,
    ...input.parityGaps.gaps
      .slice(zero(), blockerSpan)
      .map((gap) => `${gap.title}: ${gap.summary}`),
    ...experiences
      .filter((experience) => experience.status !== flowBest)
      .slice(zero(), blockerSpan)
      .map(
        (experience) =>
          `${experience.name}: ${experience.blockers[0] || `${experience.status} experience.`}`,
      ),
    ...scopedUnits
      .filter(
        (capability) =>
          capability.status === capWeak || hasCount(capability.highSeverityIssueCount),
      )
      .slice(zero(), blockerSpan)
      .map((capability) =>
        hasCount(capability.highSeverityIssueCount)
          ? `${capability.name}: ${capability.highSeverityIssueCount} HIGH Codacy issue(s).`
          : `${capability.name}: capability still phantom.`,
      ),
  ]).slice(zero(), leadingSpan(blockerSpan, promiseToProductionDelta.criticalGaps.length));

  const evidenceBasis = summarizeEvidenceBasis(scopedUnits, input.flowProjection.flows);

  const surfaceNames = surfaces
    .filter((surface) => isMaterializedState(surface.status, capSeq))
    .slice(zero(), leadingSpan(surfaces.length, experiences.length))
    .map((surface) => surface.name);

  const inferredProductIdentity = hasItems(surfaceNames)
    ? `If the currently connected structures converge, the product resolves toward a unified operational platform centered on ${unique(surfaceNames).join(', ')}.`
    : 'The current repository still exposes too little converged surface area to infer a stable product identity.';

  return {
    generatedAt: new Date().toISOString(),
    truthMode: 'aspirational',
    evidenceBasis,
    currentCheckpoint: {
      tier: input.certification.blockingTier,
      status: input.certification.status,
      score: input.certification.score,
    },
    projectedCheckpoint: {
      capabilityRealnessRatio: unitRatio,
      flowRealnessRatio: runRatio,
      projectedProductionReadiness: readiness,
    },
    currentStateSummary: `The current product-facing system materializes ${capSeq
      .map(
        (status) =>
          `${scopedUnits.filter((capability) => capability.status === status).length} ${status} capability(ies)`,
      )
      .join(', ')}. System-wide phantom capability count is ${systemWeakUnits}.`,
    projectedProductSummary: `If the currently connected partial and latent structures converge without introducing new phantom paths, the product projects to ${readyUnits}/${totalUnits} capability(ies) and ${readyRuns}/${totalFlows} flow(s) at least partially real, with readiness ${readiness}.`,
    inferredProductIdentity,
    distanceSummary: `Distance to projected readiness is driven by ${productFacingWeakUnits} product-facing phantom capability(ies), ${systemWeakUnits} system-wide phantom capability(ies), ${input.flowProjection.summary.phantomFlows} phantom flow(s), ${input.parityGaps.summary.totalGaps} structural parity gap(s), and ${input.codacyEvidence.summary.highIssues} HIGH Codacy issue(s).`,
    promiseToProductionDelta,
    externalSignalSummary: input.externalSignalState?.summary,
    surfaces,
    experiences,
    topBlockers: leadingBlockers,
  };
}

