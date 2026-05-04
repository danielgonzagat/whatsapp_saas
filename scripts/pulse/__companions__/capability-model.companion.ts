export function buildCapabilityState(input: BuildCapabilityStateInput): PulseCapabilityState {
  const nodeById = new Map(input.structuralGraph.nodes.map((node) => [node.id, node] as const));
  const neighbors = new Map<string, Set<string>>();
  const nodeFamilies = new Map<string, string[]>();
  const primaryFamilyByNode = new Map<string, string | null>();

  for (const node of input.structuralGraph.nodes) {
    neighbors.set(node.id, new Set<string>());
    nodeFamilies.set(node.id, getNodeFamilies(node));
    primaryFamilyByNode.set(node.id, getPrimaryFamily(node));
  }

  for (const edge of input.structuralGraph.edges) {
    if (!neighbors.has(edge.from)) {
      neighbors.set(edge.from, new Set<string>());
    }
    neighbors.get(edge.from)!.add(edge.to);
  }

  const routePatternsByReachableNode = new Map<string, Set<string>>();
  const reachableRoutePatternLimitValue = reachableRoutePatternLimit(input.structuralGraph.nodes);
  const registerReachableRoutePattern = (nodeId: string, routePattern: string) => {
    if (!routePatternsByReachableNode.has(nodeId)) {
      routePatternsByReachableNode.set(nodeId, new Set<string>());
    }
    const patterns = routePatternsByReachableNode.get(nodeId)!;
    if (patterns.size < reachableRoutePatternLimitValue) {
      patterns.add(routePattern);
    }
  };
  const interfaceSeedNodes = input.structuralGraph.nodes.filter((node) => {
    if (node.kind === 'proxy_route' || node.kind === 'backend_route') {
      return true;
    }
    return Array.isArray(node.metadata.triggers) && node.metadata.triggers.length > 0;
  });
  for (const seedNode of interfaceSeedNodes) {
    const seedPatterns = getNodeRoutePatterns(seedNode);
    if (seedPatterns.length === 0) {
      continue;
    }
    const queue = [{ nodeId: seedNode.id, depth: 0 }];
    const visited = new Set<string>();
    const traversalDepthLimit = graphTraversalDepthLimit({
      nodeCount: input.structuralGraph.nodes.length,
      edgeCount: input.structuralGraph.edges.length,
      seedPatternCount: seedPatterns.length,
    });
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current || visited.has(current.nodeId) || current.depth > traversalDepthLimit) {
        continue;
      }
      visited.add(current.nodeId);
      for (const routePattern of seedPatterns) {
        registerReachableRoutePattern(current.nodeId, routePattern);
      }
      const currentNode = nodeById.get(current.nodeId);
      if (!currentNode || roleBlocksTraversal(currentNode.role)) {
        continue;
      }
      for (const neighborId of neighbors.get(current.nodeId) || []) {
        queue.push({ nodeId: neighborId, depth: current.depth + 1 });
      }
    }
  }

  const scopeByPath = new Map(input.scopeState.files.map((file) => [file.path, file] as const));
  const flowResults = input.executionEvidence?.flows?.results || [];
  const scenarioResults = collectScenarioResults(input.executionEvidence);
  const observationFootprint = buildObservationFootprint(
    input.resolvedManifest,
    input.executionEvidence,
  );
  const capabilitiesById = new Map<string, PulseCapability>();
  const visitedByPrimaryCapability = new Set<string>();
  const apiBackedUiFiles = new Set(
    [
      ...input.structuralGraph.nodes.filter(
        (node) => node.kind === 'ui_element' && hasApiCalls(node),
      ),
      ...input.structuralGraph.nodes.filter((node) => node.kind === 'api_call'),
    ]
      .map((node) => node.file)
      .filter(Boolean),
  );
  const skippedServiceSeedFiles = new Set<string>();
  for (const edge of input.structuralGraph.edges) {
    const fromNode = nodeById.get(edge.from);
    const toNode = nodeById.get(edge.to);
    if (
      sameToken(edge.kind, 'orchestrates') &&
      sameToken(fromNode?.kind, 'backend_route') &&
      sameToken(toNode?.kind, 'service_trace') &&
      toNode.file
    ) {
      skippedServiceSeedFiles.add(toNode.file);
    }
  }

  const processGroup = (group: CapabilitySeedGroup, coverEntireComponent: boolean) => {
    const seedNodeIds = coverEntireComponent
      ? [...group.seedNodeIds].filter((nodeId) => !visitedByPrimaryCapability.has(nodeId))
      : [...group.seedNodeIds];
    const queue = seedNodeIds.map((nodeId) => ({ nodeId, depth: 0 }));
    const componentIds = new Set<string>();

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) {
        continue;
      }
      if (componentIds.has(current.nodeId) || current.depth > 4) {
        continue;
      }

      const currentNode = nodeById.get(current.nodeId);
      if (!currentNode) {
        continue;
      }

      componentIds.add(current.nodeId);
      if (current.depth === 0 || coverEntireComponent) {
        visitedByPrimaryCapability.add(current.nodeId);
      }

      if (roleBlocksTraversal(currentNode.role)) {
        continue;
      }

      for (const neighborId of neighbors.get(current.nodeId) || []) {
        if (componentIds.has(neighborId)) {
          continue;
        }
        const neighborNode = nodeById.get(neighborId);
        if (!neighborNode) {
          continue;
        }
        const neighborFamilies = nodeFamilies.get(neighborId) || [];
        if (
          shouldTraverseNeighbor(
            currentNode,
            neighborNode,
            group.family,
            neighborFamilies,
            primaryFamilyByNode.get(neighborId) || null,
          )
        ) {
          queue.push({ nodeId: neighborId, depth: current.depth + 1 });
        }
      }
    }

    if (componentIds.size === 0) {
      return;
    }

    const componentNodes = [...componentIds]
      .map((nodeId) => nodeById.get(nodeId))
      .filter((value): value is NonNullable<typeof value> => Boolean(value));
    const filePaths = unique(componentNodes.map((item) => item.file).filter(Boolean)).sort();
    const routePatterns = unique(
      componentNodes.flatMap((item) => [
        ...getNodeRoutePatterns(item),
        ...(roleContributesRouteEvidence(item.role)
          ? [...(routePatternsByReachableNode.get(item.id) || new Set<string>())]
          : []),
      ]),
    ).sort();
    const routeExposesInterface = componentNodes.some(
      (item) =>
        nodeKindExposesInterface(item.kind) ||
        (Array.isArray(item.metadata.triggers) && item.metadata.triggers.length > 0) ||
        Boolean(routePatternsByReachableNode.get(item.id)?.size),
    );
    const rolesPresent = unique([
      ...componentNodes.map((item) => item.role),
      routeExposesInterface ? 'interface' : '',
    ])
      .filter(Boolean)
      .sort() as PulseStructuralRole[];
    const scopeFiles = filePaths
      .map((filePath) => scopeByPath.get(filePath))
      .filter((value): value is NonNullable<typeof value> => Boolean(value));
    const ownerLane = pickOwnerLane(scopeFiles.map((file) => file.ownerLane));
    const executionMode = pickExecutionMode(scopeFiles.map((file) => file.executionMode));
    const protectedByGovernance =
      componentNodes.some((item) => item.protectedByGovernance) ||
      scopeFiles.some((item) => item.protectedByGovernance);
    const runtimeCritical =
      componentNodes.some((item) => item.runtimeCritical) ||
      scopeFiles.some((item) => item.runtimeCritical);
    const userFacing =
      componentNodes.some((item) => item.userFacing) || scopeFiles.some((item) => item.userFacing);
    const codacyIssueCount = scopeFiles.reduce(
      (sum, file) => sum + fallbackNumber(file.observedCodacyIssueCount),
      zero(),
    );
    const highSeverityIssueCount = scopeFiles.reduce(
      (sum, file) => sum + fallbackNumber(file.highSeverityIssueCount),
      zero(),
    );
    const routeFamilies = unique(
      routePatterns.map((routePattern) => deriveRouteFamily(routePattern)).filter(Boolean),
    ) as string[];
    const fallbackCapabilityKey = slugifyStructural([...componentIds].sort().join(' '));
    const capabilityId = `capability:${slugifyStructural(group.family) || fallbackCapabilityKey}`;
    const flowEvidenceMatches = flowResults.filter(
      (result) =>
        routeFamilies.some((family) => result.flowId.includes(family)) ||
        result.flowId.includes(slugifyStructural(group.family)),
    );
    const observedFlowEvidenceMatches = flowEvidenceMatches.filter(
      (result) => result.executed || isObservedFailedStatus(result.status),
    );
    const dominantLabel = chooseDominantLabel(
      componentNodes,
      routePatterns,
      fallbackCapabilityKey,
      group.family,
    );
    const capabilityFamilies = deriveStructuralFamilies([
      group.family,
      capabilityId,
      dominantLabel,
      ...routePatterns,
      ...filePaths,
    ]);
    const simulationOnly = rolesPresent.includes('simulation') && rolesPresent.length === 1;
    const scenarioCoverageMatches = scenarioResults.filter(
      (result) =>
        result.executed &&
        familiesOverlap(
          [group.family, capabilityId, dominantLabel, ...routePatterns],
          deriveStructuralFamilies([
            result.scenarioId,
            ...result.moduleKeys,
            ...result.routePatterns,
          ]),
        ),
    );
    const scenarioFailureMatches = scenarioResults.filter(
      (result) =>
        isObservedFailedStatus(result.status) &&
        familiesOverlap(
          [group.family, capabilityId, dominantLabel, ...routePatterns],
          deriveStructuralFamilies([
            result.scenarioId,
            ...result.moduleKeys,
            ...result.routePatterns,
          ]),
        ),
    );
    const runtimeObserved = footprintMatchesFamilies(capabilityFamilies, observationFootprint);
    const executedEvidenceCount =
      observedFlowEvidenceMatches.length + scenarioCoverageMatches.length + Number(runtimeObserved);
    const hasObservedFailure =
      observedFlowEvidenceMatches.some((result) => isObservedFailedStatus(result.status)) ||
      scenarioFailureMatches.length > 0 ||
      (nonzero(highSeverityIssueCount) && runtimeCritical);
    const status = inferStatus(rolesPresent, simulationOnly, hasObservedFailure);
    const missingRoles = missingProductionRoles(rolesPresent);
    const truthMode = chooseTruthMode(nonzero(executedEvidenceCount), statusIs(status, 'latent'));
    const completenessScore = capabilityCompletenessScore(rolesPresent);
    const confidence = confidenceFromCapabilityEvidence({
      completenessScore,
      executedEvidenceCount,
      runtimeObserved,
      highSeverityIssueCount,
      componentNodeCount: componentNodes.length,
    });
    const evidenceSources = unique([
      ...componentNodes.map((item) => item.adapter),
      observedFlowEvidenceMatches.length > 0 ? 'execution-flow-evidence' : '',
      scenarioCoverageMatches.length > 0 ? 'scenario-coverage' : '',
      runtimeObserved ? 'runtime-observation' : '',
    ]).filter(Boolean);
    const maturity = buildCapabilityMaturity({
      rolesPresent,
      routePatterns,
      flowEvidenceMatches: observedFlowEvidenceMatches,
      scenarioCoverageMatches: scenarioCoverageMatches.map((result) => ({
        scenarioId: result.scenarioId,
      })),
      runtimeObserved,
      highSeverityIssueCount,
      simulationOnly,
      status,
    });
    const blockingReasons = unique([
      status === 'phantom'
        ? 'The capability exposes simulation signals without persistence or verified side effects.'
        : '',
      nonzero(missingRoles.length) ? `Missing structural roles: ${missingRoles.join(', ')}.` : '',
      nonzero(maturity.missing.length)
        ? `Maturity is still missing: ${maturity.missing.slice(0, 4).join(', ')}.`
        : '',
      nonzero(highSeverityIssueCount)
        ? `Codacy still reports ${highSeverityIssueCount} HIGH issue(s) inside this capability.`
        : '',
      protectedByGovernance
        ? 'Part of this capability lives on a governance-protected surface.'
        : '',
    ]).filter(Boolean);

    const existing = capabilitiesById.get(capabilityId);
    if (existing) {
      capabilitiesById.set(
        capabilityId,
        mergeExistingCapability({
          capabilityId,
          existing,
          rolesPresent,
          routePatterns,
          filePaths,
          componentIds,
          evidenceSources,
          ownerLane,
          executionMode,
          protectedByGovernance,
          runtimeCritical,
          userFacing,
          highSeverityIssueCount,
          codacyIssueCount,
          confidence,
          truthMode,
          maturity,
        }),
      );
      return;
    }

    const dodEvidence = buildCapabilityDoDEvidence({
      rolesPresent,
      hasRuntimeEvidence: runtimeObserved || nonzero(observedFlowEvidenceMatches.length),
      hasScenarioCoverage: nonzero(scenarioCoverageMatches.length),
      hasObservability: maturity.dimensions.runtimeEvidencePresent,
      hasValidation: rolesPresent.includes('orchestration'),
      highSeverityIssueCount,
      truthMode,
    });
    const dodResult = evaluateDone({
      id: capabilityId,
      kind: 'capability',
      requiredRoles: CAPABILITY_REQUIRED_DOD_ROLES,
      evidence: dodEvidence,
      codacyHighCount: highSeverityIssueCount,
      hasPhantom: statusIs(status, 'phantom'),
      hasLatentCritical: statusIs(status, 'latent') && runtimeCritical,
      truthModeTarget: 'observed',
    });
    const capabilityDoD: PulseCapabilityDoD = {
      status: toDoDStatus({
        done: dodResult.done,
        pulseStatus: statusIs(status, 'real') && !dodResult.done ? 'partial' : status,
      }),
      missingRoles: dodResult.missingRoles.slice(),
      blockers: dodResult.reasons.slice(),
      truthModeMet: dodResult.truthModeMet,
      governedBlockers: dodResult.governedBlockers.slice(),
    };
    const visibleStatus = statusIs(status, 'real') && !dodResult.done ? 'partial' : status;
    const governedValidationTargets = dodResult.governedBlockers.map(
      (blocker) => `Governed ai_safe validation: ${blocker.expectedValidation}`,
    );
    const governedBlockingReasons = dodResult.governedBlockers.map(
      (blocker) =>
        `Governed ai_safe blocker for ${blocker.role}: ${blocker.reason} Expected validation: ${blocker.expectedValidation}`,
    );

    capabilitiesById.set(capabilityId, {
      id: capabilityId,
      name: dominantLabel,
      truthMode,
      status: visibleStatus,
      confidence,
      userFacing,
      runtimeCritical,
      protectedByGovernance,
      ownerLane,
      executionMode,
      rolesPresent,
      missingRoles,
      filePaths,
      nodeIds: [...componentIds].sort(),
      routePatterns,
      evidenceSources,
      codacyIssueCount,
      highSeverityIssueCount,
      blockingReasons: unique([...blockingReasons, ...governedBlockingReasons]),
      maturity,
      validationTargets: unique([
        routePatterns[0] ? `Validate structural chain for ${routePatterns[0]}.` : '',
        runtimeCritical ? 'Re-run runtime evidence for this capability.' : '',
        nonzero(highSeverityIssueCount) ? 'Re-sync Codacy and confirm HIGH issues dropped.' : '',
        ...governedValidationTargets,
      ]).filter(Boolean),
      dod: capabilityDoD,
    });
  };

  const seedGroups = buildSeedGroups(
    input.structuralGraph.nodes,
    apiBackedUiFiles,
    skippedServiceSeedFiles,
    getPrimaryFamily,
  );
  for (const group of seedGroups) {
    processGroup(group, group.seedNodeIds.size <= input.structuralGraph.nodes.length);
  }

  const fallbackGroups = buildFallbackGroups(
    input.structuralGraph.nodes,
    visitedByPrimaryCapability,
    apiBackedUiFiles,
    skippedServiceSeedFiles,
    getPrimaryFamily,
  );
  for (const group of fallbackGroups) {
    processGroup(group, group.seedNodeIds.size > input.structuralGraph.nodes.length);
  }

  const sortedCapabilities = [...capabilitiesById.values()].sort((left, right) =>
    left.id.localeCompare(right.id),
  );

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      totalCapabilities: sortedCapabilities.length,
      realCapabilities: countCapabilityStatus(sortedCapabilities, 'real'),
      partialCapabilities: countCapabilityStatus(sortedCapabilities, 'partial'),
      latentCapabilities: countCapabilityStatus(sortedCapabilities, 'latent'),
      phantomCapabilities: countCapabilityStatus(sortedCapabilities, 'phantom'),
      humanRequiredCapabilities: countHumanRequiredCapabilities(sortedCapabilities),
      foundationalCapabilities: countMaturityStage(sortedCapabilities, 'foundational'),
      connectedCapabilities: countMaturityStage(sortedCapabilities, 'connected'),
      operationalCapabilities: countMaturityStage(sortedCapabilities, 'operational'),
      productionReadyCapabilities: countMaturityStage(sortedCapabilities, 'production_ready'),
      runtimeObservedCapabilities: sortedCapabilities.filter(
        (item) => item.maturity.dimensions.runtimeEvidencePresent,
      ).length,
      scenarioCoveredCapabilities: sortedCapabilities.filter(
        (item) => item.maturity.dimensions.scenarioCoveragePresent,
      ).length,
    },
    capabilities: sortedCapabilities,
  };
}

