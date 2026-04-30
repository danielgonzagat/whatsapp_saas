/**
 * PULSE proof synthesis compiler.
 *
 * Converts structural path, node, and behavior evidence into planned proof
 * targets. It is intentionally plan-only: these records must never count as
 * observed execution evidence until a runner attaches attempts/timestamps.
 */

import type { BehaviorNode, BehaviorNodeKind } from './types.behavior-graph';
import type { PulseExecutionMatrixPath } from './types.execution-matrix';
import type { PathCoverageEntry } from './types.path-coverage-engine';
import { ensureDir, pathExists, readJsonFile, writeTextFile } from './safe-fs';
import { safeJoin } from './safe-path';

const ARTIFACT_FILENAME = 'PULSE_PROOF_SYNTHESIS.json';

export type ProofSynthesisSourceKind =
  | 'pure_function'
  | 'endpoint'
  | 'ui_action'
  | 'worker'
  | 'webhook'
  | 'state_mutation';

export type ProofSynthesisPlanType =
  | 'property'
  | 'api_probe'
  | 'fuzz'
  | 'playwright'
  | 'queue_fixture'
  | 'replay'
  | 'before_after';

export interface ProofSynthesisInput {
  id: string;
  name: string;
  filePath: string | null;
  nodeId?: string | null;
  pathId?: string | null;
  routePattern?: string | null;
  httpMethod?: string | null;
  behaviorKind?: BehaviorNodeKind | null;
  sourceKind?: ProofSynthesisSourceKind | null;
  stateMutation?: boolean;
  validationCommand?: string | null;
  evidenceReason?: string | null;
}

export interface ProofValidationTarget {
  targetId: string;
  engine: 'property-tester' | 'api-fuzzer' | 'ui-crawler' | 'execution-harness' | 'replay-adapter';
  artifactPath: string;
  command: string;
}

export interface ProofSynthesisPlan {
  planId: string;
  targetId: string;
  sourceKind: ProofSynthesisSourceKind;
  proofType: ProofSynthesisPlanType;
  executionReality: 'planned';
  observed: false;
  countsAsObserved: false;
  validationTarget: ProofValidationTarget;
  reason: string;
}

export interface ProofSynthesisTarget {
  targetId: string;
  name: string;
  filePath: string | null;
  nodeId: string | null;
  pathId: string | null;
  routePattern: string | null;
  httpMethod: string | null;
  sourceKind: ProofSynthesisSourceKind;
  plans: ProofSynthesisPlan[];
}

export interface ProofSynthesisState {
  generatedAt: string;
  summary: {
    totalTargets: number;
    totalPlans: number;
    plannedPlans: number;
    observedPlans: 0;
    targetsWithoutPlan: number;
  };
  targets: ProofSynthesisTarget[];
}

function unique(values: ProofSynthesisPlanType[]): ProofSynthesisPlanType[] {
  return [...new Set(values)];
}

function isStateMutationKind(kind: BehaviorNodeKind | null | undefined): boolean {
  return kind === 'db_writer' || kind === 'side_effect';
}

function isPureFunctionKind(kind: BehaviorNodeKind | null | undefined): boolean {
  return (
    kind === 'function_definition' ||
    kind === 'method_definition' ||
    kind === 'validation' ||
    kind === 'transformation'
  );
}

function normalizeSourceKind(input: ProofSynthesisInput): ProofSynthesisSourceKind {
  if (input.sourceKind) {
    return input.sourceKind;
  }

  if (input.behaviorKind === 'webhook_receiver' || /\bwebhook\b/i.test(input.routePattern ?? '')) {
    return 'webhook';
  }

  if (input.behaviorKind === 'queue_consumer' || input.behaviorKind === 'queue_producer') {
    return 'worker';
  }

  if (input.behaviorKind === 'ui_action') {
    return 'ui_action';
  }

  if (
    input.behaviorKind === 'api_endpoint' ||
    Boolean(input.httpMethod) ||
    Boolean(input.routePattern)
  ) {
    return 'endpoint';
  }

  if (input.stateMutation || isStateMutationKind(input.behaviorKind)) {
    return 'state_mutation';
  }

  if (isPureFunctionKind(input.behaviorKind)) {
    return 'pure_function';
  }

  if (input.filePath && /(?:^|\/)frontend\//.test(input.filePath)) {
    return 'ui_action';
  }

  return 'pure_function';
}

function proofTypesForSource(input: ProofSynthesisInput): ProofSynthesisPlanType[] {
  const sourceKind = normalizeSourceKind(input);
  const baseBySource: Record<ProofSynthesisSourceKind, ProofSynthesisPlanType[]> = {
    pure_function: ['property'],
    endpoint: ['api_probe', 'fuzz'],
    ui_action: ['playwright'],
    worker: ['queue_fixture'],
    webhook: ['replay'],
    state_mutation: ['before_after'],
  };

  const proofTypes = [...baseBySource[sourceKind]];
  if (
    sourceKind !== 'state_mutation' &&
    (input.stateMutation || isStateMutationKind(input.behaviorKind))
  ) {
    proofTypes.push('before_after');
  }

  return unique(proofTypes);
}

function validationTargetFor(
  input: ProofSynthesisInput,
  proofType: ProofSynthesisPlanType,
): ProofValidationTarget {
  const targetId = input.id;
  const fallbackCommand = `node scripts/pulse/run.js --guidance # proof-synthesis ${targetId}`;

  if (proofType === 'property') {
    return {
      targetId,
      engine: 'property-tester',
      artifactPath: '.pulse/current/PULSE_PROPERTY_EVIDENCE.json',
      command: fallbackCommand,
    };
  }

  if (proofType === 'api_probe' || proofType === 'fuzz') {
    return {
      targetId,
      engine: 'api-fuzzer',
      artifactPath: '.pulse/current/PULSE_API_FUZZ_EVIDENCE.json',
      command: input.validationCommand ?? fallbackCommand,
    };
  }

  if (proofType === 'playwright') {
    return {
      targetId,
      engine: 'ui-crawler',
      artifactPath: '.pulse/current/PULSE_CRAWLER_EVIDENCE.json',
      command: input.validationCommand ?? fallbackCommand,
    };
  }

  if (proofType === 'replay') {
    return {
      targetId,
      engine: 'replay-adapter',
      artifactPath: '.pulse/current/PULSE_REPLAY_STATE.json',
      command: input.validationCommand ?? fallbackCommand,
    };
  }

  return {
    targetId,
    engine: 'execution-harness',
    artifactPath: '.pulse/current/PULSE_HARNESS_EVIDENCE.json',
    command: input.validationCommand ?? fallbackCommand,
  };
}

function reasonFor(input: ProofSynthesisInput, proofType: ProofSynthesisPlanType): string {
  if (input.evidenceReason) {
    return `${input.evidenceReason}; planned ${proofType} proof is required before observation.`;
  }

  return `${normalizeSourceKind(input)} evidence for ${input.name} requires planned ${proofType} validation before it can be observed.`;
}

/** Build plan records for one node/path/behavior evidence item. */
export function synthesizeProofPlans(input: ProofSynthesisInput): ProofSynthesisTarget {
  const sourceKind = normalizeSourceKind(input);
  const plans = proofTypesForSource(input).map((proofType) => ({
    planId: `${input.id}:${proofType}`,
    targetId: input.id,
    sourceKind,
    proofType,
    executionReality: 'planned' as const,
    observed: false as const,
    countsAsObserved: false as const,
    validationTarget: validationTargetFor(input, proofType),
    reason: reasonFor(input, proofType),
  }));

  return {
    targetId: input.id,
    name: input.name,
    filePath: input.filePath,
    nodeId: input.nodeId ?? null,
    pathId: input.pathId ?? null,
    routePattern: input.routePattern ?? null,
    httpMethod: input.httpMethod ?? null,
    sourceKind,
    plans,
  };
}

function fromBehaviorNode(node: BehaviorNode): ProofSynthesisInput {
  return {
    id: node.id,
    name: node.name,
    filePath: node.filePath,
    nodeId: node.id,
    routePattern: null,
    httpMethod: null,
    behaviorKind: node.kind,
    stateMutation:
      node.stateAccess.some((access) => access.operation !== 'read') ||
      node.outputs.some((output) => output.kind === 'db_write' || output.kind === 'cache_write'),
    evidenceReason: `Behavior node kind=${node.kind}`,
  };
}

function fromMatrixPath(pathEntry: PulseExecutionMatrixPath): ProofSynthesisInput {
  const filePath = pathEntry.entrypoint.filePath ?? pathEntry.filePaths[0] ?? null;
  return {
    id: pathEntry.pathId,
    name: pathEntry.entrypoint.description,
    filePath,
    nodeId: pathEntry.entrypoint.nodeId,
    pathId: pathEntry.pathId,
    routePattern: pathEntry.entrypoint.routePattern ?? pathEntry.routePatterns[0] ?? null,
    httpMethod: null,
    sourceKind:
      pathEntry.entrypoint.routePattern || pathEntry.routePatterns.length > 0 ? 'endpoint' : null,
    stateMutation: pathEntry.requiredEvidence.some((evidence) => evidence.kind === 'runtime'),
    validationCommand: pathEntry.validationCommand,
    evidenceReason: pathEntry.breakpoint?.reason ?? `Execution matrix status=${pathEntry.status}`,
  };
}

function fromCoverageEntry(entry: PathCoverageEntry): ProofSynthesisInput {
  return {
    id: entry.pathId,
    name: entry.entrypoint,
    filePath: entry.terminalProof.breakpoint?.filePath ?? null,
    nodeId: entry.terminalProof.breakpoint?.nodeId ?? null,
    pathId: entry.pathId,
    routePattern: entry.terminalProof.breakpoint?.routePattern ?? null,
    httpMethod: null,
    sourceKind: entry.terminalProof.breakpoint?.routePattern ? 'endpoint' : null,
    validationCommand: entry.validationCommand,
    evidenceReason: entry.terminalReason,
  };
}

function dedupeTargets(targets: ProofSynthesisTarget[]): ProofSynthesisTarget[] {
  const byId = new Map<string, ProofSynthesisTarget>();

  for (const target of targets) {
    if (!byId.has(target.targetId)) {
      byId.set(target.targetId, target);
      continue;
    }

    const existing = byId.get(target.targetId);
    if (!existing) {
      continue;
    }

    const plansById = new Map(existing.plans.map((plan) => [plan.planId, plan]));
    for (const plan of target.plans) {
      plansById.set(plan.planId, plan);
    }
    byId.set(target.targetId, {
      ...existing,
      plans: [...plansById.values()],
    });
  }

  return [...byId.values()];
}

function readBehaviorNodes(rootDir: string): BehaviorNode[] {
  const artifactPath = safeJoin(rootDir, '.pulse', 'current', 'PULSE_BEHAVIOR_GRAPH.json');
  if (!pathExists(artifactPath)) {
    return [];
  }

  return readJsonFile<{ nodes?: BehaviorNode[] }>(artifactPath).nodes ?? [];
}

function readMatrixPaths(rootDir: string): PulseExecutionMatrixPath[] {
  const artifactPath = safeJoin(rootDir, '.pulse', 'current', 'PULSE_EXECUTION_MATRIX.json');
  if (!pathExists(artifactPath)) {
    return [];
  }

  return readJsonFile<{ paths?: PulseExecutionMatrixPath[] }>(artifactPath).paths ?? [];
}

function readCoverageEntries(rootDir: string): PathCoverageEntry[] {
  const artifactPath = safeJoin(rootDir, '.pulse', 'current', 'PULSE_PATH_COVERAGE.json');
  if (!pathExists(artifactPath)) {
    return [];
  }

  return readJsonFile<{ paths?: PathCoverageEntry[] }>(artifactPath).paths ?? [];
}

export function buildProofSynthesisState(
  rootDir: string,
  inputOverride?: ProofSynthesisInput[],
): ProofSynthesisState {
  const inputs = inputOverride ?? [
    ...readBehaviorNodes(rootDir).map(fromBehaviorNode),
    ...readMatrixPaths(rootDir).map(fromMatrixPath),
    ...readCoverageEntries(rootDir).map(fromCoverageEntry),
  ];

  const targets = dedupeTargets(inputs.map(synthesizeProofPlans));
  const totalPlans = targets.reduce((sum, target) => sum + target.plans.length, 0);

  const state: ProofSynthesisState = {
    generatedAt: new Date().toISOString(),
    summary: {
      totalTargets: targets.length,
      totalPlans,
      plannedPlans: totalPlans,
      observedPlans: 0,
      targetsWithoutPlan: targets.filter((target) => target.plans.length === 0).length,
    },
    targets,
  };

  const outputDir = safeJoin(rootDir, '.pulse', 'current');
  ensureDir(outputDir, { recursive: true });
  writeTextFile(safeJoin(outputDir, ARTIFACT_FILENAME), JSON.stringify(state, null, 2));

  return state;
}
