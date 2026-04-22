import * as fs from 'fs';
import * as path from 'path';
import { buildArtifactRegistry, type PulseArtifactRegistry } from './artifact-registry';
import { cleanupPulseArtifacts, type PulseArtifactCleanupReport } from './artifact-gc';
import { KIND_RANK, PRIORITY_RANK, PRODUCT_IMPACT_RANK } from './convergence-plan.constants';
import { buildConvergencePlan } from './convergence-plan';
import type {
  PulseCapabilityState,
  PulseCertification,
  PulseCodebaseTruth,
  PulseCodacyEvidence,
  PulseConvergencePlan,
  PulseFlowProjection,
  PulseHealth,
  PulseManifest,
  PulseParityGapsArtifact,
  PulseProductVision,
  PulseResolvedManifest,
  PulseScopeState,
  PulseStructuralGraph,
} from './types';

/** Pulse artifact snapshot shape. */
export interface PulseArtifactSnapshot {
  /** Health property. */
  health: PulseHealth;
  /** Manifest property. */
  manifest: PulseManifest | null;
  /** Codebase truth property. */
  codebaseTruth: PulseCodebaseTruth;
  /** Resolved manifest property. */
  resolvedManifest: PulseResolvedManifest;
  /** Scope state property. */
  scopeState: PulseScopeState;
  /** Codacy evidence property. */
  codacyEvidence: PulseCodacyEvidence;
  /** Structural graph property. */
  structuralGraph: PulseStructuralGraph;
  /** Capability state property. */
  capabilityState: PulseCapabilityState;
  /** Flow projection property. */
  flowProjection: PulseFlowProjection;
  /** Parity gaps property. */
  parityGaps: PulseParityGapsArtifact;
  /** Product vision property. */
  productVision: PulseProductVision;
  /** Certification property. */
  certification: PulseCertification;
}

/** Pulse artifact paths shape. */
export interface PulseArtifactPaths {
  /** Canonical report path property. */
  reportPath: string;
  /** Canonical certificate path property. */
  certificatePath: string;
  /** Canonical directive path property. */
  cliDirectivePath: string;
  /** Canonical artifact index path property. */
  artifactIndexPath: string;
}

function writeAtomic(targetPath: string, content: string, registry: PulseArtifactRegistry) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.mkdirSync(registry.tempDir, { recursive: true });
  const tempPath = path.join(
    registry.tempDir,
    `${path.basename(targetPath)}.${Date.now().toString(36)}.tmp`,
  );
  fs.writeFileSync(tempPath, content);
  fs.renameSync(tempPath, targetPath);
}

function mirrorIfNeeded(relativePath: string, content: string, registry: PulseArtifactRegistry) {
  if (!registry.mirrors.includes(relativePath)) {
    return;
  }
  const rootMirrorPath = path.join(registry.rootDir, relativePath);
  writeAtomic(rootMirrorPath, content, registry);
}

function writeArtifact(
  relativePath: string,
  content: string,
  registry: PulseArtifactRegistry,
): string {
  const targetPath = path.join(registry.canonicalDir, relativePath);
  writeAtomic(targetPath, content, registry);
  mirrorIfNeeded(relativePath, content, registry);
  return targetPath;
}

function compact(value: string, max: number = 240): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= max) {
    return normalized;
  }
  return `${normalized.slice(0, max - 3)}...`;
}

function getExecutionModeRank(mode: 'ai_safe' | 'human_required' | 'observation_only'): number {
  if (mode === 'ai_safe') {
    return 0;
  }
  if (mode === 'human_required') {
    return 1;
  }
  return 2;
}

function getTruthModeRank(mode: 'observed' | 'inferred' | 'projected'): number {
  if (mode === 'observed') {
    return 0;
  }
  if (mode === 'inferred') {
    return 1;
  }
  return 2;
}

function hasProductSurface(unit: PulseConvergencePlan['queue'][number]): boolean {
  return (
    unit.kind === 'capability' ||
    unit.kind === 'flow' ||
    unit.kind === 'scenario' ||
    unit.affectedCapabilityIds.length > 0 ||
    unit.affectedFlowIds.length > 0
  );
}

function buildDecisionQueue(plan: PulseConvergencePlan) {
  return [...plan.queue].sort((left, right) => {
    const executionDelta =
      getExecutionModeRank(left.executionMode) - getExecutionModeRank(right.executionMode);
    if (executionDelta !== 0) {
      return executionDelta;
    }
    const impactDelta =
      PRODUCT_IMPACT_RANK[left.productImpact] - PRODUCT_IMPACT_RANK[right.productImpact];
    if (impactDelta !== 0) {
      return impactDelta;
    }
    const priorityDelta = PRIORITY_RANK[left.priority] - PRIORITY_RANK[right.priority];
    if (priorityDelta !== 0) {
      return priorityDelta;
    }
    const productSurfaceDelta = Number(hasProductSurface(right)) - Number(hasProductSurface(left));
    if (productSurfaceDelta !== 0) {
      return productSurfaceDelta;
    }
    const evidenceDelta =
      getTruthModeRank(left.evidenceMode) - getTruthModeRank(right.evidenceMode);
    if (evidenceDelta !== 0) {
      return evidenceDelta;
    }
    const kindDelta = KIND_RANK[left.kind] - KIND_RANK[right.kind];
    if (kindDelta !== 0) {
      return kindDelta;
    }
    return left.order - right.order;
  });
}

function getProductFacingCapabilities(snapshot: PulseArtifactSnapshot) {
  const productFacing = snapshot.capabilityState.capabilities.filter(
    (capability) => capability.userFacing || capability.routePatterns.length > 0,
  );
  return productFacing.length > 0 ? productFacing : snapshot.capabilityState.capabilities;
}

function buildHealth(snapshot: PulseArtifactSnapshot): string {
  return JSON.stringify(snapshot.health, null, 2);
}

function buildReport(
  snapshot: PulseArtifactSnapshot,
  convergencePlan: PulseConvergencePlan,
  cleanupReport: PulseArtifactCleanupReport,
): string {
  const decisionQueue = buildDecisionQueue(convergencePlan);
  const lines: string[] = [];
  lines.push(`# PULSE REPORT — ${snapshot.certification.timestamp}`);
  lines.push('');
  lines.push('## Current State');
  lines.push('');
  lines.push(`- Certification: ${snapshot.certification.status}`);
  lines.push(`- Human replacement: ${snapshot.certification.humanReplacementStatus}`);
  lines.push(`- Score: ${snapshot.certification.score}/100`);
  lines.push(`- Blocking tier: ${snapshot.certification.blockingTier ?? 'none'}`);
  lines.push(
    `- Scope parity: ${snapshot.scopeState.parity.status.toUpperCase()} (${snapshot.scopeState.parity.confidence})`,
  );
  lines.push(
    `- Structural chains: ${snapshot.structuralGraph.summary.completeChains}/${snapshot.structuralGraph.summary.interfaceChains} complete`,
  );
  lines.push(
    `- Capabilities: real=${snapshot.capabilityState.summary.realCapabilities}, partial=${snapshot.capabilityState.summary.partialCapabilities}, latent=${snapshot.capabilityState.summary.latentCapabilities}, phantom=${snapshot.capabilityState.summary.phantomCapabilities}`,
  );
  lines.push(
    `- Capability maturity: foundational=${snapshot.capabilityState.summary.foundationalCapabilities}, connected=${snapshot.capabilityState.summary.connectedCapabilities}, operational=${snapshot.capabilityState.summary.operationalCapabilities}, productionReady=${snapshot.capabilityState.summary.productionReadyCapabilities}`,
  );
  lines.push(
    `- Flows: real=${snapshot.flowProjection.summary.realFlows}, partial=${snapshot.flowProjection.summary.partialFlows}, latent=${snapshot.flowProjection.summary.latentFlows}, phantom=${snapshot.flowProjection.summary.phantomFlows}`,
  );
  lines.push(
    `- Structural parity gaps: total=${snapshot.parityGaps.summary.totalGaps}, critical=${snapshot.parityGaps.summary.criticalGaps}, high=${snapshot.parityGaps.summary.highGaps}`,
  );
  lines.push(`- Codacy HIGH issues: ${snapshot.codacyEvidence.summary.highIssues}`);
  lines.push('');
  lines.push('## Product Identity');
  lines.push('');
  lines.push(`- Current checkpoint: ${snapshot.productVision.currentStateSummary}`);
  lines.push(
    `- Inferred product: ${snapshot.productVision.inferredProductIdentity || snapshot.productVision.projectedProductSummary}`,
  );
  lines.push(`- Projected checkpoint: ${snapshot.productVision.projectedProductSummary}`);
  lines.push(`- Distance: ${snapshot.productVision.distanceSummary}`);
  lines.push('');
  if (snapshot.productVision.surfaces && snapshot.productVision.surfaces.length > 0) {
    lines.push('## Product Surfaces');
    lines.push('');
    for (const surface of snapshot.productVision.surfaces.slice(0, 12)) {
      lines.push(
        `- ${surface.name}: status=${surface.status}, completion=${Math.round(surface.completion * 100)}%, capabilities=${surface.capabilityIds.length}, flows=${surface.flowIds.length}${surface.blockers[0] ? `, blocker=${compact(surface.blockers[0], 180)}` : ''}`,
      );
    }
    lines.push('');
  }
  if (snapshot.productVision.experiences && snapshot.productVision.experiences.length > 0) {
    lines.push('## Experience Projection');
    lines.push('');
    for (const experience of snapshot.productVision.experiences.slice(0, 10)) {
      lines.push(
        `- ${experience.name}: status=${experience.status}, completion=${Math.round(experience.completion * 100)}%, routes=${experience.routePatterns.join(', ') || 'n/a'}${experience.blockers[0] ? `, blocker=${compact(experience.blockers[0], 180)}` : ''}`,
      );
    }
    lines.push('');
  }
  if (snapshot.productVision.promiseToProductionDelta) {
    lines.push('## Promise To Production Delta');
    lines.push('');
    lines.push(
      `- Declared surfaces: ${snapshot.productVision.promiseToProductionDelta.declaredSurfaces}`,
    );
    lines.push(`- Real surfaces: ${snapshot.productVision.promiseToProductionDelta.realSurfaces}`);
    lines.push(
      `- Partial surfaces: ${snapshot.productVision.promiseToProductionDelta.partialSurfaces}`,
    );
    lines.push(
      `- Latent surfaces: ${snapshot.productVision.promiseToProductionDelta.latentSurfaces}`,
    );
    lines.push(
      `- Phantom surfaces: ${snapshot.productVision.promiseToProductionDelta.phantomSurfaces}`,
    );
    if (snapshot.productVision.promiseToProductionDelta.criticalGaps.length > 0) {
      lines.push('- Critical gaps:');
      for (const gap of snapshot.productVision.promiseToProductionDelta.criticalGaps) {
        lines.push(`  - ${compact(gap, 220)}`);
      }
    }
    lines.push('');
  }
  if (snapshot.parityGaps.gaps.length > 0) {
    lines.push('## Structural Parity Gaps');
    lines.push('');
    for (const gap of snapshot.parityGaps.gaps.slice(0, 10)) {
      lines.push(
        `- ${gap.title}: severity=${gap.severity}, mode=${gap.executionMode}${gap.routePatterns[0] ? `, route=${gap.routePatterns[0]}` : ''}, summary=${compact(gap.summary, 200)}`,
      );
    }
    lines.push('');
  }
  if (snapshot.capabilityState.capabilities.length > 0) {
    lines.push('## Capability Maturity');
    lines.push('');
    for (const capability of [...getProductFacingCapabilities(snapshot)]
      .sort(
        (left, right) =>
          left.maturity.score - right.maturity.score || left.name.localeCompare(right.name),
      )
      .slice(0, 10)) {
      lines.push(
        `- ${capability.name}: stage=${capability.maturity.stage}, score=${Math.round(capability.maturity.score * 100)}%, missing=${capability.maturity.missing.slice(0, 4).join(', ') || 'none'}`,
      );
    }
    lines.push('');
  }
  lines.push('## Top Blockers');
  lines.push('');
  if (snapshot.productVision.topBlockers.length === 0) {
    lines.push('- None');
  } else {
    for (const blocker of snapshot.productVision.topBlockers) {
      lines.push(`- ${compact(blocker, 320)}`);
    }
  }
  lines.push('');
  lines.push('## Next Work');
  lines.push('');
  if (decisionQueue.length === 0) {
    lines.push('- No convergence units open.');
  } else {
    for (const unit of decisionQueue.slice(0, 8)) {
      lines.push(
        `- [${unit.priority}] ${unit.title} | impact=${unit.productImpact} | mode=${unit.executionMode} | evidence=${unit.evidenceMode}/${unit.confidence} | risk=${unit.riskLevel} | ${compact(unit.visionDelta, 180)}`,
      );
    }
  }
  lines.push('');
  lines.push('## Cleanup');
  lines.push('');
  lines.push(`- Canonical dir: ${cleanupReport.canonicalDir}`);
  lines.push(`- Mirrors: ${cleanupReport.mirrors.join(', ')}`);
  lines.push(
    `- Removed legacy artifacts this run: ${cleanupReport.removedLegacyPulseArtifacts.length}`,
  );
  lines.push('');
  lines.push('## Truth Model');
  lines.push('');
  lines.push(
    '- `observed`: backed by runtime, browser, declared flows, actors or explicit execution evidence.',
  );
  lines.push(
    '- `inferred`: reconstructed from structure with no direct executed proof in this run.',
  );
  lines.push(
    '- `projected`: future-consistent product shape implied by connected latent structures.',
  );
  lines.push('');
  lines.push('## Safety');
  lines.push('');
  lines.push('- Governance-protected surfaces stay human-required.');
  lines.push('- Missing evidence stays missing evidence; PULSE does not upgrade it to certainty.');
  return lines.join('\n');
}

function buildCertificate(
  snapshot: PulseArtifactSnapshot,
  convergencePlan: PulseConvergencePlan,
): string {
  return JSON.stringify(
    {
      projectId: snapshot.manifest?.projectId || 'unknown',
      projectName: snapshot.manifest?.projectName || 'unknown',
      commitSha: snapshot.certification.commitSha,
      environment: snapshot.certification.environment,
      timestamp: snapshot.certification.timestamp,
      status: snapshot.certification.status,
      humanReplacementStatus: snapshot.certification.humanReplacementStatus,
      score: snapshot.certification.score,
      rawScore: snapshot.certification.rawScore,
      certificationTarget: snapshot.certification.certificationTarget,
      blockingTier: snapshot.certification.blockingTier,
      gates: snapshot.certification.gates,
      criticalFailures: snapshot.certification.criticalFailures,
      dynamicBlockingReasons: snapshot.certification.dynamicBlockingReasons,
      scopeStateSummary: snapshot.scopeState.summary,
      codacySummary: snapshot.certification.codacySummary,
      codacyEvidenceSummary: snapshot.codacyEvidence.summary,
      structuralGraphSummary: snapshot.structuralGraph.summary,
      capabilityStateSummary: snapshot.capabilityState.summary,
      flowProjectionSummary: snapshot.flowProjection.summary,
      parityGapsSummary: snapshot.parityGaps.summary,
      parityGaps: snapshot.parityGaps.gaps.slice(0, 20),
      productVision: snapshot.productVision,
      convergencePlan: {
        totalUnits: convergencePlan.summary.totalUnits,
        humanRequiredUnits: convergencePlan.summary.humanRequiredUnits,
        observationOnlyUnits: convergencePlan.summary.observationOnlyUnits,
        topQueue: convergencePlan.queue.slice(0, 10),
      },
      evidenceSummary: snapshot.certification.evidenceSummary,
      gateEvidence: snapshot.certification.gateEvidence,
    },
    null,
    2,
  );
}

function buildDirective(
  snapshot: PulseArtifactSnapshot,
  convergencePlan: PulseConvergencePlan,
): string {
  const decisionQueue = buildDecisionQueue(convergencePlan);
  const blockedWork = convergencePlan.queue
    .filter((unit) => unit.executionMode !== 'ai_safe')
    .slice(0, 10);
  const doNotTouchSurfaces = [
    ...new Set(
      blockedWork
        .filter((unit) => unit.executionMode === 'human_required')
        .flatMap((unit) => [...unit.relatedFiles, ...unit.affectedCapabilityIds]),
    ),
  ].slice(0, 20);

  return JSON.stringify(
    {
      generatedAt: snapshot.certification.timestamp,
      authorityMode: 'advisory-only',
      advisoryOnly: true,
      currentCheckpoint: snapshot.productVision.currentCheckpoint,
      targetCheckpoint: snapshot.productVision.projectedCheckpoint,
      visionGap: snapshot.productVision.distanceSummary,
      currentState: {
        certificationStatus: snapshot.certification.status,
        blockingTier: snapshot.certification.blockingTier,
        score: snapshot.certification.score,
        scopeParity: snapshot.scopeState.parity,
      },
      productIdentity: snapshot.productVision.inferredProductIdentity,
      promiseToProductionDelta: snapshot.productVision.promiseToProductionDelta,
      parityGaps: {
        summary: snapshot.parityGaps.summary,
        top: snapshot.parityGaps.gaps.slice(0, 12),
      },
      surfaces: (snapshot.productVision.surfaces || []).slice(0, 15),
      experiences: (snapshot.productVision.experiences || []).slice(0, 12),
      capabilityMaturity: [...getProductFacingCapabilities(snapshot)]
        .sort(
          (left, right) =>
            left.maturity.score - right.maturity.score || left.name.localeCompare(right.name),
        )
        .slice(0, 12)
        .map((capability) => ({
          id: capability.id,
          name: capability.name,
          status: capability.status,
          stage: capability.maturity.stage,
          score: capability.maturity.score,
          missing: capability.maturity.missing,
          executionMode: capability.executionMode,
          routePatterns: capability.routePatterns,
        })),
      topBlockers: snapshot.productVision.topBlockers,
      nextWork: decisionQueue.slice(0, 8).map((unit) => ({
        order: unit.order,
        id: unit.id,
        kind: unit.kind,
        priority: unit.priority,
        source: unit.source,
        executionMode: unit.executionMode,
        riskLevel: unit.riskLevel,
        evidenceMode: unit.evidenceMode,
        confidence: unit.confidence,
        productImpact: unit.productImpact,
        ownerLane: unit.ownerLane,
        title: unit.title,
        summary: unit.summary,
        visionDelta: unit.visionDelta,
        affectedCapabilities: unit.affectedCapabilityIds,
        affectedFlows: unit.affectedFlowIds,
        expectedGateShift: unit.expectedGateShift,
        validationArtifacts: unit.validationArtifacts,
        exitCriteria: unit.exitCriteria,
      })),
      blockedWork: blockedWork.map((unit) => ({
        id: unit.id,
        title: unit.title,
        executionMode: unit.executionMode,
        evidenceMode: unit.evidenceMode,
        confidence: unit.confidence,
        productImpact: unit.productImpact,
        summary: unit.summary,
        visionDelta: unit.visionDelta,
        relatedFiles: unit.relatedFiles,
      })),
      doNotTouchSurfaces,
      antiGoals: [
        'Do not treat projected vision as proof of implementation.',
        'Do not spend the next cycle on diagnostic-only work while transformational or material product gaps remain open.',
        'Do not auto-edit governance-protected surfaces.',
        'Do not suppress Codacy or certification signals to simulate convergence.',
      ],
      productTruth: {
        capabilities: snapshot.capabilityState.summary,
        flows: snapshot.flowProjection.summary,
        parityGaps: snapshot.parityGaps.summary,
        structuralGraph: snapshot.structuralGraph.summary,
        codacy: snapshot.codacyEvidence.summary,
        evidenceBasis: snapshot.productVision.evidenceBasis,
      },
      operatingRules: [
        'Use observed evidence over inferred evidence whenever they conflict.',
        'Treat projected product vision as a convergence target, not as proof of implementation.',
        'Never auto-edit governance-protected surfaces.',
        'Treat human_required and observation_only units as blocked for autonomous code changes.',
      ],
      suggestedValidation: {
        commands: [
          'npm --prefix backend run typecheck',
          'npm --prefix backend run build',
          'node scripts/pulse/run.js --json',
          'node scripts/pulse/run.js --guidance',
        ],
        artifacts: [
          'PULSE_CERTIFICATE.json',
          'PULSE_CLI_DIRECTIVE.json',
          'PULSE_ARTIFACT_INDEX.json',
          '.pulse/current/PULSE_PARITY_GAPS.json',
          '.pulse/current/PULSE_PRODUCT_VISION.json',
          '.pulse/current/PULSE_CAPABILITY_STATE.json',
          '.pulse/current/PULSE_FLOW_PROJECTION.json',
        ],
      },
    },
    null,
    2,
  );
}

function buildArtifactIndex(
  registry: PulseArtifactRegistry,
  cleanupReport: PulseArtifactCleanupReport,
): string {
  return JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      authorityMode: 'advisory-only',
      cleanupPolicy: cleanupReport.cleanupMode,
      canonicalDir: registry.canonicalDir,
      tempDir: registry.tempDir,
      officialArtifacts: registry.artifacts.map((artifact) => artifact.relativePath).sort(),
      compatibilityMirrors: registry.mirrors,
      removedLegacyPulseArtifacts: cleanupReport.removedLegacyPulseArtifacts,
      rootStateMode: 'local-only',
    },
    null,
    2,
  );
}

/** Generate artifacts. */
export function generateArtifacts(
  snapshot: PulseArtifactSnapshot,
  rootDir: string,
): PulseArtifactPaths {
  const registry = buildArtifactRegistry(rootDir);
  const cleanupReport = cleanupPulseArtifacts(registry);
  const convergencePlan = buildConvergencePlan({
    health: snapshot.health,
    resolvedManifest: snapshot.resolvedManifest,
    scopeState: snapshot.scopeState,
    certification: snapshot.certification,
    capabilityState: snapshot.capabilityState,
    flowProjection: snapshot.flowProjection,
    parityGaps: snapshot.parityGaps,
  });

  const reportPath = writeArtifact(
    'PULSE_REPORT.md',
    buildReport(snapshot, convergencePlan, cleanupReport),
    registry,
  );
  const certificatePath = writeArtifact(
    'PULSE_CERTIFICATE.json',
    buildCertificate(snapshot, convergencePlan),
    registry,
  );
  const cliDirectivePath = writeArtifact(
    'PULSE_CLI_DIRECTIVE.json',
    buildDirective(snapshot, convergencePlan),
    registry,
  );
  const artifactIndexPath = writeArtifact(
    'PULSE_ARTIFACT_INDEX.json',
    buildArtifactIndex(registry, cleanupReport),
    registry,
  );

  writeArtifact('PULSE_HEALTH.json', buildHealth(snapshot), registry);
  writeArtifact('PULSE_SCOPE_STATE.json', JSON.stringify(snapshot.scopeState, null, 2), registry);
  writeArtifact(
    'PULSE_CODACY_EVIDENCE.json',
    JSON.stringify(snapshot.codacyEvidence, null, 2),
    registry,
  );
  writeArtifact(
    'PULSE_STRUCTURAL_GRAPH.json',
    JSON.stringify(snapshot.structuralGraph, null, 2),
    registry,
  );
  writeArtifact(
    'PULSE_CAPABILITY_STATE.json',
    JSON.stringify(snapshot.capabilityState, null, 2),
    registry,
  );
  writeArtifact(
    'PULSE_FLOW_PROJECTION.json',
    JSON.stringify(snapshot.flowProjection, null, 2),
    registry,
  );
  writeArtifact('PULSE_PARITY_GAPS.json', JSON.stringify(snapshot.parityGaps, null, 2), registry);
  writeArtifact(
    'PULSE_PRODUCT_VISION.json',
    JSON.stringify(snapshot.productVision, null, 2),
    registry,
  );
  writeArtifact('PULSE_CONVERGENCE_PLAN.json', JSON.stringify(convergencePlan, null, 2), registry);
  writeArtifact(
    'PULSE_RUNTIME_EVIDENCE.json',
    JSON.stringify(snapshot.certification.evidenceSummary.runtime, null, 2),
    registry,
  );
  writeArtifact(
    'PULSE_RUNTIME_PROBES.json',
    JSON.stringify(snapshot.certification.evidenceSummary.runtime.probes, null, 2),
    registry,
  );
  writeArtifact(
    'PULSE_BROWSER_EVIDENCE.json',
    JSON.stringify(snapshot.certification.evidenceSummary.browser, null, 2),
    registry,
  );
  writeArtifact(
    'PULSE_FLOW_EVIDENCE.json',
    JSON.stringify(snapshot.certification.evidenceSummary.flows, null, 2),
    registry,
  );
  writeArtifact(
    'PULSE_INVARIANT_EVIDENCE.json',
    JSON.stringify(snapshot.certification.evidenceSummary.invariants, null, 2),
    registry,
  );
  writeArtifact(
    'PULSE_OBSERVABILITY_EVIDENCE.json',
    JSON.stringify(snapshot.certification.evidenceSummary.observability, null, 2),
    registry,
  );
  writeArtifact(
    'PULSE_RECOVERY_EVIDENCE.json',
    JSON.stringify(snapshot.certification.evidenceSummary.recovery, null, 2),
    registry,
  );
  writeArtifact(
    'PULSE_CUSTOMER_EVIDENCE.json',
    JSON.stringify(snapshot.certification.evidenceSummary.customer, null, 2),
    registry,
  );
  writeArtifact(
    'PULSE_OPERATOR_EVIDENCE.json',
    JSON.stringify(snapshot.certification.evidenceSummary.operator, null, 2),
    registry,
  );
  writeArtifact(
    'PULSE_ADMIN_EVIDENCE.json',
    JSON.stringify(snapshot.certification.evidenceSummary.admin, null, 2),
    registry,
  );
  writeArtifact(
    'PULSE_SOAK_EVIDENCE.json',
    JSON.stringify(snapshot.certification.evidenceSummary.soak, null, 2),
    registry,
  );
  writeArtifact(
    'PULSE_SCENARIO_COVERAGE.json',
    JSON.stringify(snapshot.certification.evidenceSummary.syntheticCoverage, null, 2),
    registry,
  );
  writeArtifact(
    'PULSE_WORLD_STATE.json',
    JSON.stringify(snapshot.certification.evidenceSummary.worldState, null, 2),
    registry,
  );
  writeArtifact(
    'PULSE_EXECUTION_TRACE.json',
    JSON.stringify(snapshot.certification.evidenceSummary.executionTrace, null, 2),
    registry,
  );
  writeArtifact(
    'PULSE_CODEBASE_TRUTH.json',
    JSON.stringify(snapshot.codebaseTruth, null, 2),
    registry,
  );
  writeArtifact(
    'PULSE_RESOLVED_MANIFEST.json',
    JSON.stringify(snapshot.resolvedManifest, null, 2),
    registry,
  );

  return {
    reportPath,
    certificatePath,
    cliDirectivePath,
    artifactIndexPath,
  };
}
