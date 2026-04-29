import type {
  PulseCapability,
  PulseCapabilityState,
  PulseCertification,
  PulseCodebaseTruth,
  PulseFlowProjection,
  PulseFlowProjectionItem,
  PulseHealth,
  PulseParityGap,
  PulseParityGapsArtifact,
  PulseParityGapSeverity,
  PulseResolvedManifest,
} from './types';
import {
  deriveStructuralFamilies,
  familiesOverlap,
  titleCaseStructural,
} from './structural-family';
import {
  isCoveredByMaterializedAppBranch,
  isCoveredByMaterializedEntryPoint,
  isCoveredByMaterializedRouteFamily,
  isCoveredByProductSurfaceRouteFamily,
  isFrameworkShellCapability,
  isIncludedInRoutedCapability,
  isInterfaceOnlyWithoutRoutes,
  isMaterializedCapability,
  isOperationalReadinessCapability,
  isRoadmapCatalogCapability,
} from './parity-capability-classifiers';
import {
  buildGap,
  buildSummary,
  capabilityFamilies,
  flowFamilies,
  moduleFamilies,
  textFamilies,
} from './parity-gap-builders';
import { unique } from './parity-utils';

interface BuildParityGapsInput {
  codebaseTruth: PulseCodebaseTruth;
  capabilityState: PulseCapabilityState;
  flowProjection: PulseFlowProjection;
  certification: PulseCertification;
  resolvedManifest: PulseResolvedManifest;
  health: PulseHealth;
}

function isObservabilityBreakType(type: string): boolean {
  return /(?:observability|audit|log|trace|metric|alert)/i.test(type);
}

function isInfrastructureOnlyRouteCapability(
  capability: PulseCapability,
  productModules: PulseResolvedManifest['modules'],
): boolean {
  const capabilityStructuralFamilies = capabilityFamilies(capability);
  const matchesProductModule = productModules.some((moduleEntry) =>
    familiesOverlap(moduleFamilies(moduleEntry), capabilityStructuralFamilies),
  );
  return (
    capability.routePatterns.length > 0 &&
    !capability.userFacing &&
    !matchesProductModule &&
    capability.ownerLane === 'reliability' &&
    capability.rolesPresent.every((role) => role === 'interface' || role === 'orchestration')
  );
}

/** Build a canonical structural parity gap artifact. */
export function buildParityGaps(input: BuildParityGapsInput): PulseParityGapsArtifact {
  const capabilities = input.capabilityState.capabilities;
  const flows = input.flowProjection.flows;
  const productModules = input.resolvedManifest.modules.filter(
    (item) => item.userFacing && item.coverageStatus !== 'excluded',
  );
  const observabilitySignals = input.certification.evidenceSummary.observability.signals;
  const observabilityStrength = Object.values(observabilitySignals).filter(Boolean).length;
  const globalObservabilityMissing =
    !input.certification.evidenceSummary.observability.executed || observabilityStrength < 2;
  const observabilityGateFailed = input.certification.gates.observabilityPass?.status === 'fail';
  const observabilityFindingFiles = new Set(
    input.health.breaks
      .filter(
        (item) =>
          (item.severity === 'critical' || item.severity === 'high') &&
          isObservabilityBreakType(item.type),
      )
      .map((item) => item.file)
      .filter(Boolean),
  );
  const gaps = new Map<string, PulseParityGap>();

  const findCapabilities = (value: string): PulseCapability[] => {
    const families = textFamilies(value);
    return capabilities.filter((capability) =>
      familiesOverlap(capabilityFamilies(capability), families),
    );
  };

  const findFlows = (value: string): PulseFlowProjectionItem[] => {
    const families = textFamilies(value);
    return flows.filter((flow) => familiesOverlap(flowFamilies(flow), families));
  };
  const hasProductModuleMatch = (families: string[]): boolean =>
    productModules.some((moduleEntry) => familiesOverlap(moduleFamilies(moduleEntry), families));

  const addGap = (gap: PulseParityGap) => {
    if (!gaps.has(gap.id)) {
      gaps.set(gap.id, gap);
    }
  };

  for (const entry of input.codebaseTruth.divergence.frontendSurfaceWithoutBackendSupport) {
    const matchingCapabilities = findCapabilities(entry);
    if (
      matchingCapabilities.length > 0 &&
      matchingCapabilities.every(
        (capability) =>
          isFrameworkShellCapability(capability) ||
          isRoadmapCatalogCapability(capability) ||
          isCoveredByMaterializedEntryPoint(capability, capabilities) ||
          isCoveredByMaterializedAppBranch(capability, capabilities) ||
          isCoveredByMaterializedRouteFamily(capability, capabilities),
      )
    ) {
      continue;
    }
    const matchingFlows = findFlows(entry);
    addGap(
      buildGap(
        'front_without_back',
        `Front without back: ${entry.split(/\s+\(/)[0] || entry}`,
        `${entry} still exposes a frontend-facing surface whose backend chain is incomplete or absent.`,
        matchingCapabilities,
        matchingFlows,
        matchingCapabilities.flatMap((item) => item.routePatterns),
        matchingCapabilities.flatMap((item) => item.filePaths),
        unique([
          ...matchingCapabilities.flatMap((item) => item.validationTargets),
          ...matchingFlows.flatMap((item) => item.validationTargets),
        ]),
      ),
    );
  }

  for (const capability of capabilities.filter(
    (item) =>
      item.userFacing &&
      item.status !== 'real' &&
      !isInfrastructureOnlyRouteCapability(item, productModules) &&
      !isFrameworkShellCapability(item) &&
      !isRoadmapCatalogCapability(item) &&
      !isCoveredByMaterializedEntryPoint(item, capabilities) &&
      !isCoveredByMaterializedAppBranch(item, capabilities) &&
      !isCoveredByMaterializedRouteFamily(item, capabilities) &&
      item.rolesPresent.includes('interface') &&
      !item.rolesPresent.includes('orchestration') &&
      !item.rolesPresent.includes('persistence') &&
      !item.rolesPresent.includes('side_effect'),
  )) {
    addGap(
      buildGap(
        'front_without_back',
        `Front without back: ${capability.name}`,
        `Capability ${capability.name} exposes UI or interaction entry points without an orchestrated backend/materialized effect.`,
        [capability],
        flows.filter((flow) => flow.capabilityIds.includes(capability.id)),
        capability.routePatterns,
        capability.filePaths,
        capability.validationTargets,
      ),
    );
  }

  for (const entry of input.codebaseTruth.divergence.backendCapabilityWithoutFrontendSurface) {
    if (hasProductModuleMatch(textFamilies(entry))) {
      continue;
    }
    const matchingCapabilities = findCapabilities(entry);
    if (matchingCapabilities.length > 0) {
      continue;
    }
    addGap(
      buildGap(
        'back_without_front',
        `Back without front: ${titleCaseStructural(entry)}`,
        `${entry} exposes backend or runtime capability with no matching product surface detected in the UI.`,
        matchingCapabilities,
        [],
        matchingCapabilities.flatMap((item) => item.routePatterns),
        matchingCapabilities.flatMap((item) => item.filePaths),
        matchingCapabilities.flatMap((item) => item.validationTargets),
      ),
    );
  }

  for (const capability of capabilities.filter(
    (item) =>
      !item.userFacing &&
      item.status !== 'real' &&
      item.truthMode !== 'aspirational' &&
      item.routePatterns.length > 0 &&
      !isInfrastructureOnlyRouteCapability(item, productModules) &&
      !isCoveredByProductSurfaceRouteFamily(item, capabilities) &&
      (item.rolesPresent.includes('orchestration') ||
        item.rolesPresent.includes('persistence') ||
        item.rolesPresent.includes('side_effect')),
  )) {
    if (hasProductModuleMatch(capabilityFamilies(capability))) {
      continue;
    }
    addGap(
      buildGap(
        'back_without_front',
        `Back without front: ${capability.name}`,
        `Capability ${capability.name} is structurally live on backend/runtime paths but still lacks an identified product surface.`,
        [capability],
        flows.filter((flow) => flow.capabilityIds.includes(capability.id)),
        capability.routePatterns,
        capability.filePaths,
        capability.validationTargets,
      ),
    );
  }

  for (const entry of input.codebaseTruth.divergence.shellWithoutPersistence) {
    const matchingCapabilities = findCapabilities(entry);
    if (
      matchingCapabilities.length > 0 &&
      (matchingCapabilities.every((capability) => isFrameworkShellCapability(capability)) ||
        matchingCapabilities.some(
          (capability) =>
            isMaterializedCapability(capability) ||
            isRoadmapCatalogCapability(capability) ||
            isCoveredByMaterializedEntryPoint(capability, capabilities) ||
            isCoveredByMaterializedAppBranch(capability, capabilities) ||
            isCoveredByMaterializedRouteFamily(capability, capabilities) ||
            isOperationalReadinessCapability(capability),
        ))
    ) {
      continue;
    }
    const matchingFlows = findFlows(entry);
    addGap(
      buildGap(
        'ui_without_persistence',
        `UI without persistence: ${entry.split(/\s+\(/)[0] || entry}`,
        `${entry} still behaves like a shell or façade without durable persistence or real side effects.`,
        matchingCapabilities,
        matchingFlows,
        matchingCapabilities.flatMap((item) => item.routePatterns),
        matchingCapabilities.flatMap((item) => item.filePaths),
        unique([
          ...matchingCapabilities.flatMap((item) => item.validationTargets),
          ...matchingFlows.flatMap((item) => item.validationTargets),
        ]),
      ),
    );
  }

  for (const capability of capabilities.filter(
    (item) =>
      item.userFacing &&
      item.status !== 'real' &&
      !isFrameworkShellCapability(item) &&
      !isRoadmapCatalogCapability(item) &&
      !isCoveredByMaterializedEntryPoint(item, capabilities) &&
      !isCoveredByMaterializedAppBranch(item, capabilities) &&
      !isCoveredByMaterializedRouteFamily(item, capabilities) &&
      !isOperationalReadinessCapability(item) &&
      item.rolesPresent.includes('interface') &&
      !item.rolesPresent.includes('persistence') &&
      !item.rolesPresent.includes('side_effect'),
  )) {
    addGap(
      buildGap(
        'ui_without_persistence',
        `UI without persistence: ${capability.name}`,
        `Capability ${capability.name} has interface presence but still lacks persistence or any durable external effect.`,
        [capability],
        flows.filter((flow) => flow.capabilityIds.includes(capability.id)),
        capability.routePatterns,
        capability.filePaths,
        capability.validationTargets,
      ),
    );
  }

  for (const capability of capabilities.filter(
    (item) =>
      item.truthMode !== 'aspirational' &&
      item.rolesPresent.includes('persistence') &&
      !item.rolesPresent.includes('interface') &&
      !flows.some((flow) => flow.capabilityIds.includes(item.id)),
  )) {
    addGap(
      buildGap(
        'persistence_without_consumer',
        `Persistence without consumer: ${capability.name}`,
        `Capability ${capability.name} reaches persistence but no product-facing consumer chain is currently connected to it.`,
        [capability],
        [],
        capability.routePatterns,
        capability.filePaths,
        capability.validationTargets,
      ),
    );
  }

  for (const entry of input.codebaseTruth.divergence.flowCandidatesWithoutOracle) {
    const matchingFlows = findFlows(entry);
    const hasExecutableCoverage = matchingFlows.some((flow) =>
      flow.evidenceSources.some((source) =>
        ['execution-flow-evidence', 'scenario-coverage', 'static-test-coverage'].includes(source),
      ),
    );
    if (hasExecutableCoverage) {
      continue;
    }
    const matchingCapabilities = matchingFlows.flatMap((flow) =>
      capabilities.filter((capability) => flow.capabilityIds.includes(capability.id)),
    );
    addGap(
      buildGap(
        'flow_without_validation',
        `Flow without validation: ${entry.split(/\s+->/)[0] || entry}`,
        `${entry} still exists as a connected product flow candidate without declared validation/oracle coverage.`,
        matchingCapabilities,
        matchingFlows,
        matchingFlows.flatMap((item) => item.routePatterns),
        matchingCapabilities.flatMap((item) => item.filePaths),
        unique([
          ...matchingCapabilities.flatMap((item) => item.validationTargets),
          ...matchingFlows.flatMap((item) => item.validationTargets),
          'Add executable flow or scenario validation for this structural chain.',
        ]),
      ),
    );
  }

  for (const flow of flows.filter(
    (item) =>
      item.status !== 'real' &&
      item.truthMode !== 'observed' &&
      item.evidenceSources.every((source) => source !== 'execution-flow-evidence'),
  )) {
    const relatedCapabilities = capabilities.filter((capability) =>
      flow.capabilityIds.includes(capability.id),
    );
    addGap(
      buildGap(
        'flow_without_validation',
        `Flow without validation: ${flow.name}`,
        `Flow ${flow.name} is structurally present but still lacks executed validation evidence.`,
        relatedCapabilities,
        [flow],
        flow.routePatterns,
        relatedCapabilities.flatMap((item) => item.filePaths),
        unique([
          ...flow.validationTargets,
          'Re-run declared flow or actor scenario evidence for this flow.',
        ]),
      ),
    );
  }

  if (globalObservabilityMissing || observabilityGateFailed) {
    for (const capability of capabilities.filter(
      (item) =>
        item.runtimeCritical &&
        item.status !== 'real' &&
        (item.userFacing || item.routePatterns.length > 0) &&
        (item.maturity.dimensions.runtimeEvidencePresent ||
          item.truthMode === 'observed' ||
          item.highSeverityIssueCount > 0) &&
        (item.rolesPresent.includes('side_effect') || item.rolesPresent.includes('orchestration')),
    )) {
      const hasLocalObservabilityFinding = capability.filePaths.some((filePath) =>
        observabilityFindingFiles.has(filePath),
      );
      if (!globalObservabilityMissing && !hasLocalObservabilityFinding) {
        continue;
      }
      addGap(
        buildGap(
          'integration_without_observability',
          `Integration without observability: ${capability.name}`,
          `Capability ${capability.name} depends on runtime-critical effects but observability evidence is still weak (${observabilityStrength} signal(s) detected).`,
          [capability],
          flows.filter((flow) => flow.capabilityIds.includes(capability.id)),
          capability.routePatterns,
          capability.filePaths,
          unique([
            ...capability.validationTargets,
            'Re-run observability evidence and confirm request IDs/tracing/logging are detected.',
          ]),
        ),
      );
    }
  }

  for (const moduleEntry of input.resolvedManifest.modules.filter(
    (item) => item.declaredByManifest && item.coverageStatus !== 'excluded',
  )) {
    const families = deriveStructuralFamilies([
      moduleEntry.key,
      moduleEntry.name,
      moduleEntry.canonicalName,
      ...moduleEntry.aliases,
      ...moduleEntry.routeRoots,
    ]);
    const matchingCapabilities = capabilities.filter((capability) =>
      familiesOverlap(capabilityFamilies(capability), families),
    );
    const matchingFlows = flows.filter((flow) => familiesOverlap(flowFamilies(flow), families));
    const hasObservedRuntime =
      matchingCapabilities.some((item) => item.truthMode === 'observed') ||
      matchingFlows.some((item) => item.truthMode === 'observed');
    const hasStructuralMaterialization =
      matchingCapabilities.some((item) => item.status === 'real' || item.status === 'partial') ||
      matchingFlows.some((item) => item.status === 'real' || item.status === 'partial');

    if (hasObservedRuntime || hasStructuralMaterialization) {
      continue;
    }

    addGap(
      buildGap(
        'feature_declared_without_runtime',
        `Declared without runtime: ${moduleEntry.name}`,
        `${moduleEntry.name} is still part of the declared product promise, but no observed runtime or executed flow evidence currently materializes it.`,
        matchingCapabilities,
        matchingFlows,
        unique([
          ...moduleEntry.routeRoots,
          ...matchingCapabilities.flatMap((item) => item.routePatterns),
          ...matchingFlows.flatMap((item) => item.routePatterns),
        ]),
        matchingCapabilities.flatMap((item) => item.filePaths),
        unique([
          ...matchingCapabilities.flatMap((item) => item.validationTargets),
          ...matchingFlows.flatMap((item) => item.validationTargets),
          moduleEntry.routeRoots[0]
            ? `Acquire runtime evidence for ${moduleEntry.routeRoots[0]}.`
            : `Acquire executable runtime evidence for ${moduleEntry.name}.`,
        ]),
      ),
    );
  }

  for (const capability of capabilities.filter(
    (item) =>
      item.runtimeCritical &&
      !item.userFacing &&
      item.routePatterns.length === 0 &&
      item.status !== 'real' &&
      !isIncludedInRoutedCapability(item, capabilities) &&
      (item.maturity.dimensions.runtimeEvidencePresent || item.truthMode === 'observed'),
  )) {
    addGap(
      buildGap(
        'runtime_without_product_surface',
        `Runtime without product surface: ${capability.name}`,
        `Capability ${capability.name} is runtime-critical or operationally important but still has no product-facing surface or routed chain attached to it.`,
        [capability],
        [],
        [],
        capability.filePaths,
        unique([
          ...capability.validationTargets,
          'Map this runtime-critical capability to a product surface, flow, or explicit internal lane.',
        ]),
      ),
    );
  }

  const orderedGaps = [...gaps.values()].sort((left, right) => {
    const severityRank: Record<PulseParityGapSeverity, number> = {
      critical: 0,
      high: 1,
      medium: 2,
      low: 3,
    };
    const severityDelta = severityRank[left.severity] - severityRank[right.severity];
    if (severityDelta !== 0) {
      return severityDelta;
    }
    return left.title.localeCompare(right.title);
  });

  return {
    generatedAt: new Date().toISOString(),
    summary: buildSummary(orderedGaps),
    gaps: orderedGaps,
  };
}
