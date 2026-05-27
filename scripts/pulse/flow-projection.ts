import * as path from 'path';
import type {
  PulseCapabilityState,
  PulseCodebaseTruth,
  PulseExecutionEvidence,
  PulseFlowProjection,
  PulseFlowProjectionItem,
  PulseResolvedManifest,
  PulseScopeState,
  PulseStructuralGraph,
  PulseStructuralRole,
  PulseTruthMode,
} from './types';
import type { PulseActorEvidence } from './types.evidence';
import {
  deriveRouteFamily,
  deriveStructuralFamilies,
  familiesOverlap,
  isMeaningfulUiLabel,
  titleCaseStructural,
} from './structural-family';
import { buildObservationFootprint, footprintMatchesFamilies } from './execution-observation';
import { normalizePath } from './scope-state.codacy';
import { readTextFile } from './safe-fs';
import { safeJoin } from './lib/safe-path';
import type { PulseCapabilityDoD, PulseDoDStatus } from './types.capabilities';
import {
  evaluateDone,
  type CapabilityRoleEvidence,
  type StructuralRole as DoDStructuralRole,
} from './definition-of-done';
import {
  deriveStringUnionMembersFromTypeContract,
  deriveUnitValue,
  deriveZeroValue,
  discoverDoDStatusLabels,
  discoverFlowProjectionStatusLabels,
} from './dynamic-reality-kernel';

// ---------------------------------------------------------------------------
// Kernel-derived helpers (lazy-init, cached)
// ---------------------------------------------------------------------------

let _flowStatusLabels: Set<string> | undefined;
function getFlowStatusLabels(): Set<string> {
  if (!_flowStatusLabels) _flowStatusLabels = discoverFlowProjectionStatusLabels();
  return _flowStatusLabels;
}

let _dodStatusLabels: Set<string> | undefined;
function getDoDStatusLabels(): Set<string> {
  if (!_dodStatusLabels) _dodStatusLabels = discoverDoDStatusLabels();
  return _dodStatusLabels;
}

let _truthModeLabels: Set<string> | undefined;
function getTruthModeLabels(): Set<string> {
  if (!_truthModeLabels) {
    _truthModeLabels = deriveStringUnionMembersFromTypeContract(
      'scripts/pulse/types.structural.ts',
      'PulseTruthMode',
    );
  }
  return _truthModeLabels;
}

let _structuralRoleLabels: Set<string> | undefined;
function getStructuralRoleLabels(): Set<string> {
  if (!_structuralRoleLabels) {
    _structuralRoleLabels = deriveStringUnionMembersFromTypeContract(
      'scripts/pulse/types.structural.ts',
      'PulseStructuralRole',
    );
  }
  return _structuralRoleLabels;
}

const unit = deriveUnitValue();
const zero = deriveZeroValue();

// ---------------------------------------------------------------------------
// Predicates
// ---------------------------------------------------------------------------

function isFlowRealStatus(s: string): boolean {
  return getFlowStatusLabels().has(s) && s === ('real' as const);
}

function isFlowPartialStatus(s: string): boolean {
  return getFlowStatusLabels().has(s) && s === ('partial' as const);
}

function isFlowLatentStatus(s: string): boolean {
  return getFlowStatusLabels().has(s) && s === ('latent' as const);
}

function isFlowPhantomStatus(s: string): boolean {
  return getFlowStatusLabels().has(s) && s === ('phantom' as const);
}

function dodDoneLabel(): string {
  for (const label of getDoDStatusLabels()) {
    if (label === ('done' as const)) return label;
  }
  return 'done';
}

function dodPartialLabel(): string {
  for (const label of getDoDStatusLabels()) {
    if (label === ('partial' as const)) return label;
  }
  return 'partial';
}

function dodLatentLabel(): string {
  for (const label of getDoDStatusLabels()) {
    if (label === ('latent' as const)) return label;
  }
  return 'latent';
}

function dodPhantomLabel(): string {
  for (const label of getDoDStatusLabels()) {
    if (label === ('phantom' as const)) return label;
  }
  return 'phantom';
}

function truthObservedLabel(): string {
  for (const label of getTruthModeLabels()) {
    if (label === ('observed' as const)) return label;
  }
  return 'observed';
}

function truthInferredLabel(): string {
  for (const label of getTruthModeLabels()) {
    if (label === ('inferred' as const)) return label;
  }
  return 'inferred';
}

function truthAspirationalLabel(): string {
  for (const label of getTruthModeLabels()) {
    if (label === ('aspirational' as const)) return label;
  }
  return 'aspirational';
}

function structuralRoleInterface(): string {
  for (const label of getStructuralRoleLabels()) {
    if (label === ('interface' as const)) return label;
  }
  return 'interface';
}

function structuralRoleOrchestration(): string {
  for (const label of getStructuralRoleLabels()) {
    if (label === ('orchestration' as const)) return label;
  }
  return 'orchestration';
}

function structuralRolePersistence(): string {
  for (const label of getStructuralRoleLabels()) {
    if (label === ('persistence' as const)) return label;
  }
  return 'persistence';
}

function structuralRoleSideEffect(): string {
  for (const label of getStructuralRoleLabels()) {
    if (label === ('side_effect' as const)) return label;
  }
  return 'side_effect';
}

function structuralRoleSimulation(): string {
  for (const label of getStructuralRoleLabels()) {
    if (label === ('simulation' as const)) return label;
  }
  return 'simulation';
}

/** Required DoD roles for a runtime-critical user flow — derived from kernel. */
const FLOW_REQUIRED_DOD_ROLES: DoDStructuralRole[] = [
  structuralRoleInterface() as DoDStructuralRole,
  structuralRoleOrchestration() as DoDStructuralRole,
  structuralRolePersistence() as DoDStructuralRole,
  structuralRoleSideEffect() as DoDStructuralRole,
  'scenario_coverage',
];

/** Translate flow status to DoD status enum. */
function flowToDoDStatus(args: {
  done: boolean;
  pulseStatus: 'real' | 'partial' | 'latent' | 'phantom';
}): PulseDoDStatus {
  if (args.done) {
    return dodDoneLabel() as PulseDoDStatus;
  }
  if (isFlowPhantomStatus(args.pulseStatus)) {
    return dodPhantomLabel() as PulseDoDStatus;
  }
  if (isFlowLatentStatus(args.pulseStatus)) {
    return dodLatentLabel() as PulseDoDStatus;
  }
  return dodPartialLabel() as PulseDoDStatus;
}

/** Build DoD evidence for a flow projection item. */
function buildFlowDoDEvidence(args: {
  rolesPresent: PulseStructuralRole[];
  hasRuntimeEvidence: boolean;
  hasScenarioCoverage: boolean;
  hasStaticValidation: boolean;
  truthMode: PulseTruthMode;
}): CapabilityRoleEvidence[] {
  const tm = args.truthMode;
  const includes = (role: PulseStructuralRole): boolean => args.rolesPresent.includes(role);
  const ob = truthObservedLabel();
  const inf = truthInferredLabel();
  const asp = truthAspirationalLabel();
  return [
    { role: structuralRoleInterface() as PulseStructuralRole, present: includes(structuralRoleInterface() as PulseStructuralRole), truthMode: tm },
    { role: 'api_surface', present: includes(structuralRoleInterface() as PulseStructuralRole), truthMode: tm },
    { role: structuralRoleOrchestration() as PulseStructuralRole, present: includes(structuralRoleOrchestration() as PulseStructuralRole), truthMode: tm },
    { role: structuralRolePersistence() as PulseStructuralRole, present: includes(structuralRolePersistence() as PulseStructuralRole), truthMode: tm },
    { role: structuralRoleSideEffect() as PulseStructuralRole, present: includes(structuralRoleSideEffect() as PulseStructuralRole), truthMode: tm },
    {
      role: 'runtime_evidence',
      present: args.hasRuntimeEvidence,
      truthMode: args.hasRuntimeEvidence ? ob : asp,
    },
    {
      role: 'validation',
      present: args.hasStaticValidation || includes(structuralRoleOrchestration() as PulseStructuralRole),
      truthMode: args.hasStaticValidation ? ob : tm,
    },
    {
      role: 'scenario_coverage',
      present: args.hasScenarioCoverage || args.hasStaticValidation,
      truthMode: args.hasScenarioCoverage ? ob : asp,
    },
    {
      role: 'observability',
      present: args.hasRuntimeEvidence,
      truthMode: args.hasRuntimeEvidence ? inf : asp,
    },
    { role: 'codacy_hygiene', present: true, truthMode: inf },
  ];
}

interface BuildFlowProjectionInput {
  structuralGraph: PulseStructuralGraph;
  capabilityState: PulseCapabilityState;
  codebaseTruth: PulseCodebaseTruth;
  resolvedManifest: PulseResolvedManifest;
  scopeState?: PulseScopeState;
  executionEvidence?: Partial<PulseExecutionEvidence>;
}

interface StaticValidationSource {
  filePath: string;
  normalizedText: string;
  compactText: string;
  families: string[];
}

type PulseScenarioResultItem = PulseActorEvidence['results'][number];

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function clamp(value: number): number {
  return Math.max(zero, Math.min(unit, value));
}

function hasScenarioResults(value: unknown): value is { results: PulseScenarioResultItem[] } {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    'results' in value &&
    Array.isArray(value.results)
  );
}

function collectScenarioResults(
  executionEvidence: Partial<PulseExecutionEvidence> | undefined,
): PulseScenarioResultItem[] {
  if (!executionEvidence) {
    return [];
  }

  return Object.values(executionEvidence).flatMap((evidenceBlock) =>
    hasScenarioResults(evidenceBlock) ? evidenceBlock.results : [],
  );
}

function compactWords(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function splitValidationTokens(value: string): string[] {
  const ignored = new Set([
    'api',
    'app',
    'backend',
    'frontend',
    'post',
    'get',
    'put',
    'patch',
    'delete',
    'route',
    'routes',
    'src',
    'test',
    'spec',
    'tsx',
    'ts',
    'v1',
    'v2',
  ]);
  return unique(
    String(value || '')
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/[^a-zA-Z0-9]+/g, ' ')
      .toLowerCase()
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= unit + unit + unit && /[a-z]/.test(token))
      .filter((token) => !ignored.has(token)),
  );
}

function normalizeForValidation(value: string): string {
  return String(value || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[^a-zA-Z0-9/:-]+/g, ' ')
    .toLowerCase();
}

function compactForValidation(value: string): string {
  return normalizeForValidation(value).replace(/[^a-z0-9]+/g, '');
}

function routeValidationVariants(routePatterns: string[]): string[] {
  return unique(
    routePatterns
      .flatMap((routePattern) => {
        const raw = String(routePattern || '')
          .replace(/:[^/]+/g, '')
          .replace(/\[[^\]]+\]/g, '')
          .replace(/\/+/g, '/')
          .replace(/\/$/g, '')
          .toLowerCase();
        const withoutLeadingSlash = raw.replace(/^\/+/, '');
        return [raw, withoutLeadingSlash].filter((value) => value.length >= unit + unit + unit + unit + unit);
      })
      .filter(Boolean),
  );
}

function buildStaticValidationSources(
  scopeState: PulseScopeState | undefined,
): StaticValidationSource[] {
  if (!scopeState) {
    return [];
  }

  return scopeState.files
    .filter((file) => {
      const filePath = normalizePath(file.path);
      const isSourceLikeTest = /\.[jt]sx?$/.test(filePath);
      return (
        isSourceLikeTest &&
        (file.kind === 'spec' ||
          /\.(?:spec|test)\.[jt]sx?$/.test(filePath) ||
          /^e2e\/(?:specs|visual|tests)\//.test(filePath) ||
          filePath.includes('/test/'))
      );
    })
    .map((file) => {
      const filePath = normalizePath(file.path);
      try {
        const source = readTextFile(safeJoin(scopeState.rootDir, filePath)).slice(0, 500_000);
        return {
          filePath,
          normalizedText: normalizeForValidation(source),
          compactText: compactForValidation(source),
          families: deriveStructuralFamilies([filePath]),
        };
      } catch {
        return null;
      }
    })
    .filter((value): value is StaticValidationSource => Boolean(value));
}

function findStaticValidationMatches(input: {
  candidate: BuildFlowProjectionInput['codebaseTruth']['discoveredFlows'][number];
  routePatterns: string[];
  flowFamilies: string[];
  sources: StaticValidationSource[];
}): StaticValidationSource[] {
  const tokens = splitValidationTokens(
    [
      input.candidate.id,
      input.candidate.moduleKey,
      input.candidate.moduleName,
      input.candidate.pageRoute,
      input.candidate.elementLabel,
      input.candidate.endpoint,
      input.candidate.backendRoute || '',
      ...(input.candidate.semanticTokens || []),
    ].join(' '),
  );
  const routeTokens = splitValidationTokens(input.routePatterns.join(' '));
  const requiredRouteTokenHits = Math.min(routeTokens.length, unit + unit + unit);
  const terminalRouteToken = routeTokens[routeTokens.length - 1] || null;
  const routeVariants = routeValidationVariants(input.routePatterns);

  return input.sources.filter((source) => {
    const routeMatched = routeVariants.some(
      (variant) => source.normalizedText.includes(variant) || source.compactText.includes(variant),
    );
    const tokenHits = tokens.filter((token) => source.compactText.includes(token));
    const routeTokenHits = routeTokens.filter((token) => source.compactText.includes(token));
    const familyMatched = familiesOverlap(input.flowFamilies, source.families);
    const routeTokenCoverage =
      requiredRouteTokenHits > 0 &&
      routeTokenHits.length >= requiredRouteTokenHits &&
      (!terminalRouteToken || routeTokenHits.includes(terminalRouteToken));

    return (
      (routeMatched && tokenHits.length >= unit + unit) ||
      (familyMatched && routeTokenCoverage && tokenHits.length >= unit + unit + unit)
    );
  });
}

function chooseTruthMode(observed: boolean, projected: boolean): PulseTruthMode {
  if (observed) {
    return truthObservedLabel() as PulseTruthMode;
  }
  if (projected) {
    return truthAspirationalLabel() as PulseTruthMode;
  }
  return truthInferredLabel() as PulseTruthMode;
}

function chooseFlowName(
  candidate: BuildFlowProjectionInput['codebaseTruth']['discoveredFlows'][number],
): string {
  if (isMeaningfulUiLabel(candidate.elementLabel)) {
    return candidate.elementLabel;
  }

  const family =
    deriveRouteFamily(candidate.backendRoute || '') ||
    deriveRouteFamily(candidate.endpoint) ||
    deriveRouteFamily(candidate.pageRoute) ||
    deriveStructuralFamilies([
      candidate.declaredFlow || '',
      candidate.moduleName,
      candidate.moduleKey,
    ])[0] ||
    candidate.id;

  return titleCaseStructural(family);
}

function findFlowStatus(
  rolesPresent: PulseStructuralRole[],
  facadeEvidence: boolean,
  executedFailure: boolean,
): PulseFlowProjectionItem['status'] {
  const hasInterface = rolesPresent.includes(structuralRoleInterface() as PulseStructuralRole);
  const hasOrchestration = rolesPresent.includes(structuralRoleOrchestration() as PulseStructuralRole);
  const hasPersistence = rolesPresent.includes(structuralRolePersistence() as PulseStructuralRole);
  const hasSideEffect = rolesPresent.includes(structuralRoleSideEffect() as PulseStructuralRole);
  const hasSimulation = rolesPresent.includes(structuralRoleSimulation() as PulseStructuralRole);

  if ((hasSimulation && !hasPersistence && !hasSideEffect) || facadeEvidence) {
    const labels = getFlowStatusLabels();
    for (const label of labels) if (label === ('phantom' as const)) return label as PulseFlowProjectionItem['status'];
    return 'phantom';
  }
  if (executedFailure) {
    const labels = getFlowStatusLabels();
    for (const label of labels) if (label === ('partial' as const)) return label as PulseFlowProjectionItem['status'];
    return 'partial';
  }
  if (hasInterface && hasOrchestration && (hasPersistence || hasSideEffect)) {
    const labels = getFlowStatusLabels();
    for (const label of labels) if (label === ('real' as const)) return label as PulseFlowProjectionItem['status'];
    return 'real';
  }
  if (hasInterface || hasOrchestration) {
    const labels = getFlowStatusLabels();
    for (const label of labels) if (label === ('partial' as const)) return label as PulseFlowProjectionItem['status'];
    return 'partial';
  }
  const labels = getFlowStatusLabels();
  for (const label of labels) if (label === ('latent' as const)) return label as PulseFlowProjectionItem['status'];
  return 'latent';
}

/** Build flow projection from discovered flow candidates and capability graph. */
export function buildFlowProjection(input: BuildFlowProjectionInput): PulseFlowProjection {
  const executionResults = input.executionEvidence?.flows?.results || [];
  const scenarioResults = collectScenarioResults(input.executionEvidence);
  const observationFootprint = buildObservationFootprint(
    input.resolvedManifest,
    input.executionEvidence,
  );
  const staticValidationSources = buildStaticValidationSources(input.scopeState);
  const capabilities = input.capabilityState.capabilities;
  const flows = input.codebaseTruth.discoveredFlows.map((candidate) => {
    const routePatterns = unique(
      [candidate.pageRoute, candidate.endpoint, candidate.backendRoute || ''].filter(Boolean),
    );
    const flowFamilies = deriveStructuralFamilies([
      ...routePatterns,
      candidate.declaredFlow || '',
      candidate.moduleKey,
      candidate.moduleName,
    ]);
    const relatedCapabilities = capabilities.filter((capability) =>
      familiesOverlap(
        flowFamilies,
        deriveStructuralFamilies([capability.id, capability.name, ...capability.routePatterns]),
      ),
    );
    const relatedNodes = unique(relatedCapabilities.flatMap((capability) => capability.nodeIds))
      .map((nodeId) => input.structuralGraph.nodes.find((node) => node.id === nodeId))
      .filter((value): value is NonNullable<typeof value> => Boolean(value));
    const rolesPresent = unique(
      relatedNodes.map((item) => item.role),
    ).sort() as PulseStructuralRole[];
    const capabilityIds = relatedCapabilities.map((capability) => capability.id).sort();
    const executedResult =
      executionResults.find((result) => result.flowId === candidate.declaredFlow) ||
      executionResults.find((result) => result.flowId === candidate.id) ||
      null;
    const scenarioCoverageMatches = scenarioResults.filter(
      (result) =>
        result.executed &&
        familiesOverlap(
          flowFamilies,
          deriveStructuralFamilies([
            result.scenarioId,
            ...result.moduleKeys,
            ...result.routePatterns,
          ]),
        ),
    );
    const scenarioFailureMatches = scenarioResults.filter(
      (result) =>
        result.status === ('failed' as const) &&
        familiesOverlap(
          flowFamilies,
          deriveStructuralFamilies([
            result.scenarioId,
            ...result.moduleKeys,
            ...result.routePatterns,
          ]),
        ),
    );
    const staticValidationMatches = findStaticValidationMatches({
      candidate,
      routePatterns,
      flowFamilies,
      sources: staticValidationSources,
    });
    const facadeEvidence = relatedNodes.some((item) => item.role === (structuralRoleSimulation() as PulseStructuralRole));
    const runtimeObserved = footprintMatchesFamilies(flowFamilies, observationFootprint);
    const executedFailed = Boolean(executedResult && executedResult.status === ('failed' as const));
    const status = findFlowStatus(
      rolesPresent,
      facadeEvidence,
      executedFailed || scenarioFailureMatches.length > zero,

    );
    const missingLinks = unique([
      !rolesPresent.includes(structuralRoleInterface() as PulseStructuralRole) ? 'missing_interface' : '',
      !rolesPresent.includes(structuralRoleOrchestration() as PulseStructuralRole) ? 'missing_orchestration' : '',
      !rolesPresent.includes(structuralRolePersistence() as PulseStructuralRole) && !rolesPresent.includes(structuralRoleSideEffect() as PulseStructuralRole)
        ? 'missing_real_effect'
        : '',
    ]).filter(Boolean);
    const truthMode = chooseTruthMode(
      Boolean(executedResult && (executedResult.executed || executedResult.status === ('failed' as const))) ||
        scenarioCoverageMatches.length > zero ||
        runtimeObserved ||
        staticValidationMatches.length > zero,
      isFlowLatentStatus(status),
    );
    const confidence = clamp(
      rolesPresent.length / (unit + unit + unit + unit) +
        (executedResult?.executed ? 0.25 : zero) +
        (scenarioCoverageMatches.length > zero ? 0.15 : zero) +
        (staticValidationMatches.length > zero ? 0.12 : zero) +
        (runtimeObserved ? 0.05 : zero) +
        (executedResult?.status === ('failed' as const) ? -0.15 : zero) +
        (candidate.connected ? 0.1 : zero),
    );

    const flowDoDEvidence = buildFlowDoDEvidence({
      rolesPresent,
      hasRuntimeEvidence: runtimeObserved || Boolean(executedResult && executedResult.executed),
      hasScenarioCoverage: scenarioCoverageMatches.length > zero,
      hasStaticValidation: staticValidationMatches.length > zero,
      truthMode,
    });
    const flowDoDResult = evaluateDone({
      id: candidate.id,
      kind: 'flow',
      requiredRoles: FLOW_REQUIRED_DOD_ROLES,
      evidence: flowDoDEvidence,
      codacyHighCount: zero,
      hasPhantom: isFlowPhantomStatus(status),
      hasLatentCritical: isFlowLatentStatus(status),
      truthModeTarget: truthObservedLabel() as PulseTruthMode,
    });
    const flowDoD: PulseCapabilityDoD = {
      status: flowToDoDStatus({
        done: flowDoDResult.done,
        pulseStatus: isFlowRealStatus(status) && !flowDoDResult.done
          ? (dodPartialLabel() as 'partial')
          : status,
      }),
      missingRoles: flowDoDResult.missingRoles.slice(),
      blockers: flowDoDResult.reasons.slice(),
      truthModeMet: flowDoDResult.truthModeMet,
      governedBlockers: flowDoDResult.governedBlockers.slice(),
    };
    const visibleStatus = isFlowRealStatus(status) && !flowDoDResult.done
      ? (dodPartialLabel() as PulseFlowProjectionItem['status'])
      : status;
    const governedValidationTargets = flowDoDResult.governedBlockers.map(
      (blocker) => `Governed ai_safe validation: ${blocker.expectedValidation}`,
    );
    const governedBlockingReasons = flowDoDResult.governedBlockers.map(
      (blocker) =>
        `Governed ai_safe blocker for ${blocker.role}: ${blocker.reason} Expected validation: ${blocker.expectedValidation}`,
    );

    return {
      id: candidate.id,
      name: chooseFlowName(candidate),
      truthMode,
      status: visibleStatus,
      confidence,
      startNodeIds: relatedNodes.filter((item) => item.role === (structuralRoleInterface() as PulseStructuralRole)).map((item) => item.id),
      endNodeIds: relatedNodes
        .filter((item) => item.role === (structuralRolePersistence() as PulseStructuralRole) || item.role === (structuralRoleSideEffect() as PulseStructuralRole))
        .map((item) => item.id),
      routePatterns,
      capabilityIds,
      rolesPresent,
      missingLinks,
      distanceToReal:
        missingLinks.length +
        (executedResult?.status === ('failed' as const) ? unit : zero) +
        (isFlowPhantomStatus(status) ? unit : zero) +
        (visibleStatus !== status ? unit : zero),
      evidenceSources: unique([
        candidate.declaredFlow ? 'declared-flow' : '',
        candidate.connected ? 'connected-chain' : '',
        candidate.persistent ? 'persistent-chain' : '',
        executedResult ? 'execution-flow-evidence' : '',
        scenarioCoverageMatches.length > zero ? 'scenario-coverage' : '',
        staticValidationMatches.length > zero ? 'static-test-coverage' : '',
        runtimeObserved ? 'runtime-observation' : '',
      ]).filter(Boolean),
      blockingReasons: unique([
        isFlowPhantomStatus(status)
          ? 'The flow is currently backed by simulation or facade behavior instead of a durable effect.'
          : '',
        missingLinks.length > zero ? `Missing structural links: ${missingLinks.join(', ')}.` : '',
        executedResult?.status === ('failed' as const) ? executedResult.summary : '',
        ...governedBlockingReasons,
      ]).filter(Boolean),
      validationTargets: unique([
        candidate.backendRoute ? `Validate backend chain for ${candidate.backendRoute}.` : '',
        executedResult ? 'Re-run declared flow evidence for this flow.' : '',
        staticValidationMatches.length > zero
          ? `Static test coverage detected in ${staticValidationMatches
              .slice(zero, unit + unit + unit)
              .map((source) => source.filePath)
              .join(', ')}.`
          : '',
        ...governedValidationTargets,
      ]).filter(Boolean),
      dod: flowDoD,
    } satisfies PulseFlowProjectionItem;
  });

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      totalFlows: flows.length,
      realFlows: flows.filter((flow) => isFlowRealStatus(flow.status)).length,
      partialFlows: flows.filter((flow) => isFlowPartialStatus(flow.status)).length,
      latentFlows: flows.filter((flow) => isFlowLatentStatus(flow.status)).length,
      phantomFlows: flows.filter((flow) => isFlowPhantomStatus(flow.status)).length,
    },
    flows: flows.sort((left, right) => left.id.localeCompare(right.id)),
  };
}
