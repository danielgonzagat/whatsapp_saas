import type {
  PulseCapability,
  PulseCapabilityState,
  PulseExecutionChain,
  PulseExecutionChainSet,
  PulseExecutionEvidence,
  PulseExecutionMatrix,
  PulseExecutionMatrixBreakpoint,
  PulseExecutionMatrixEvidenceRequirement,
  PulseExecutionMatrixObservedEvidence,
  PulseExecutionMatrixPath,
  PulseExecutionMatrixPathSource,
  PulseExecutionMatrixPathStatus,
  PulseExternalSignalState,
  PulseFlowProjection,
  PulseFlowProjectionItem,
  PulseScopeFile,
  PulseScopeState,
  PulseStructuralGraph,
  PulseStructuralNode,
  PulseTruthMode,
} from './types';

interface BuildExecutionMatrixInput {
  structuralGraph: PulseStructuralGraph;
  scopeState: PulseScopeState;
  executionChains: PulseExecutionChainSet;
  capabilityState: PulseCapabilityState;
  flowProjection: PulseFlowProjection;
  executionEvidence: PulseExecutionEvidence;
  externalSignalState?: PulseExternalSignalState;
}

type MatrixEvidence = PulseExecutionMatrixObservedEvidence;

const TERMINAL_STATUSES: PulseExecutionMatrixPathStatus[] = [
  'observed_pass',
  'observed_fail',
  'untested',
  'blocked_human_required',
  'unreachable',
  'inferred_only',
  'not_executable',
];

const MATRIX_SOURCES: PulseExecutionMatrixPathSource[] = [
  'execution_chain',
  'capability',
  'flow',
  'structural_node',
  'scope_file',
];

const MATRIX_ARTIFACTS = {
  runtime: 'PULSE_RUNTIME_EVIDENCE.json',
  browser: 'PULSE_BROWSER_EVIDENCE.json',
  flow: 'PULSE_FLOW_EVIDENCE.json',
  actor: 'PULSE_SCENARIO_EVIDENCE.json',
  external: 'PULSE_EXTERNAL_SIGNAL_STATE.json',
  static: 'PULSE_CERTIFICATE.json',
};

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function includesAny(haystack: string, needles: string[]): boolean {
  const normalized = haystack.toLowerCase();
  return needles.some((needle) => needle.length > 0 && normalized.includes(needle.toLowerCase()));
}

function routeMatches(routePatterns: string[], value: string): boolean {
  if (routePatterns.length === 0 || value.length === 0) {
    return false;
  }
  return includesAny(value, routePatterns) || routePatterns.some((route) => value.includes(route));
}

function evidenceTextMatchesPath(args: {
  capabilityId: string | null;
  flowId: string | null;
  routePatterns: string[];
  values: string[];
}): boolean {
  const needles = [
    args.capabilityId,
    args.flowId,
    ...args.routePatterns,
  ].filter((value): value is string => Boolean(value));
  return args.values.some((value) => includesAny(value, needles) || routeMatches(args.routePatterns, value));
}

function browserPassRateFailed(passRate: number | undefined): boolean {
  if (passRate === undefined) {
    return false;
  }
  return passRate > 1 ? passRate < 100 : passRate < 1;
}

function isCriticalCapability(capability: PulseCapability | null): boolean {
  return Boolean(capability?.runtimeCritical || capability?.userFacing);
}

function isCriticalFlow(flow: PulseFlowProjectionItem | null): boolean {
  return Boolean(flow && (flow.status === 'real' || flow.routePatterns.length > 0));
}

function buildRequiredEvidence(args: {
  capability: PulseCapability | null;
  flow: PulseFlowProjectionItem | null;
  routePatterns: string[];
}): PulseExecutionMatrixEvidenceRequirement[] {
  const requirements: PulseExecutionMatrixEvidenceRequirement[] = [
    {
      kind: 'static',
      required: true,
      reason: 'The path must be present in the static structural graph.',
    },
  ];

  if (args.routePatterns.length > 0) {
    requirements.push({
      kind: 'integration',
      required: true,
      reason: 'Route-backed paths need an API or integration probe.',
    });
  }
  if (args.capability?.userFacing || args.flow) {
    requirements.push({
      kind: 'e2e',
      required: true,
      reason: 'User-facing or flow-backed paths need browser/scenario coverage.',
    });
  }
  if (
    args.capability?.runtimeCritical ||
    args.capability?.maturity.dimensions.runtimeEvidencePresent
  ) {
    requirements.push({
      kind: 'runtime',
      required: true,
      reason: 'Runtime-critical paths need observed runtime or external evidence.',
    });
  }
  return requirements;
}

function collectObservedEvidence(args: {
  capability: PulseCapability | null;
  flow: PulseFlowProjectionItem | null;
  routePatterns: string[];
  executionEvidence: PulseExecutionEvidence;
  externalSignalState?: PulseExternalSignalState;
}): MatrixEvidence[] {
  const evidence: MatrixEvidence[] = [];
  const capabilityId = args.capability?.id ?? null;
  const flowId = args.flow?.id ?? null;
  const routePatterns = args.routePatterns;

  const browser = args.executionEvidence.browser;
  if (
    browser.attempted &&
    evidenceTextMatchesPath({
      capabilityId,
      flowId,
      routePatterns,
      values: [browser.summary, ...browser.artifactPaths],
    })
  ) {
    const browserFailed =
      (browser.failureCode !== undefined && browser.failureCode !== 'ok') ||
      (browser.blockingInteractions !== undefined && browser.blockingInteractions > 0) ||
      browserPassRateFailed(browser.passRate);
    evidence.push({
      source: 'browser',
      artifactPath: MATRIX_ARTIFACTS.browser,
      executed: browser.executed,
      status: browserFailed ? 'failed' : browser.executed ? 'passed' : 'missing',
      summary: browser.summary,
    });
  }

  for (const probe of args.executionEvidence.runtime.probes) {
    if (
      routeMatches(routePatterns, probe.target) ||
      (capabilityId && includesAny(probe.summary, [capabilityId])) ||
      (flowId && includesAny(probe.summary, [flowId]))
    ) {
      evidence.push({
        source: 'runtime',
        artifactPath: MATRIX_ARTIFACTS.runtime,
        executed: probe.executed,
        status: probe.status === 'passed' ? 'passed' : probe.status === 'failed' ? 'failed' : 'missing',
        summary: probe.summary,
      });
    }
  }

  for (const result of args.executionEvidence.flows.results) {
    if (
      result.flowId === flowId ||
      routeMatches(routePatterns, result.summary)
    ) {
      evidence.push({
        source: 'flow',
        artifactPath: MATRIX_ARTIFACTS.flow,
        executed: result.executed,
        status:
          result.status === 'passed'
            ? 'passed'
            : result.status === 'failed'
              ? 'failed'
              : result.status === 'skipped'
                ? 'skipped'
                : 'missing',
        summary: result.summary,
      });
    }
  }

  for (const result of [
    ...args.executionEvidence.customer.results,
    ...args.executionEvidence.operator.results,
    ...args.executionEvidence.admin.results,
    ...args.executionEvidence.soak.results,
  ]) {
    const scenarioValues = unique([
      result.scenarioId,
      result.summary,
      ...result.artifactPaths,
      ...result.moduleKeys,
      ...result.routePatterns,
      ...result.specsExecuted,
      ...result.worldStateTouches,
    ]);
    if (
      (flowId && result.scenarioId.includes(flowId)) ||
      (capabilityId && result.scenarioId.includes(capabilityId)) ||
      evidenceTextMatchesPath({
        capabilityId,
        flowId,
        routePatterns,
        values: scenarioValues,
      })
    ) {
      evidence.push({
        source: 'actor',
        artifactPath: MATRIX_ARTIFACTS.actor,
        executed: result.executed,
        status:
          result.status === 'passed'
            ? 'passed'
            : result.status === 'failed'
              ? 'failed'
              : result.status === 'skipped'
                ? 'skipped'
                : 'missing',
        summary: result.summary,
      });
    }
  }

  for (const signal of args.externalSignalState?.signals ?? []) {
    if (
      (capabilityId && signal.capabilityIds.includes(capabilityId)) ||
      (flowId && signal.flowIds.includes(flowId)) ||
      routePatterns.some((route) => signal.routePatterns.includes(route)) ||
      routeMatches(routePatterns, signal.summary)
    ) {
      evidence.push({
        source: 'external',
        artifactPath: MATRIX_ARTIFACTS.external,
        executed: true,
        status: signal.impactScore >= 0.8 ? 'failed' : 'mapped',
        summary: signal.summary,
      });
    }
  }

  if (args.capability || args.flow) {
    evidence.push({
      source: 'static',
      artifactPath: MATRIX_ARTIFACTS.static,
      executed: true,
      status: 'mapped',
      summary: 'Path is represented in static capability/flow reconstruction.',
    });
  }

  return evidence;
}

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
      routePattern:
        args.flow?.routePatterns[0] ?? args.capability?.routePatterns[0] ?? null,
      reason: failedEvidence.summary,
      recovery: firstChainFailure?.recovery ?? 'Inspect failing observed evidence and rerun the path probe.',
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
      routePattern:
        args.flow?.routePatterns[0] ?? args.capability?.routePatterns[0] ?? null,
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

  if (args.status === 'inferred_only' || args.status === 'untested') {
    const missingRuntimeEvidence = args.observedEvidence.every(
      (entry) => !entry.executed || entry.status === 'mapped' || entry.status === 'missing',
    );
    return {
      stage: args.chain?.entrypoint.role ?? 'entrypoint',
      stepIndex: 0,
      filePath:
        args.chain?.entrypoint.filesInvolved[0] ??
        args.capability?.filePaths[0] ??
        null,
      nodeId: args.chain?.entrypoint.nodeId ?? args.capability?.nodeIds[0] ?? null,
      routePattern:
        args.flow?.routePatterns[0] ?? args.capability?.routePatterns[0] ?? null,
      reason: missingRuntimeEvidence
        ? 'Path is structurally inferred but lacks observed runtime, flow, actor, browser, or external evidence.'
        : 'Path has partial evidence but still lacks the required observed terminal probe.',
      recovery:
        'Run or attach a matching runtime, flow, actor, browser, or external probe before promoting this path to observed evidence.',
    };
  }

  return null;
}

function classifyPath(args: {
  capability: PulseCapability | null;
  flow: PulseFlowProjectionItem | null;
  chain: PulseExecutionChain | null;
  observedEvidence: MatrixEvidence[];
  requiredEvidence: PulseExecutionMatrixEvidenceRequirement[];
}): PulseExecutionMatrixPathStatus {
  if (args.capability?.executionMode === 'human_required') {
    return 'blocked_human_required';
  }
  if (!args.chain && !args.capability?.routePatterns.length && !args.flow?.routePatterns.length) {
    return 'not_executable';
  }
  if (args.chain && args.chain.failurePoints.length > 0) {
    return args.observedEvidence.some((entry) => entry.status === 'failed')
      ? 'observed_fail'
      : 'inferred_only';
  }
  if (args.observedEvidence.some((entry) => entry.status === 'failed')) {
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
  if (!requiredRuntimeLike && args.capability?.status === 'real' && args.capability.truthMode === 'observed') {
    return 'observed_pass';
  }
  if ((args.capability?.routePatterns.length ?? 0) === 0 && (args.flow?.routePatterns.length ?? 0) === 0) {
    return 'unreachable';
  }
  if (args.chain?.truthMode === 'inferred' || args.capability?.truthMode === 'inferred' || args.flow?.truthMode === 'inferred') {
    return 'inferred_only';
  }
  return 'untested';
}

function buildValidationCommand(routePatterns: string[], pathId: string, filePath?: string | null): string {
  const route = routePatterns[0];
  if (route) {
    return `node scripts/pulse/run.js --profile pulse-core-final --guidance --json # validate path ${pathId} route ${route}`;
  }
  if (filePath) {
    return `node scripts/pulse/run.js --profile pulse-core-final --guidance --json # validate path ${pathId} file ${filePath}`;
  }
  return `node scripts/pulse/run.js --profile pulse-core-final --guidance --json # validate path ${pathId}`;
}

function deriveTruthMode(status: PulseExecutionMatrixPathStatus, evidence: MatrixEvidence[]): PulseTruthMode {
  if (status === 'observed_pass' || status === 'observed_fail') {
    return 'observed';
  }
  if (evidence.some((entry) => entry.source === 'static' || entry.status === 'mapped')) {
    return 'inferred';
  }
  return 'aspirational';
}

function chainKey(chain: PulseExecutionChain): string {
  return collectChainSteps(chain).map((step) => step.nodeId).join('|');
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
    args.flows.find((candidate) =>
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
  const status = classifyPath({
    capability,
    flow,
    chain: args.chain,
    observedEvidence,
    requiredEvidence,
  });
  const breakpoint = buildBreakpoint({ chain: args.chain, capability, flow, status, observedEvidence });
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
    risk: capability?.runtimeCritical ? 'high' : 'medium',
    executionMode: capability?.executionMode === 'human_required' ? 'human_required' : 'ai_safe',
    confidence: Math.min(1, Math.max(0, args.chain.confidence.score)),
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
  const status = classifyPath({
    capability: args.capability,
    flow: args.flow,
    chain: null,
    observedEvidence,
    requiredEvidence,
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
    validationCommand: buildValidationCommand(routePatterns, pathId, args.capability?.filePaths[0] ?? null),
    risk:
      isCriticalCapability(args.capability) || isCriticalFlow(args.flow) ? 'high' : 'medium',
    executionMode: args.capability?.executionMode === 'human_required' ? 'human_required' : 'ai_safe',
    confidence: args.capability?.confidence ?? args.flow?.confidence ?? 0.5,
    filePaths: unique(args.capability?.filePaths ?? []),
    routePatterns,
  };
}

function mapNodeRoleToChainRole(node: PulseStructuralNode): PulseExecutionMatrixPath['chain'][number]['role'] {
  if (node.kind === 'ui_element') {
    return 'trigger';
  }
  if (node.kind === 'api_call') {
    return 'client_api';
  }
  if (node.kind === 'backend_route' || node.kind === 'proxy_route') {
    return 'controller';
  }
  if (node.kind === 'service_trace') {
    return 'service';
  }
  if (node.kind === 'persistence_model') {
    return 'persistence';
  }
  if (node.kind === 'side_effect_signal') {
    return 'side_effect';
  }
  return node.role === 'interface' ? 'interface' : 'orchestration';
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
      .filter((value): value is string => typeof value === 'string' && value.startsWith('/')),
  );
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
  const status: PulseExecutionMatrixPathStatus =
    observedEvidence.some((entry) => entry.status === 'failed')
      ? 'observed_fail'
      : observedEvidence.some((entry) => entry.executed && entry.status === 'passed')
        ? 'observed_pass'
        : args.node.protectedByGovernance
          ? 'blocked_human_required'
          : routePatterns.length > 0 || args.node.role === 'interface'
            ? 'inferred_only'
            : 'not_executable';
  const pathId = `matrix:node:${args.index}:${args.node.id}`;
  const breakpoint =
    status === 'observed_fail'
      ? {
          stage: mapNodeRoleToChainRole(args.node),
          stepIndex: 0,
          filePath: args.node.file || null,
          nodeId: args.node.id,
          routePattern: routePatterns[0] ?? null,
          reason:
            observedEvidence.find((entry) => entry.status === 'failed')?.summary ??
            'Structural node has observed failing evidence.',
          recovery: 'Inspect the node evidence and regenerate PULSE_EXECUTION_MATRIX.json.',
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
        role: mapNodeRoleToChainRole(args.node),
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
              artifactPath: MATRIX_ARTIFACTS.static,
              executed: true,
              status: 'mapped',
              summary: 'Structural node is represented in the execution matrix.',
            },
          ],
    validationCommand: buildValidationCommand(routePatterns, pathId, args.node.file || null),
    risk: args.node.runtimeCritical || args.node.userFacing ? 'high' : 'medium',
    executionMode: args.node.protectedByGovernance ? 'human_required' : 'ai_safe',
    confidence: args.node.truthMode === 'observed' ? 0.9 : args.node.truthMode === 'inferred' ? 0.65 : 0.35,
    filePaths: unique([args.node.file]),
    routePatterns,
  };
}

function buildPathFromScopeFile(file: PulseScopeFile, index: number): PulseExecutionMatrixPath {
  const pathId = `matrix:file:${index}:${file.path}`;
  const executable =
    file.kind === 'source' || file.kind === 'spec' || file.kind === 'migration' || file.kind === 'config';
  const status: PulseExecutionMatrixPathStatus = file.protectedByGovernance
    ? 'blocked_human_required'
    : executable
      ? 'inferred_only'
      : 'not_executable';
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
      status === 'inferred_only'
        ? {
            stage: 'unknown',
            stepIndex: 0,
            filePath: file.path,
            nodeId: null,
            routePattern: null,
            reason: 'File is in repo scope but is not connected to a structural execution node.',
            recovery: 'Add parser coverage or connect this file to structural graph/capability/flow reconstruction.',
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
    risk: file.runtimeCritical || file.userFacing ? 'high' : 'medium',
    executionMode: file.executionMode,
    confidence: file.structuralHints && file.structuralHints.length > 0 ? 0.65 : 0.45,
    filePaths: [file.path],
    routePatterns: [],
  };
}

function summarize(paths: PulseExecutionMatrixPath[]): PulseExecutionMatrix['summary'] {
  const byStatus = Object.fromEntries(
    TERMINAL_STATUSES.map((status) => [
      status,
      paths.filter((path) => path.status === status).length,
    ]),
  ) as Record<PulseExecutionMatrixPathStatus, number>;
  const bySource = Object.fromEntries(
    MATRIX_SOURCES.map((source) => [
      source,
      paths.filter((path) => path.source === source).length,
    ]),
  ) as Record<PulseExecutionMatrixPathSource, number>;
  const terminalPaths = paths.filter((path) => TERMINAL_STATUSES.includes(path.status)).length;
  const classifiablePaths = paths.filter((path) => path.status !== 'not_executable').length;
  const classifiedPaths = paths.filter((path) => path.status !== 'untested').length;
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
      (path) =>
        path.risk === 'high' &&
        !['observed_pass', 'observed_fail', 'blocked_human_required'].includes(path.status),
    ).length,
    impreciseBreakpoints: paths.filter(
      (path) => path.status === 'observed_fail' && !hasPreciseBreakpoint(path.breakpoint),
    ).length,
    coveragePercent:
      classifiablePaths > 0
        ? Math.min(100, Math.round((classifiedPaths / classifiablePaths) * 100))
        : 100,
  };
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
      const riskDelta = Number(right.risk === 'high') - Number(left.risk === 'high');
      if (riskDelta !== 0) {
        return riskDelta;
      }
      return left.pathId.localeCompare(right.pathId);
    }),
  };
}
