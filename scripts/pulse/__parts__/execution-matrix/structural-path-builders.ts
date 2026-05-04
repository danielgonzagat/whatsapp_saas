import type {
  PulseExecutionEvidence,
  PulseExecutionMatrixPath,
  PulseExecutionMatrixPathStatus,
  PulseExternalSignalState,
  PulseScopeFile,
  PulseStructuralNode,
} from '../../types';
import { artifactGrammar, hasItemsGrammar, normalizeExecutionMode, sameGrammar } from './grammar';
import {
  fileConfidenceGrammar,
  nodeConfidenceGrammar,
  structuralNodeRecoveryGrammar,
  unique,
} from './evidence-checkers';
import { collectObservedEvidence } from './evidence-collector';
import { buildValidationCommand, deriveTruthMode } from './traversal';

export function structuralRoleGrammar(
  node: PulseStructuralNode,
): PulseExecutionMatrixPath['chain'][number]['role'] {
  const roleByKind: Partial<
    Record<PulseStructuralNode['kind'], PulseExecutionMatrixPath['chain'][number]['role']>
  > = {
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

export function routePatternsFromNode(node: PulseStructuralNode): string[] {
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

export function isRouteTextGrammar(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('/');
}

export function buildPathFromStructuralNode(args: {
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

export function buildPathFromScopeFile(
  file: PulseScopeFile,
  index: number,
): PulseExecutionMatrixPath {
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
