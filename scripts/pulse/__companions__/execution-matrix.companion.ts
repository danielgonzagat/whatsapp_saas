function buildBreakpoint(args: {
  chain: PulseExecutionChain | null;
  capability: PulseCapability | null;
  flow: PulseFlowProjectionItem | null;
  status: PulseExecutionMatrixPathStatus;
  observedEvidence: MatrixEvidence[];
}): PulseExecutionMatrixBreakpoint | null {
  const failedEvidence = args.observedEvidence.find((entry) => entry.status === 'failed');
  if (failedEvidence) {
    const firstChainFailure = args.chain?.failurePoints[0] ?? null;
    const failedStep =
      args.chain && firstChainFailure
        ? findChainStepByIndex(args.chain, firstChainFailure.stepIndex)
        : null;
    return {
      stage: failedStep?.role ?? 'unknown',
      stepIndex: firstChainFailure?.stepIndex ?? 0,
      filePath: failedStep?.filesInvolved[0] ?? args.capability?.filePaths[0] ?? null,
      nodeId: failedStep?.nodeId ?? args.capability?.nodeIds[0] ?? null,
      routePattern: args.flow?.routePatterns[0] ?? args.capability?.routePatterns[0] ?? null,
      reason: failedEvidence.summary,
      recovery: failedEvidenceRecoveryGrammar(firstChainFailure),
    };
  }
  const failurePoint = args.chain?.failurePoints[0] ?? null;
  if (failurePoint) {
    const failedStep = args.chain ? findChainStepByIndex(args.chain, failurePoint.stepIndex) : null;
    return {
      stage: failedStep?.role ?? 'unknown',
      stepIndex: failurePoint.stepIndex,
      filePath: failedStep?.filesInvolved[0] ?? null,
      nodeId: failedStep?.nodeId ?? null,
      routePattern: args.flow?.routePatterns[0] ?? args.capability?.routePatterns[0] ?? null,
      reason: failurePoint.reason,
      recovery: failurePoint.recovery,
    };
  }
  if (args.status === 'unreachable') {
    return {
      stage: 'entrypoint',
      stepIndex: 0,
      filePath: args.capability?.filePaths[0] ?? null,
      nodeId: args.capability?.nodeIds[0] ?? null,
      routePattern: args.capability?.routePatterns[0] ?? args.flow?.routePatterns[0] ?? null,
      reason: 'No reachable interface/API entrypoint was found for this path.',
      recovery: 'Connect the path to an interface/API entrypoint or mark it not_executable.',
    };
  }
  if (args.status === 'not_executable') {
    return {
      stage: 'entrypoint',
      stepIndex: 0,
      filePath: args.capability?.filePaths[0] ?? null,
      nodeId: args.capability?.nodeIds[0] ?? null,
      routePattern: args.capability?.routePatterns[0] ?? args.flow?.routePatterns[0] ?? null,
      reason:
        'Path has no executable chain or route-backed entrypoint in the reconstructed matrix.',
      recovery:
        'Connect this capability/flow to an execution chain, route, scenario, or runtime probe before requiring observed pass/fail evidence.',
    };
  }
  if (args.status === 'observation_only' || args.status === 'blocked_human_required') {
    return {
      stage: args.chain?.entrypoint.role ?? 'entrypoint',
      stepIndex: 0,
      filePath: args.chain?.entrypoint.filesInvolved[0] ?? args.capability?.filePaths[0] ?? null,
      nodeId: args.chain?.entrypoint.nodeId ?? args.capability?.nodeIds[0] ?? null,
      routePattern: args.flow?.routePatterns[0] ?? args.capability?.routePatterns[0] ?? null,
      reason:
        'Path maps to governed or protected execution and requires observation-only proof routing before pass/fail evidence can be claimed.',
      recovery:
        'Collect governed validation evidence without autonomous mutation, then attach the resulting observed artifact to this path.',
    };
  }
  if (args.status === 'inferred_only' || args.status === 'untested') {
    const machineProofDebt = args.observedEvidence.find(
      (entry) =>
        entry.source === 'actor' &&
        entry.status === 'missing' &&
        entry.summary.includes('PULSE machine work'),
    );
    const missingRuntimeEvidence = args.observedEvidence.every(
      (entry) => !entry.executed || entry.status === 'mapped' || entry.status === 'missing',
    );
    return {
      stage: args.chain?.entrypoint.role ?? 'entrypoint',
      stepIndex: 0,
      filePath: args.chain?.entrypoint.filesInvolved[0] ?? args.capability?.filePaths[0] ?? null,
      nodeId: args.chain?.entrypoint.nodeId ?? args.capability?.nodeIds[0] ?? null,
      routePattern: args.flow?.routePatterns[0] ?? args.capability?.routePatterns[0] ?? null,
      reason: machineProofDebt
        ? machineProofDebt.summary
        : missingRuntimeEvidence
          ? 'Path is structurally inferred but lacks observed runtime, flow, actor, browser, or external evidence.'
          : 'Path has partial evidence but still lacks the required observed terminal probe.',
      recovery: machineProofDebt
        ? 'Execute or classify the matching customer/soak scenario blueprint and attach terminal runtime evidence before promoting this path to observed.'
        : 'Run or attach a matching runtime, flow, actor, browser, or external probe before promoting this path to observed evidence.',
    };
  }
  return null;
}
function classifyTraversalGrammar(args: {
  capability: PulseCapability | null;
  flow: PulseFlowProjectionItem | null;
  chain: PulseExecutionChain | null;
  observedEvidence: MatrixEvidence[];
  requiredEvidence: PulseExecutionMatrixEvidenceRequirement[];
  hasExecutableEntrypoint: boolean;
}): PulseExecutionMatrixPathStatus {
  if (args.chain && hasItemsGrammar(args.chain.failurePoints)) {
    return args.observedEvidence.some((entry) => isFailureGrammar(entry.status))
      ? 'observed_fail'
      : 'inferred_only';
  }
  if (args.observedEvidence.some((entry) => isFailureGrammar(entry.status))) {
    return 'observed_fail';
  }
  const executedPass = args.observedEvidence.some(
    (entry) => entry.executed && entry.status === 'passed',
  );
  const requiredRuntimeLike = args.requiredEvidence.some(
    (entry) => entry.required && ['integration', 'e2e', 'runtime'].includes(entry.kind),
  );
  if (executedPass && !args.observedEvidence.some((entry) => entry.status === 'failed')) {
    return 'observed_pass';
  }
  if (
    sameGrammar(args.capability?.executionMode, 'human_required') ||
    sameGrammar(args.capability?.executionMode, 'observation_only') ||
    args.capability?.protectedByGovernance
  ) {
    return 'observation_only';
  }
  if (!args.chain && !args.hasExecutableEntrypoint) {
    return 'not_executable';
  }
  if (
    !requiredRuntimeLike &&
    sameGrammar(args.capability?.status, 'real') &&
    sameGrammar(args.capability.truthMode, 'observed')
  ) {
    return 'observed_pass';
  }
  if (
    sameGrammar(args.chain?.truthMode, 'inferred') ||
    sameGrammar(args.capability?.truthMode, 'inferred') ||
    sameGrammar(args.flow?.truthMode, 'inferred')
  ) {
    return 'inferred_only';
  }
  return 'untested';
}
function buildValidationCommand(
  routePatterns: string[],
  pathId: string,
  filePath?: string | null,
): string {
  const route = routePatterns[0];
  if (route) {
    return `node scripts/pulse/run.js --profile pulse-core-final --guidance --json # validate path ${pathId} route ${route}`;
  }
  if (filePath) {
    return `node scripts/pulse/run.js --profile pulse-core-final --guidance --json # validate path ${pathId} file ${filePath}`;
  }
  return `node scripts/pulse/run.js --profile pulse-core-final --guidance --json # validate path ${pathId}`;
}
function deriveTruthMode(
  status: PulseExecutionMatrixPathStatus,
  evidence: MatrixEvidence[],
): PulseTruthMode {
  if (status === 'observed_pass' || status === 'observed_fail') {
    return 'observed';
  }
  if (evidence.some((entry) => entry.source === 'static' || entry.status === 'mapped')) {
    return 'inferred';
  }
  return 'aspirational';
}
function chainKey(chain: PulseExecutionChain): string {
  return collectChainSteps(chain)
    .map((step) => step.nodeId)
    .join('|');
}
function collectChainSteps(chain: PulseExecutionChain): PulseExecutionChain['steps'] {
  return [
    chain.entrypoint,
    ...chain.steps,
    ...chain.conditionalBranches.flatMap((branch) => branch.steps),
  ];
}
function findChainStepByIndex(
  chain: PulseExecutionChain,
  stepIndex: number,
): PulseExecutionChain['steps'][number] | null {
  const primarySteps = [chain.entrypoint, ...chain.steps];
  return primarySteps[stepIndex] ?? collectChainSteps(chain)[stepIndex] ?? null;
}
function buildPathFromChain(args: {
  chain: PulseExecutionChain;
  index: number;
  capabilities: PulseCapability[];
  flows: PulseFlowProjectionItem[];
  executionEvidence: PulseExecutionEvidence;
  externalSignalState?: PulseExternalSignalState;
}): PulseExecutionMatrixPath {
  const chainSteps = collectChainSteps(args.chain);
  const chainNodeIds = chainSteps.map((step) => step.nodeId);
  const chainFiles = unique(chainSteps.flatMap((step) => step.filesInvolved));
  const capability =
    args.capabilities.find((candidate) =>
      candidate.nodeIds.some((nodeId) => chainNodeIds.includes(nodeId)),
    ) ?? null;
  const flow =
    args.flows.find(
      (candidate) =>
        candidate.capabilityIds.some((capabilityId) => capabilityId === capability?.id) ||
        candidate.startNodeIds.some((nodeId) => chainNodeIds.includes(nodeId)) ||
        candidate.endNodeIds.some((nodeId) => chainNodeIds.includes(nodeId)),
    ) ?? null;
  const routePatterns = unique([
    ...(capability?.routePatterns ?? []),
    ...(flow?.routePatterns ?? []),
  ]);
  const requiredEvidence = buildRequiredEvidence({ capability, flow, routePatterns });
  const observedEvidence = collectObservedEvidence({
    capability,
    flow,
    routePatterns,
    executionEvidence: args.executionEvidence,
    externalSignalState: args.externalSignalState,
  });
  const risk: PulseExecutionMatrixPath['risk'] = capability?.runtimeCritical ? 'high' : 'medium';
  const status = classifyTraversalGrammar({
    capability,
    flow,
    chain: args.chain,
    observedEvidence,
    requiredEvidence,
    hasExecutableEntrypoint: true,
  });
  const breakpoint = buildBreakpoint({
    chain: args.chain,
    capability,
    flow,
    status,
    observedEvidence,
  });
  const pathId = `matrix:path:${args.index}:${chainKey(args.chain)}`;
  return {
    pathId,
    capabilityId: capability?.id ?? null,
    flowId: flow?.id ?? null,
    source: 'execution_chain',
    entrypoint: {
      nodeId: args.chain.entrypoint.nodeId,
      filePath: args.chain.entrypoint.filesInvolved[0] ?? null,
      routePattern: routePatterns[0] ?? null,
      description: args.chain.entrypoint.description,
    },
    chain: chainSteps.map((step) => ({
      role: step.role,
      nodeId: step.nodeId,
      filePath: step.filesInvolved[0] ?? null,
      description: step.description,
      truthMode: step.truthMode,
    })),
    status,
    truthMode: deriveTruthMode(status, observedEvidence),
    productStatus: flow?.status ?? capability?.status ?? null,
    breakpoint,
    requiredEvidence,
    observedEvidence,
    validationCommand: buildValidationCommand(routePatterns, pathId, chainFiles[0] ?? null),
    risk,
    executionMode: normalizeExecutionMode(capability?.executionMode, risk),
    confidence: unitConfidenceGrammar(args.chain.confidence.score),
    filePaths: unique([...(capability?.filePaths ?? []), ...chainFiles]),
    routePatterns,
  };
}
function buildSyntheticPath(args: {
  source: 'capability' | 'flow';
  index: number;
  capability: PulseCapability | null;
  flow: PulseFlowProjectionItem | null;
  executionEvidence: PulseExecutionEvidence;
  externalSignalState?: PulseExternalSignalState;
}): PulseExecutionMatrixPath {
  const routePatterns = unique([
    ...(args.capability?.routePatterns ?? []),
    ...(args.flow?.routePatterns ?? []),
  ]);
  const requiredEvidence = buildRequiredEvidence({
    capability: args.capability,
    flow: args.flow,
    routePatterns,
  });
  const observedEvidence = collectObservedEvidence({
    capability: args.capability,
    flow: args.flow,
    routePatterns,
    executionEvidence: args.executionEvidence,
    externalSignalState: args.externalSignalState,
  });
  const risk: PulseExecutionMatrixPath['risk'] =
    isCriticalCapability(args.capability) || flowCriticalityGrammar(args.flow) ? 'high' : 'medium';
  const status = classifyTraversalGrammar({
    capability: args.capability,
    flow: args.flow,
    chain: null,
    observedEvidence,
    requiredEvidence,
    hasExecutableEntrypoint: Boolean(
      routePatterns.length > 0 || args.capability?.nodeIds.length || args.flow?.startNodeIds.length,
    ),
  });
  const breakpoint = buildBreakpoint({
    chain: null,
    capability: args.capability,
    flow: args.flow,
    status,
    observedEvidence,
  });
  const idSource = args.capability?.id ?? args.flow?.id ?? String(args.index);
  const pathId = `matrix:${args.source}:${idSource}`;
  return {
    pathId,
    capabilityId: args.capability?.id ?? null,
    flowId: args.flow?.id ?? null,
    source: args.source,
    entrypoint: {
      nodeId: args.capability?.nodeIds[0] ?? args.flow?.startNodeIds[0] ?? null,
      filePath: args.capability?.filePaths[0] ?? null,
      routePattern: routePatterns[0] ?? null,
      description: args.capability?.name ?? args.flow?.name ?? idSource,
    },
    chain: [],
    status,
    truthMode: deriveTruthMode(status, observedEvidence),
    productStatus: args.flow?.status ?? args.capability?.status ?? null,
    breakpoint,
    requiredEvidence,
    observedEvidence,
    validationCommand: buildValidationCommand(
      routePatterns,
      pathId,
      args.capability?.filePaths[0] ?? null,
    ),
    risk,
    executionMode: normalizeExecutionMode(args.capability?.executionMode, risk),
    confidence: fallbackConfidenceGrammar(args.capability, args.flow),
    filePaths: unique(args.capability?.filePaths ?? []),
    routePatterns,
  };
}
function structuralRoleGrammar(
  node: PulseStructuralNode,
): PulseExecutionMatrixPath['chain'][number]['role'] {
  const roleByKind: Partial<Record<StructuralGraphKind, MatrixChainRole>> = {
    ui_element: 'trigger',
    api_call: 'client_api',
    backend_route: 'controller',
    proxy_route: 'controller',
    service_trace: 'service',
    persistence_model: 'persistence',
    side_effect_signal: 'side_effect',
  };
  const fallbackRole = sameGrammar(node.role, 'interface') ? 'interface' : 'orchestration';
  return roleByKind[node.kind] ?? fallbackRole;
}
function routePatternsFromNode(node: PulseStructuralNode): string[] {
  const values = [
    node.metadata.route,
    node.metadata.routePattern,
    node.metadata.endpoint,
    node.metadata.path,
  ];
  return unique(
    values
      .flatMap((value) => (Array.isArray(value) ? value : [value]))
      .filter((value): value is string => isRouteTextGrammar(value)),
  );
}

function isRouteTextGrammar(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('/');
}
function buildPathFromStructuralNode(args: {
  node: PulseStructuralNode;
  index: number;
  executionEvidence: PulseExecutionEvidence;
  externalSignalState?: PulseExternalSignalState;
}): PulseExecutionMatrixPath {
  const routePatterns = routePatternsFromNode(args.node);
  const observedEvidence = collectObservedEvidence({
    capability: null,
    flow: null,
    routePatterns,
    executionEvidence: args.executionEvidence,
    externalSignalState: args.externalSignalState,
  });
  const risk: PulseExecutionMatrixPath['risk'] =
    args.node.runtimeCritical || args.node.userFacing ? 'high' : 'medium';
  const status: PulseExecutionMatrixPathStatus = observedEvidence.some(
    (entry) => entry.status === 'failed',
  )
    ? 'observed_fail'
    : observedEvidence.some((entry) => entry.executed && entry.status === 'passed')
      ? 'observed_pass'
      : args.node.protectedByGovernance
        ? 'observation_only'
        : routePatterns.length > 0 || args.node.role === 'interface'
          ? 'inferred_only'
          : 'not_executable';
  const pathId = `matrix:node:${args.index}:${args.node.id}`;
  const breakpoint =
    status === 'observed_fail'
      ? {
          stage: structuralRoleGrammar(args.node),
          stepIndex: 0,
          filePath: args.node.file || null,
          nodeId: args.node.id,
          routePattern: routePatterns[0] ?? null,
          reason:
            observedEvidence.find((entry) => entry.status === 'failed')?.summary ??
            'Structural node has observed failing evidence.',
          recovery: 'Inspect the node evidence and regenerate PULSE_EXECUTION_MATRIX.json.',
        }
      : status === 'inferred_only' || status === 'not_executable' || status === 'observation_only'
        ? {
            stage: structuralRoleGrammar(args.node),
            stepIndex: 0,
            filePath: args.node.file || null,
            nodeId: args.node.id,
            routePattern: routePatterns[0] ?? null,
            reason:
              status === 'observation_only'
                ? 'Structural node maps to protected governance or observation-only execution; autonomous pass/fail probing is not permitted.'
                : routePatterns.length > 0
                  ? 'Structural node has a route-like entrypoint but no matching observed runtime, browser, flow, actor, or external evidence.'
                  : 'Structural node has no route-like entrypoint, so it cannot be promoted by an HTTP probe without additional parser mapping.',
            recovery: structuralNodeRecoveryGrammar(status, routePatterns),
          }
        : null;
  return {
    pathId,
    capabilityId: null,
    flowId: null,
    source: 'structural_node',
    entrypoint: {
      nodeId: args.node.id,
      filePath: args.node.file || null,
      routePattern: routePatterns[0] ?? null,
      description: args.node.label || args.node.kind,
    },
    chain: [
      {
        role: structuralRoleGrammar(args.node),
        nodeId: args.node.id,
        filePath: args.node.file || null,
        description: args.node.label || args.node.kind,
        truthMode: args.node.truthMode,
      },
    ],
    status,
    truthMode: deriveTruthMode(status, observedEvidence),
    productStatus: null,
    breakpoint,
    requiredEvidence: [
      {
        kind: 'static',
        required: true,
        reason: 'Every structural graph node must be represented in the execution matrix.',
      },
      {
        kind: routePatterns.length > 0 ? 'integration' : 'static',
        required: routePatterns.length > 0,
        reason:
          routePatterns.length > 0
            ? 'Route-like structural nodes need an executable probe.'
            : 'Non-route structural nodes are classified as static traversal targets.',
      },
    ],
    observedEvidence:
      observedEvidence.length > 0
        ? observedEvidence
        : [
            {
              source: 'static',
              artifactPath: artifactGrammar('static'),
              executed: true,
              status: 'mapped',
              summary: 'Structural node is represented in the execution matrix.',
            },
          ],
    validationCommand: buildValidationCommand(routePatterns, pathId, args.node.file || null),
    risk,
    executionMode: normalizeExecutionMode(
      args.node.protectedByGovernance ? 'observation_only' : 'ai_safe',
      risk,
    ),
    confidence: nodeConfidenceGrammar(args.node.truthMode),
    filePaths: unique([args.node.file]),
    routePatterns,
  };
}
function buildPathFromScopeFile(file: PulseScopeFile, index: number): PulseExecutionMatrixPath {
  const pathId = `matrix:file:${index}:${file.path}`;
  const executable =
    file.kind === 'source' ||
    file.kind === 'spec' ||
    file.kind === 'migration' ||
    file.kind === 'config';
  const status: PulseExecutionMatrixPathStatus = 'not_executable';
  const risk: PulseExecutionMatrixPath['risk'] =
    file.runtimeCritical || file.userFacing ? 'high' : 'medium';
  return {
    pathId,
    capabilityId: null,
    flowId: null,
    source: 'scope_file',
    entrypoint: {
      nodeId: null,
      filePath: file.path,
      routePattern: null,
      description: `${file.surface}/${file.kind}: ${file.path}`,
    },
    chain: [],
    status,
    truthMode: status === 'not_executable' ? 'inferred' : 'inferred',
    productStatus: null,
    breakpoint:
      status === 'not_executable'
        ? {
            stage: 'unknown',
            stepIndex: 0,
            filePath: file.path,
            nodeId: null,
            routePattern: null,
            reason: executable
              ? 'File is an inventory fallback, not an independently executable product path.'
              : 'File is non-executable inventory and cannot produce runtime evidence by itself.',
            recovery:
              'Connect this file to a structural graph node, capability, flow, scenario, or parser evidence before requiring path-level runtime proof.',
          }
        : null,
    requiredEvidence: [
      {
        kind: 'static',
        required: true,
        reason: 'Every in-scope repository file must be represented in the execution matrix.',
      },
    ],
    observedEvidence: [
      {
        source: 'static',
        artifactPath: 'PULSE_SCOPE_STATE.json',
        executed: true,
        status: 'mapped',
        summary: 'File was discovered by the repo filesystem scope inventory.',
      },
    ],
    validationCommand: buildValidationCommand([], pathId, file.path),
    risk,
    executionMode: normalizeExecutionMode(file.executionMode, risk),
    confidence: fileConfidenceGrammar(file),
    filePaths: [file.path],
    routePatterns: [],
  };
}
function summarize(paths: PulseExecutionMatrixPath[]): PulseExecutionMatrix['summary'] {
  const byStatus = Object.fromEntries(
    terminalStatusGrammar().map((status) => [
      status,
      paths.filter((path) => sameGrammar(path.status, status)).length,
    ]),
  ) as Record<PulseExecutionMatrixPathStatus, number>;
  const bySource = Object.fromEntries(
    matrixSourceGrammar().map((source) => [
      source,
      paths.filter((path) => sameGrammar(path.source, source)).length,
    ]),
  ) as Record<PulseExecutionMatrixPathSource, number>;
  const terminalPaths = paths.filter((path) =>
    terminalStatusGrammar().includes(path.status),
  ).length;
  const classifiablePaths = paths.filter((path) =>
    differsGrammar(path.status, 'not_executable'),
  ).length;
  const classifiedPaths = paths.filter((path) => differsGrammar(path.status, 'untested')).length;
  return {
    totalPaths: paths.length,
    bySource,
    byStatus,
    observedPass: byStatus.observed_pass,
    observedFail: byStatus.observed_fail,
    untested: byStatus.untested,
    blockedHumanRequired: byStatus.blocked_human_required,
    unreachable: byStatus.unreachable,
    inferredOnly: byStatus.inferred_only,
    notExecutable: byStatus.not_executable,
    terminalPaths,
    nonTerminalPaths: paths.length - terminalPaths,
    unknownPaths: paths.length - terminalPaths,
    criticalUnobservedPaths: paths.filter(
      (path) => isElevatedRiskGrammar(path.risk) && !terminalClassificationGrammar(path),
    ).length,
    impreciseBreakpoints: paths.filter(
      (path) => sameGrammar(path.status, 'observed_fail') && !hasPreciseBreakpoint(path.breakpoint),
    ).length,
    coveragePercent:
      classifiablePaths > 0
        ? Math.min(100, Math.round((classifiedPaths / classifiablePaths) * 100))
        : 100,
  };
}
function terminalClassificationGrammar(path: PulseExecutionMatrixPath): boolean {
  const observedTerminal = ['observed_pass', 'observed_fail'].includes(path.status);
  const breakpointTerminal = [
    'not_executable',
    'unreachable',
    'observation_only',
    'blocked_human_required',
    'inferred_only',
    'untested',
  ].includes(path.status);
  return observedTerminal || (breakpointTerminal && hasPreciseBreakpoint(path.breakpoint));
}
function hasPreciseBreakpoint(breakpoint: PulseExecutionMatrixBreakpoint | null): boolean {
  if (!breakpoint) {
    return false;
  }
  const hasLocation = Boolean(breakpoint.filePath || breakpoint.nodeId || breakpoint.routePattern);
  return hasLocation && breakpoint.reason.length > 0 && breakpoint.recovery.length > 0;
}
/** Build the canonical matrix that classifies every discovered executable path. */
export function buildExecutionMatrix(input: BuildExecutionMatrixInput): PulseExecutionMatrix {
  const paths: PulseExecutionMatrixPath[] = [];
  const coveredCapabilityIds = new Set<string>();
  const coveredFlowIds = new Set<string>();
  const coveredNodeIds = new Set<string>();
  const coveredFiles = new Set<string>();
  input.executionChains.chains.forEach((chain, index) => {
    const path = buildPathFromChain({
      chain,
      index,
      capabilities: input.capabilityState.capabilities,
      flows: input.flowProjection.flows,
      executionEvidence: input.executionEvidence,
      externalSignalState: input.externalSignalState,
    });
    paths.push(path);
    if (path.capabilityId) {
      coveredCapabilityIds.add(path.capabilityId);
    }
    if (path.flowId) {
      coveredFlowIds.add(path.flowId);
    }
    for (const step of path.chain) {
      coveredNodeIds.add(step.nodeId);
    }
    for (const filePath of path.filePaths) {
      coveredFiles.add(filePath);
    }
  });
  input.capabilityState.capabilities.forEach((capability, index) => {
    if (coveredCapabilityIds.has(capability.id)) {
      return;
    }
    paths.push(
      buildSyntheticPath({
        source: 'capability',
        index,
        capability,
        flow: null,
        executionEvidence: input.executionEvidence,
        externalSignalState: input.externalSignalState,
      }),
    );
    for (const nodeId of capability.nodeIds) {
      coveredNodeIds.add(nodeId);
    }
    for (const filePath of capability.filePaths) {
      coveredFiles.add(filePath);
    }
  });
  input.flowProjection.flows.forEach((flow, index) => {
    if (coveredFlowIds.has(flow.id)) {
      return;
    }
    const capability =
      input.capabilityState.capabilities.find((candidate) =>
        flow.capabilityIds.includes(candidate.id),
      ) ?? null;
    paths.push(
      buildSyntheticPath({
        source: 'flow',
        index,
        capability,
        flow,
        executionEvidence: input.executionEvidence,
        externalSignalState: input.externalSignalState,
      }),
    );
    for (const nodeId of [...flow.startNodeIds, ...flow.endNodeIds]) {
      coveredNodeIds.add(nodeId);
    }
  });
  input.structuralGraph.nodes.forEach((node, index) => {
    if (coveredNodeIds.has(node.id)) {
      return;
    }
    paths.push(
      buildPathFromStructuralNode({
        node,
        index,
        executionEvidence: input.executionEvidence,
        externalSignalState: input.externalSignalState,
      }),
    );
    if (node.file) {
      coveredFiles.add(node.file);
    }
  });
  input.scopeState.files.forEach((file, index) => {
    if (coveredFiles.has(file.path)) {
      return;
    }
    paths.push(buildPathFromScopeFile(file, index));
  });
  return {
    generatedAt: new Date().toISOString(),
    summary: summarize(paths),
    paths: paths.sort((left, right) => {
      const riskDelta = riskOrderGrammar(right.risk) - riskOrderGrammar(left.risk);
      if (differsGrammar(riskDelta, zeroGrammar())) return riskDelta;
      return left.pathId.localeCompare(right.pathId);
    }),
  };
}

