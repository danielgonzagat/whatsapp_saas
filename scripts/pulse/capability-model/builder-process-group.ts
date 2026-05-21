import type { PulseCapability } from '../types.capabilities/03-capability';
import type { PulseExecutionEvidence } from '../types.evidence';
import type { PulseScopeState } from '../types.truth.scope';
import type { PulseStructuralGraph, PulseStructuralRole } from '../types.structural';
import type { PulseObservationFootprint } from '../execution-observation';
import {
  deriveRouteFamily,
  deriveStructuralFamilies,
  familiesOverlap,
  slugifyStructural,
} from '../structural-family';
import { footprintMatchesFamilies } from '../execution-observation';
import {
  deriveUnitValue,
  deriveZeroValue,
} from '../dynamic-reality-kernel/catalog-arithmetic';
import {
  buildCapabilityMaturity,
  chooseTruthMode,
  capabilityCompletenessScore,
  confidenceFromCapabilityEvidence,
  inferStatus,
  missingProductionRoles,
  pickExecutionMode,
  pickOwnerLane,
  unique,
} from '../capability-model-helpers/main';
import {
  chooseDominantLabel,
  getNodeRoutePatterns,
  shouldTraverseNeighbor,
} from '../capability-model-helpers/graph-helpers';
import type { PulseCapabilityDoD } from '../types.capabilities/02-maturity-dod';
import { evaluateDone } from '../definition-of-done';
import {
  CAPABILITY_REQUIRED_DOD_ROLES,
  buildCapabilityDoDEvidence,
  toDoDStatus,
} from '../capability-model.dod';
import { mergeExistingCapability } from '../capability-model.merge';
import {
  isObservedFailedStatus,
  nodeKindExposesInterface,
  roleBlocksTraversal,
  roleContributesRouteEvidence,
  statusIs,
} from './groups';
import { collectScenarioResults } from './groups';
import type { CapabilitySeedGroup } from '../capability-seed-groups';

type PulseStructuralNode = PulseStructuralGraph['nodes'][number];
type PulseScopeFile = PulseScopeState['files'][number];
type PulseFlowResult = NonNullable<PulseExecutionEvidence['flows']>['results'][number];
type PulseScenarioResultItem = ReturnType<typeof collectScenarioResults>[number];

export interface ProcessGroupContext {
  nodeById: Map<string, PulseStructuralNode>;
  neighbors: Map<string, Set<string>>;
  nodeFamilies: Map<string, string[]>;
  primaryFamilyByNode: Map<string, string | null>;
  routePatternsByReachableNode: Map<string, Set<string>>;
  scopeByPath: Map<string, PulseScopeFile>;
  flowResults: PulseFlowResult[];
  scenarioResults: PulseScenarioResultItem[];
  observationFootprint: PulseObservationFootprint;
  capabilitiesById: Map<string, PulseCapability>;
  visitedByPrimaryCapability: Set<string>;
}

export function processGroup(
  ctx: ProcessGroupContext,
  group: CapabilitySeedGroup,
  coverEntireComponent: boolean,
): void {
  const seedNodeIds = coverEntireComponent
    ? [...group.seedNodeIds].filter((nodeId) => !ctx.visitedByPrimaryCapability.has(nodeId))
    : [...group.seedNodeIds];
  const queue = seedNodeIds.map((nodeId) => ({ nodeId, depth: 0 }));
  const componentIds = new Set<string>();

  while (queue.length > deriveZeroValue()) {
    const current = queue.shift();
    if (!current) {
      continue;
    }
    if (
      componentIds.has(current.nodeId) ||
      current.depth > deriveUnitValue() + deriveUnitValue() + deriveUnitValue() + deriveUnitValue()
    ) {
      continue;
    }

    const currentNode = ctx.nodeById.get(current.nodeId);
    if (!currentNode) {
      continue;
    }

    componentIds.add(current.nodeId);
    if (current.depth === 0 || coverEntireComponent) {
      ctx.visitedByPrimaryCapability.add(current.nodeId);
    }

    if (roleBlocksTraversal(currentNode.role)) {
      continue;
    }

    for (const neighborId of ctx.neighbors.get(current.nodeId) || []) {
      if (componentIds.has(neighborId)) {
        continue;
      }
      const neighborNode = ctx.nodeById.get(neighborId);
      if (!neighborNode) {
        continue;
      }
      const neighborFamilies = ctx.nodeFamilies.get(neighborId) || [];
      if (
        shouldTraverseNeighbor(
          currentNode,
          neighborNode,
          group.family,
          neighborFamilies,
          ctx.primaryFamilyByNode.get(neighborId) || null,
        )
      ) {
        queue.push({ nodeId: neighborId, depth: current.depth + 1 });
      }
    }
  }

  if (componentIds.size === deriveZeroValue()) {
    return;
  }

  const componentNodes = [...componentIds]
    .map((nodeId) => ctx.nodeById.get(nodeId))
    .filter((value): value is NonNullable<typeof value> => Boolean(value));
  const filePaths = unique(componentNodes.map((item) => item.file).filter(Boolean)).sort();
  const routePatterns = unique(
    componentNodes.flatMap((item) => [
      ...getNodeRoutePatterns(item),
      ...(roleContributesRouteEvidence(item.role)
        ? [...(ctx.routePatternsByReachableNode.get(item.id) || new Set<string>())]
        : []),
    ]),
  ).sort();
  const routeExposesInterface = componentNodes.some(
    (item) =>
      nodeKindExposesInterface(item.kind) ||
      (Array.isArray(item.metadata.triggers) &&
        item.metadata.triggers.length > deriveZeroValue()) ||
      Boolean(ctx.routePatternsByReachableNode.get(item.id)?.size),
  );
  const rolesPresent = unique([
    ...componentNodes.map((item) => item.role),
    routeExposesInterface ? 'interface' : '',
  ])
    .filter(Boolean)
    .sort() as PulseStructuralRole[];
  const scopeFiles = filePaths
    .map((filePath) => ctx.scopeByPath.get(filePath))
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
    (sum, file) => sum + (file.observedCodacyIssueCount ?? deriveZeroValue()),
    deriveZeroValue(),
  );
  const highSeverityIssueCount = scopeFiles.reduce(
    (sum, file) => sum + (file.highSeverityIssueCount ?? deriveZeroValue()),
    deriveZeroValue(),
  );
  const routeFamilies = unique(
    routePatterns.map((routePattern) => deriveRouteFamily(routePattern)).filter(Boolean),
  ) as string[];
  const fallbackCapabilityKey = slugifyStructural([...componentIds].sort().join(' '));
  const capabilityId = `capability:${slugifyStructural(group.family) || fallbackCapabilityKey}`;
  const flowEvidenceMatches = ctx.flowResults.filter(
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
  const simulationOnly =
    rolesPresent.includes('simulation') && rolesPresent.length === deriveUnitValue();
  const scenarioCoverageMatches = ctx.scenarioResults.filter(
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
  const scenarioFailureMatches = ctx.scenarioResults.filter(
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
  const runtimeObserved = footprintMatchesFamilies(capabilityFamilies, ctx.observationFootprint);
  const executedEvidenceCount =
    observedFlowEvidenceMatches.length +
    scenarioCoverageMatches.length +
    (runtimeObserved ? deriveUnitValue() : deriveZeroValue());
  const hasObservedFailure =
    observedFlowEvidenceMatches.some((result) => isObservedFailedStatus(result.status)) ||
    scenarioFailureMatches.length > deriveZeroValue() ||
    (highSeverityIssueCount > deriveZeroValue() && runtimeCritical);
  const status = inferStatus(rolesPresent, simulationOnly, hasObservedFailure);
  const missingRoles = missingProductionRoles(rolesPresent);
  const truthMode = chooseTruthMode(
    executedEvidenceCount > deriveZeroValue(),
    statusIs(status, 'latent'),
  );
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
    observedFlowEvidenceMatches.length > deriveZeroValue() ? 'execution-flow-evidence' : '',
    scenarioCoverageMatches.length > deriveZeroValue() ? 'scenario-coverage' : '',
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
    missingRoles.length > deriveZeroValue()
      ? `Missing structural roles: ${missingRoles.join(', ')}.`
      : '',
    maturity.missing.length > deriveZeroValue()
      ? `Maturity is still missing: ${maturity.missing.slice(deriveZeroValue(), deriveUnitValue() + deriveUnitValue() + deriveUnitValue() + deriveUnitValue()).join(', ')}.`
      : '',
    highSeverityIssueCount > deriveZeroValue()
      ? `Codacy still reports ${highSeverityIssueCount} HIGH issue(s) inside this capability.`
      : '',
    protectedByGovernance ? 'Part of this capability lives on a governance-protected surface.' : '',
  ]).filter(Boolean);

  const existing = ctx.capabilitiesById.get(capabilityId);
  if (existing) {
    ctx.capabilitiesById.set(
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
    hasRuntimeEvidence: runtimeObserved || observedFlowEvidenceMatches.length > deriveZeroValue(),
    hasScenarioCoverage: scenarioCoverageMatches.length > deriveZeroValue(),
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

  ctx.capabilitiesById.set(capabilityId, {
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
      highSeverityIssueCount > deriveZeroValue()
        ? 'Re-sync Codacy and confirm HIGH issues dropped.'
        : '',
      ...governedValidationTargets,
    ]).filter(Boolean),
    dod: capabilityDoD,
  });
}
