import * as fs from 'fs';
import * as path from 'path';
import type {
  Break,
  PulseCertification,
  PulseCodebaseTruth,
  PulseConvergencePlan,
  PulseHealth,
  PulseManifest,
  PulseModuleState,
  PulseResolvedManifest,
} from './types';
import { buildConvergencePlan, renderConvergencePlanMarkdown } from './convergence-plan';
import { escapeMarkdownTableCell } from './markdown-utils';

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
  /** Certification property. */
  certification: PulseCertification;
}

/** Pulse artifact paths shape. */
export interface PulseArtifactPaths {
  /** Report path property. */
  reportPath: string;
  /** Matrix path property. */
  matrixPath: string;
  /** Certificate path property. */
  certificatePath: string;
  /** Convergence plan path property. */
  convergencePlanPath: string;
  /** Convergence plan markdown path property. */
  convergencePlanMarkdownPath: string;
  /** Runtime evidence path property. */
  runtimeEvidencePath: string;
  /** Runtime probes path property. */
  runtimeProbesPath: string;
  /** Browser evidence path property. */
  browserEvidencePath: string;
  /** Flow evidence path property. */
  flowEvidencePath: string;
  /** Invariant evidence path property. */
  invariantEvidencePath: string;
  /** Observability evidence path property. */
  observabilityEvidencePath: string;
  /** Recovery evidence path property. */
  recoveryEvidencePath: string;
  /** Customer evidence path property. */
  customerEvidencePath: string;
  /** Operator evidence path property. */
  operatorEvidencePath: string;
  /** Admin evidence path property. */
  adminEvidencePath: string;
  /** Soak evidence path property. */
  soakEvidencePath: string;
  /** Scenario coverage path property. */
  scenarioCoveragePath: string;
  /** World state path property. */
  worldStatePath: string;
  /** Execution trace path property. */
  executionTracePath: string;
  /** Codebase truth path property. */
  codebaseTruthPath: string;
  /** Resolved manifest path property. */
  resolvedManifestPath: string;
  /** Product map path property. */
  productMapPath: string;
}

function healthBar(score: number): string {
  const filled = Math.round(score / 5);
  const empty = 20 - filled;
  return '\u2588'.repeat(filled) + '\u2591'.repeat(empty);
}

function tableCell(value: string, max: number = 220): string {
  const compact = escapeMarkdownTableCell(value);
  if (compact.length <= max) {
    return compact;
  }
  return `${compact.slice(0, max - 3)}...`;
}

function severityIcon(severity: string): string {
  if (severity === 'critical') {
    return 'CRITICAL';
  }
  if (severity === 'high') {
    return 'HIGH';
  }
  if (severity === 'medium') {
    return 'WARNING';
  }
  return 'INFO';
}

function formatCertificationTarget(target: PulseCertification['certificationTarget']): string {
  if (target.profile) {
    return target.profile;
  }
  if (target.final) {
    return 'FINAL';
  }
  if (target.tier !== null) {
    return `TIER ${target.tier}`;
  }
  return 'GLOBAL';
}

function groupBreaks(breaks: Break[]): Map<string, Break[]> {
  const groups = new Map<string, Break[]>();
  for (const item of breaks) {
    const key = item.type;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(item);
  }
  return groups;
}

function generateCorrectionPrompt(breaks: Break[]): string {
  const blocking = breaks.filter(
    (item) => item.severity === 'critical' || item.severity === 'high',
  );
  if (blocking.length === 0) {
    return 'No critical/high issues are open. Keep the certificate honest by running deeper gates before declaring production readiness.';
  }

  const lines: string[] = [];
  lines.push('Fix the following blocking issues found by PULSE certification:');
  lines.push('');

  for (const [index, item] of blocking.entries()) {
    lines.push(`${index + 1}. [${item.type}] ${item.file}:${item.line} — ${item.description}`);
    if (item.detail) {
      lines.push(`   Evidence: ${item.detail}`);
    }
  }

  return lines.join('\n');
}

function buildReport(
  snapshot: PulseArtifactSnapshot,
  convergencePlan: PulseConvergencePlan,
): string {
  const { health, manifest, codebaseTruth, resolvedManifest, certification } = snapshot;
  const lines: string[] = [];
  const groupedBreaks = groupBreaks(health.breaks);

  lines.push(`# PULSE REPORT — ${certification.timestamp}`);
  lines.push('');
  lines.push(`## Certification Status: ${certification.status}`);
  lines.push('');
  lines.push(`- Score: ${certification.score}/100 (raw scan: ${certification.rawScore}/100)`);
  lines.push(`- Environment: ${certification.environment}`);
  lines.push(`- Commit: ${certification.commitSha}`);
  lines.push(`- Manifest: ${certification.manifestPath || '(missing)'}`);
  lines.push(
    `- Project: ${manifest ? `${manifest.projectName} (${manifest.projectId})` : '(manifest unavailable)'}`,
  );
  lines.push('');

  lines.push('## Codebase Truth');
  lines.push('');
  lines.push(`- Frontend pages discovered: ${codebaseTruth.summary.totalPages}`);
  lines.push(`- User-facing pages: ${codebaseTruth.summary.userFacingPages}`);
  lines.push(`- Raw modules discovered: ${codebaseTruth.summary.discoveredModules}`);
  lines.push(`- Raw mutation flow candidates: ${codebaseTruth.summary.discoveredFlows}`);
  lines.push('');

  lines.push('## Resolved Manifest');
  lines.push('');
  lines.push(
    `- Resolved modules: ${resolvedManifest.summary.resolvedModules}/${resolvedManifest.summary.totalModules}`,
  );
  lines.push(
    `- Resolved flow groups: ${resolvedManifest.summary.resolvedFlowGroups}/${resolvedManifest.summary.totalFlowGroups}`,
  );
  lines.push(`- Grouped semantic flow groups: ${resolvedManifest.summary.groupedFlowGroups}`);
  lines.push(`- Shared capability groups: ${resolvedManifest.summary.sharedCapabilityGroups}`);
  lines.push(`- Unresolved modules: ${resolvedManifest.summary.unresolvedModules}`);
  lines.push(`- Unresolved flow groups: ${resolvedManifest.summary.unresolvedFlowGroups}`);
  lines.push(`- Orphan manual modules: ${resolvedManifest.summary.orphanManualModules}`);
  lines.push(`- Legacy manual modules: ${resolvedManifest.summary.legacyManualModules}`);
  lines.push(`- Orphan flow specs: ${resolvedManifest.summary.orphanFlowSpecs}`);
  lines.push('');

  lines.push(`## Health Score: ${certification.score}/100`);
  lines.push(`\`${healthBar(certification.score)}\` ${certification.score}%`);
  lines.push('');

  lines.push('## Gates');
  lines.push('');
  lines.push('| Gate | Status | Failure Class | Reason |');
  lines.push('|------|--------|---------------|--------|');
  for (const [gateName, result] of Object.entries(certification.gates)) {
    lines.push(
      `| ${gateName} | ${result.status.toUpperCase()} | ${result.failureClass || '—'} | ${tableCell(result.reason)} |`,
    );
  }
  lines.push('');

  lines.push('## Certification Tiers');
  lines.push('');
  lines.push(`- Target: ${formatCertificationTarget(certification.certificationTarget)}`);
  lines.push(
    `- Blocking tier: ${certification.blockingTier !== null ? certification.blockingTier : 'None'}`,
  );
  lines.push('');
  lines.push('| Tier | Name | Status | Blocking Gates | Reason |');
  lines.push('|------|------|--------|----------------|--------|');
  for (const tier of certification.tierStatus) {
    lines.push(
      `| ${tier.id} | ${tier.name} | ${tier.status.toUpperCase()} | ${tier.blockingGates.length > 0 ? tier.blockingGates.join(', ') : '—'} | ${tableCell(tier.reason, 160)} |`,
    );
  }
  lines.push('');

  lines.push('## Evidence Summary');
  lines.push('');
  lines.push(`- Runtime: ${tableCell(certification.evidenceSummary.runtime.summary, 320)}`);
  lines.push(`- Browser: ${tableCell(certification.evidenceSummary.browser.summary, 320)}`);
  lines.push(`- Flows: ${tableCell(certification.evidenceSummary.flows.summary, 320)}`);
  lines.push(`- Invariants: ${tableCell(certification.evidenceSummary.invariants.summary, 320)}`);
  lines.push(
    `- Observability: ${tableCell(certification.evidenceSummary.observability.summary, 320)}`,
  );
  lines.push(`- Recovery: ${tableCell(certification.evidenceSummary.recovery.summary, 320)}`);
  lines.push(`- Customer: ${tableCell(certification.evidenceSummary.customer.summary, 320)}`);
  lines.push(`- Operator: ${tableCell(certification.evidenceSummary.operator.summary, 320)}`);
  lines.push(`- Admin: ${tableCell(certification.evidenceSummary.admin.summary, 320)}`);
  lines.push(`- Soak: ${tableCell(certification.evidenceSummary.soak.summary, 320)}`);
  lines.push(
    `- Synthetic Coverage: ${tableCell(certification.evidenceSummary.syntheticCoverage.summary, 320)}`,
  );
  lines.push(
    `- Execution Trace: ${tableCell(certification.evidenceSummary.executionTrace.summary, 320)}`,
  );
  lines.push(`- Truth: ${tableCell(certification.gates.truthExtractionPass.reason, 320)}`);
  lines.push('');

  lines.push('## Human Replacement');
  lines.push('');
  lines.push(`- Status: ${certification.humanReplacementStatus}`);
  lines.push(`- Final target: ${formatCertificationTarget(certification.certificationTarget)}`);
  lines.push(
    `- Covered pages: ${certification.evidenceSummary.syntheticCoverage.coveredPages}/${certification.evidenceSummary.syntheticCoverage.userFacingPages}`,
  );
  lines.push(
    `- Uncovered pages: ${certification.evidenceSummary.syntheticCoverage.uncoveredPages.length}`,
  );
  lines.push(`- Accepted critical flows remaining: ${certification.acceptedFlowsRemaining.length}`);
  lines.push(`- Pending critical scenarios: ${certification.pendingCriticalScenarios.length}`);
  lines.push(
    `- Customer scenarios: ${certification.evidenceSummary.customer.passed.length}/${certification.evidenceSummary.customer.declared.length} passed`,
  );
  lines.push(
    `- Operator scenarios: ${certification.evidenceSummary.operator.passed.length}/${certification.evidenceSummary.operator.declared.length} passed`,
  );
  lines.push(
    `- Admin scenarios: ${certification.evidenceSummary.admin.passed.length}/${certification.evidenceSummary.admin.declared.length} passed`,
  );
  lines.push(
    `- Soak scenarios: ${certification.evidenceSummary.soak.passed.length}/${certification.evidenceSummary.soak.declared.length} passed`,
  );
  lines.push('');

  lines.push('## Convergence Queue');
  lines.push('');
  lines.push(`- Queue length: ${convergencePlan.summary.totalUnits}`);
  lines.push(`- Scenario units: ${convergencePlan.summary.scenarioUnits}`);
  lines.push(`- Security units: ${convergencePlan.summary.securityUnits}`);
  lines.push(`- Gate units: ${convergencePlan.summary.gateUnits}`);
  lines.push(`- Static units: ${convergencePlan.summary.staticUnits}`);
  lines.push(
    `- Priorities: P0=${convergencePlan.summary.priorities.P0}, P1=${convergencePlan.summary.priorities.P1}, P2=${convergencePlan.summary.priorities.P2}, P3=${convergencePlan.summary.priorities.P3}`,
  );
  lines.push(
    `- Pending async expectations: ${convergencePlan.summary.pendingAsyncExpectations.length}`,
  );
  lines.push(`- Artifact: PULSE_CONVERGENCE_PLAN.md`);
  lines.push('');
  if (convergencePlan.queue.length > 0) {
    lines.push('| Order | Priority | Lane | Kind | Unit | Opened By |');
    lines.push('|-------|----------|------|------|------|-----------|');
    for (const unit of convergencePlan.queue.slice(0, 10)) {
      const openedBy = [
        ...new Set([...unit.gateNames, ...unit.scenarioIds, ...unit.asyncExpectations]),
      ];
      lines.push(
        `| ${unit.order} | ${unit.priority} | ${unit.ownerLane} | ${unit.kind.toUpperCase()} | ${tableCell(unit.title, 90)} | ${tableCell(openedBy.join(', ') || '—', 120)} |`,
      );
    }
    if (convergencePlan.queue.length > 10) {
      lines.push(
        `| ... | ... | ... | ... | ${convergencePlan.queue.length - 10} more units in PULSE_CONVERGENCE_PLAN.md | ... |`,
      );
    }
  } else {
    lines.push('- No convergence units are open.');
  }
  lines.push('');

  lines.push('## Resolution Gaps');
  lines.push('');
  const gapSections: Array<[string, string[]]> = [
    ['Unresolved Modules', resolvedManifest.diagnostics.unresolvedModules],
    ['Orphan Manual Modules', resolvedManifest.diagnostics.orphanManualModules],
    ['Unresolved Flow Groups', resolvedManifest.diagnostics.unresolvedFlowGroups],
    ['Orphan Flow Specs', resolvedManifest.diagnostics.orphanFlowSpecs],
    ['Legacy Manual Modules', resolvedManifest.diagnostics.legacyManualModules],
    ['Excluded Modules', resolvedManifest.diagnostics.excludedModules],
    ['Excluded Flow Groups', resolvedManifest.diagnostics.excludedFlowGroups],
  ];
  for (const [title, entries] of gapSections) {
    lines.push(`### ${title}`);
    lines.push('');
    if (entries.length === 0) {
      lines.push('- None');
    } else {
      for (const entry of entries.slice(0, 20)) {
        lines.push(`- ${tableCell(entry, 220)}`);
      }
      if (entries.length > 20) {
        lines.push(`- ... ${entries.length - 20} more`);
      }
    }
    lines.push('');
  }

  lines.push('## Gate Evidence');
  lines.push('');
  for (const [gateName, records] of Object.entries(certification.gateEvidence)) {
    lines.push(`### ${gateName}`);
    lines.push('');
    for (const record of records || []) {
      const metrics = record.metrics
        ? Object.entries(record.metrics)
            .map(([key, value]) => `${key}=${value}`)
            .join(', ')
        : '';
      const artifactText =
        record.artifactPaths.length > 0 ? record.artifactPaths.join(', ') : '(none)';
      lines.push(
        `- ${record.kind} | executed=${record.executed} | ${tableCell(record.summary, 320)}`,
      );
      lines.push(`- Artifacts: ${artifactText}${metrics ? ` | Metrics: ${metrics}` : ''}`);
    }
    lines.push('');
  }

  lines.push('## Summary');
  lines.push('');
  lines.push('| Metric | Total | Issues |');
  lines.push('|--------|-------|--------|');
  lines.push(
    `| UI Elements | ${health.stats.uiElements} | ${health.stats.uiDeadHandlers} dead handlers |`,
  );
  lines.push(`| API Calls | ${health.stats.apiCalls} | ${health.stats.apiNoRoute} no backend |`);
  lines.push(
    `| Backend Routes | ${health.stats.backendRoutes} | ${health.stats.backendEmpty} empty |`,
  );
  lines.push(
    `| Prisma Models | ${health.stats.prismaModels} | ${health.stats.modelOrphans} orphaned |`,
  );
  lines.push(
    `| Facades | ${health.stats.facades} | ${health.stats.facadesBySeverity.high} critical, ${health.stats.facadesBySeverity.medium} warning |`,
  );
  lines.push(
    `| Proxy Routes | ${health.stats.proxyRoutes} | ${health.stats.proxyNoUpstream} no upstream |`,
  );
  lines.push(`| Security | - | ${health.stats.securityIssues} issues |`);
  lines.push(`| Data Safety | - | ${health.stats.dataSafetyIssues} issues |`);
  lines.push(`| Quality | - | ${health.stats.qualityIssues} issues |`);
  lines.push(`| Unavailable Checks | - | ${health.stats.unavailableChecks} unavailable |`);
  lines.push(`| Unknown Surfaces | - | ${health.stats.unknownSurfaces} undeclared |`);
  lines.push('');

  lines.push(`## Breaks (${health.breaks.length} total)`);
  lines.push('');
  for (const type of [...groupedBreaks.keys()].sort()) {
    const group = groupedBreaks.get(type) || [];
    lines.push(`### ${type} (${group.length})`);
    lines.push('');
    lines.push('| Severity | File:Line | Description |');
    lines.push('|----------|-----------|-------------|');
    for (const item of group) {
      lines.push(
        `| ${severityIcon(item.severity)} | ${item.file}:${item.line} | ${tableCell(item.description)} |`,
      );
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push('## CORRECTION PROMPT');
  lines.push('');
  lines.push('```');
  lines.push(generateCorrectionPrompt(health.breaks));
  lines.push('```');

  return lines.join('\n');
}

function buildMatrix(snapshot: PulseArtifactSnapshot): string {
  const { health, manifest, resolvedManifest, certification } = snapshot;
  const lines: string[] = [];
  const manualModules = manifest?.modules || [];

  lines.push('# KLOEL — AUDIT FEATURE MATRIX');
  lines.push('');
  lines.push(
    `> Updated: ${certification.timestamp.slice(0, 10)} | Status: ${certification.status} | Score: ${certification.score}% | BREAKS: ${health.breaks.length} | MODULES(resolved): ${resolvedManifest.summary.totalModules}`,
  );
  lines.push('');

  lines.push('## Resolved Module Map');
  lines.push('');
  lines.push('| Module | Kind | State | Critical | Resolution | Pages | Routes | Source |');
  lines.push('|--------|------|-------|----------|------------|-------|--------|--------|');
  for (const moduleEntry of resolvedManifest.modules) {
    lines.push(
      `| **${moduleEntry.name}** | ${moduleEntry.moduleKind.toUpperCase()} | ${moduleEntry.state} | ${moduleEntry.critical ? 'YES' : 'NO'} | ${moduleEntry.resolution.toUpperCase()} | ${moduleEntry.pageCount} | ${tableCell(moduleEntry.routeRoots.join(', '), 80)} | ${moduleEntry.sourceModule || moduleEntry.legacySource || 'CODEBASE'} |`,
    );
  }
  if (resolvedManifest.modules.length === 0) {
    lines.push('| **No modules resolved** | USER_FACING | BROKEN | NO | DERIVED | 0 | — | — |');
  }
  lines.push('');

  lines.push('## Resolved Flow Groups');
  lines.push('');
  lines.push(
    '| Flow Group | Kind | Resolution | Critical | Members | Module Scope | Matched Spec |',
  );
  lines.push(
    '|------------|------|------------|----------|---------|--------------|--------------|',
  );
  for (const flowGroup of resolvedManifest.flowGroups.slice(0, 40)) {
    lines.push(
      `| ${flowGroup.id} | ${flowGroup.flowKind.toUpperCase()} | ${flowGroup.resolution.toUpperCase()} | ${flowGroup.critical ? 'YES' : 'NO'} | ${flowGroup.memberCount} | ${tableCell(flowGroup.moduleNames.join(', '), 60)} | ${flowGroup.matchedFlowSpec || '—'} |`,
    );
  }
  if (resolvedManifest.flowGroups.length > 40) {
    lines.push(`| ... ${resolvedManifest.flowGroups.length - 40} more | — | — | — | — | — | — |`);
  }
  lines.push('');

  lines.push('## Resolution Gaps');
  lines.push('');
  lines.push(`- Unresolved modules: ${resolvedManifest.summary.unresolvedModules}`);
  lines.push(`- Unresolved flow groups: ${resolvedManifest.summary.unresolvedFlowGroups}`);
  lines.push(`- Orphan manual modules: ${resolvedManifest.summary.orphanManualModules}`);
  lines.push(`- Legacy manual modules: ${resolvedManifest.summary.legacyManualModules}`);
  lines.push(`- Orphan flow specs: ${resolvedManifest.summary.orphanFlowSpecs}`);
  lines.push(`- Shared capability groups: ${resolvedManifest.summary.sharedCapabilityGroups}`);
  lines.push(`- Legacy-noise flow groups: ${resolvedManifest.summary.legacyNoiseFlowGroups}`);
  lines.push('');

  lines.push('## Legacy Manifest Compatibility');
  lines.push('');
  lines.push('| Module | State | Notes |');
  lines.push('|--------|-------|-------|');
  for (const moduleEntry of manifest?.legacyModules || []) {
    lines.push(
      `| **${moduleEntry.name}** | ${moduleEntry.state} | ${tableCell(moduleEntry.notes, 140)} |`,
    );
  }
  if ((manifest?.legacyModules || []).length === 0) {
    lines.push(
      '| **No legacy modules declared** | READY | The resolved manifest is already the only product taxonomy in scope |',
    );
  }
  lines.push('');

  lines.push('## Certification');
  lines.push('');
  lines.push('| Gate | Status | Failure Class |');
  lines.push('|------|--------|---------------|');
  for (const [gateName, result] of Object.entries(certification.gates)) {
    lines.push(`| ${gateName} | ${result.status.toUpperCase()} | ${result.failureClass || '—'} |`);
  }
  lines.push('');

  const summary = resolvedManifest.modules.reduce<Record<PulseModuleState, number>>(
    (acc, moduleEntry) => {
      acc[moduleEntry.state] = (acc[moduleEntry.state] || 0) + 1;
      return acc;
    },
    {
      READY: 0,
      PARTIAL: 0,
      SHELL_ONLY: 0,
      MOCKED: 0,
      BROKEN: 0,
      INTERNAL: 0,
    },
  );

  lines.push('## Summary');
  lines.push(`- READY modules: ${summary.READY}`);
  lines.push(`- PARTIAL modules: ${summary.PARTIAL}`);
  lines.push(`- SHELL_ONLY modules: ${summary.SHELL_ONLY}`);
  lines.push(`- MOCKED modules: ${summary.MOCKED}`);
  lines.push(`- BROKEN modules: ${summary.BROKEN}`);
  lines.push(`- INTERNAL modules: ${summary.INTERNAL}`);
  lines.push(`- Resolved modules: ${resolvedManifest.summary.totalModules}`);
  lines.push(`- Resolved flow groups: ${resolvedManifest.summary.totalFlowGroups}`);
  lines.push(`- Unresolved modules: ${resolvedManifest.summary.unresolvedModules}`);
  lines.push(`- Unresolved flow groups: ${resolvedManifest.summary.unresolvedFlowGroups}`);
  lines.push(`- Shared capability groups: ${resolvedManifest.summary.sharedCapabilityGroups}`);
  lines.push(`- Grouped semantic flow groups: ${resolvedManifest.summary.groupedFlowGroups}`);
  lines.push(`- Legacy manual modules: ${resolvedManifest.summary.legacyManualModules}`);
  lines.push(`- Total breaks: ${health.breaks.length}`);
  lines.push(`- Certification status: ${certification.status}`);
  lines.push(`- Human replacement status: ${certification.humanReplacementStatus}`);

  return lines.join('\n');
}

function buildProductMap(snapshot: PulseArtifactSnapshot): string {
  const { resolvedManifest, certification } = snapshot;
  const lines: string[] = [];

  lines.push('# KLOEL — PRODUCT MAP');
  lines.push('');
  lines.push(`> Generated: ${certification.timestamp} | Status: ${certification.status}`);
  lines.push('');
  lines.push('## Modules');
  lines.push('');
  lines.push('| Module | Kind | State | Critical | Pages | Routes | Notes |');
  lines.push('|--------|------|-------|----------|-------|--------|-------|');
  for (const moduleEntry of resolvedManifest.modules) {
    lines.push(
      `| **${moduleEntry.name}** | ${moduleEntry.moduleKind.toUpperCase()} | ${moduleEntry.state} | ${moduleEntry.critical ? 'YES' : 'NO'} | ${moduleEntry.pageCount} | ${tableCell(moduleEntry.routeRoots.join(', '), 80)} | ${tableCell(moduleEntry.notes, 160)} |`,
    );
  }
  lines.push('');
  lines.push('## Flow Groups');
  lines.push('');
  lines.push('| Flow Group | Kind | Resolution | Modules | Pages | Endpoints |');
  lines.push('|------------|------|------------|---------|-------|-----------|');
  for (const flowGroup of resolvedManifest.flowGroups) {
    lines.push(
      `| ${flowGroup.id} | ${flowGroup.flowKind.toUpperCase()} | ${flowGroup.resolution.toUpperCase()} | ${tableCell(flowGroup.moduleNames.join(', '), 80)} | ${tableCell(flowGroup.pageRoutes.join(', '), 80)} | ${tableCell(flowGroup.endpoints.join(', '), 120)} |`,
    );
  }
  lines.push('');
  lines.push('## Diagnostics');
  lines.push('');
  lines.push(`- Unresolved modules: ${resolvedManifest.diagnostics.unresolvedModules.length}`);
  lines.push(`- Orphan manual modules: ${resolvedManifest.diagnostics.orphanManualModules.length}`);
  lines.push(`- Legacy manual modules: ${resolvedManifest.diagnostics.legacyManualModules.length}`);
  lines.push(
    `- Unresolved flow groups: ${resolvedManifest.diagnostics.unresolvedFlowGroups.length}`,
  );
  lines.push(
    `- Shared capability groups: ${resolvedManifest.diagnostics.sharedCapabilityGroups.length}`,
  );
  lines.push(
    `- Grouped semantic flow groups: ${resolvedManifest.diagnostics.groupedFlowGroups.length}`,
  );
  lines.push(`- Orphan flow specs: ${resolvedManifest.diagnostics.orphanFlowSpecs.length}`);
  lines.push('');
  lines.push('## Synthetic Scenarios');
  lines.push('');
  lines.push(`- Customer scenarios: ${certification.evidenceSummary.customer.declared.length}`);
  lines.push(`- Operator scenarios: ${certification.evidenceSummary.operator.declared.length}`);
  lines.push(`- Admin scenarios: ${certification.evidenceSummary.admin.declared.length}`);
  lines.push(`- Soak scenarios: ${certification.evidenceSummary.soak.declared.length}`);
  lines.push(
    `- Covered user-facing pages: ${certification.evidenceSummary.syntheticCoverage.coveredPages}/${certification.evidenceSummary.syntheticCoverage.userFacingPages}`,
  );
  return lines.join('\n');
}

function buildCertificate(
  snapshot: PulseArtifactSnapshot,
  convergencePlan: PulseConvergencePlan,
): string {
  const { manifest, codebaseTruth, resolvedManifest, certification } = snapshot;
  return JSON.stringify(
    {
      projectId: manifest?.projectId || 'unknown',
      projectName: manifest?.projectName || 'unknown',
      commitSha: certification.commitSha,
      environment: certification.environment,
      manifestPath: certification.manifestPath,
      timestamp: certification.timestamp,
      status: certification.status,
      humanReplacementStatus: certification.humanReplacementStatus,
      score: certification.score,
      rawScore: certification.rawScore,
      certificationTarget: certification.certificationTarget,
      tierStatus: certification.tierStatus,
      blockingTier: certification.blockingTier,
      unsupportedStacks: certification.unsupportedStacks,
      unknownSurfaces: certification.unknownSurfaces,
      unavailableChecks: certification.unavailableChecks,
      criticalFailures: certification.criticalFailures,
      gates: certification.gates,
      truthSummary: certification.truthSummary,
      truthDivergence: certification.truthDivergence,
      resolvedManifestSummary: certification.resolvedManifestSummary,
      unresolvedModules: certification.unresolvedModules,
      unresolvedFlows: certification.unresolvedFlows,
      acceptedFlowsRemaining: certification.acceptedFlowsRemaining,
      pendingCriticalScenarios: certification.pendingCriticalScenarios,
      finalReadinessCriteria: certification.finalReadinessCriteria,
      codebaseTruthGeneratedAt: codebaseTruth.generatedAt,
      resolvedManifestGeneratedAt: resolvedManifest.generatedAt,
      evidenceSummary: certification.evidenceSummary,
      gateEvidence: certification.gateEvidence,
      convergencePlan: {
        generatedAt: convergencePlan.generatedAt,
        totalUnits: convergencePlan.summary.totalUnits,
        priorities: convergencePlan.summary.priorities,
        topQueue: convergencePlan.queue.slice(0, 10).map((unit) => ({
          order: unit.order,
          id: unit.id,
          priority: unit.priority,
          kind: unit.kind,
          title: unit.title,
          ownerLane: unit.ownerLane,
        })),
      },
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
  const convergencePlan = buildConvergencePlan({
    health: snapshot.health,
    resolvedManifest: snapshot.resolvedManifest,
    certification: snapshot.certification,
  });
  const reportPath = path.join(rootDir, 'PULSE_REPORT.md');
  const matrixPath = path.join(rootDir, 'AUDIT_FEATURE_MATRIX.md');
  const certificatePath = path.join(rootDir, 'PULSE_CERTIFICATE.json');
  const convergencePlanPath = path.join(rootDir, 'PULSE_CONVERGENCE_PLAN.json');
  const convergencePlanMarkdownPath = path.join(rootDir, 'PULSE_CONVERGENCE_PLAN.md');
  const runtimeEvidencePath = path.join(rootDir, 'PULSE_RUNTIME_EVIDENCE.json');
  const runtimeProbesPath = path.join(rootDir, 'PULSE_RUNTIME_PROBES.json');
  const browserEvidencePath = path.join(rootDir, 'PULSE_BROWSER_EVIDENCE.json');
  const flowEvidencePath = path.join(rootDir, 'PULSE_FLOW_EVIDENCE.json');
  const invariantEvidencePath = path.join(rootDir, 'PULSE_INVARIANT_EVIDENCE.json');
  const observabilityEvidencePath = path.join(rootDir, 'PULSE_OBSERVABILITY_EVIDENCE.json');
  const recoveryEvidencePath = path.join(rootDir, 'PULSE_RECOVERY_EVIDENCE.json');
  const customerEvidencePath = path.join(rootDir, 'PULSE_CUSTOMER_EVIDENCE.json');
  const operatorEvidencePath = path.join(rootDir, 'PULSE_OPERATOR_EVIDENCE.json');
  const adminEvidencePath = path.join(rootDir, 'PULSE_ADMIN_EVIDENCE.json');
  const soakEvidencePath = path.join(rootDir, 'PULSE_SOAK_EVIDENCE.json');
  const scenarioCoveragePath = path.join(rootDir, 'PULSE_SCENARIO_COVERAGE.json');
  const worldStatePath = path.join(rootDir, 'PULSE_WORLD_STATE.json');
  const executionTracePath = path.join(rootDir, 'PULSE_EXECUTION_TRACE.json');
  const codebaseTruthPath = path.join(rootDir, 'PULSE_CODEBASE_TRUTH.json');
  const resolvedManifestPath = path.join(rootDir, 'PULSE_RESOLVED_MANIFEST.json');
  const productMapPath = path.join(rootDir, 'KLOEL_PRODUCT_MAP.md');

  fs.writeFileSync(reportPath, buildReport(snapshot, convergencePlan));
  fs.writeFileSync(matrixPath, buildMatrix(snapshot));
  fs.writeFileSync(productMapPath, buildProductMap(snapshot));
  fs.writeFileSync(certificatePath, buildCertificate(snapshot, convergencePlan));
  fs.writeFileSync(convergencePlanPath, JSON.stringify(convergencePlan, null, 2));
  fs.writeFileSync(convergencePlanMarkdownPath, renderConvergencePlanMarkdown(convergencePlan));
  fs.writeFileSync(
    runtimeEvidencePath,
    JSON.stringify(snapshot.certification.evidenceSummary.runtime, null, 2),
  );
  fs.writeFileSync(
    runtimeProbesPath,
    JSON.stringify(snapshot.certification.evidenceSummary.runtime.probes, null, 2),
  );
  fs.writeFileSync(
    browserEvidencePath,
    JSON.stringify(snapshot.certification.evidenceSummary.browser, null, 2),
  );
  fs.writeFileSync(
    flowEvidencePath,
    JSON.stringify(snapshot.certification.evidenceSummary.flows, null, 2),
  );
  for (const result of snapshot.certification.evidenceSummary.flows.results) {
    const detailPath = path.join(
      rootDir,
      `PULSE_FLOW_${result.flowId.replace(/[^a-z0-9_-]+/gi, '-')}.json`,
    );
    fs.writeFileSync(detailPath, JSON.stringify(result, null, 2));
  }
  fs.writeFileSync(
    invariantEvidencePath,
    JSON.stringify(snapshot.certification.evidenceSummary.invariants, null, 2),
  );
  fs.writeFileSync(
    observabilityEvidencePath,
    JSON.stringify(snapshot.certification.evidenceSummary.observability, null, 2),
  );
  fs.writeFileSync(
    recoveryEvidencePath,
    JSON.stringify(snapshot.certification.evidenceSummary.recovery, null, 2),
  );
  fs.writeFileSync(
    customerEvidencePath,
    JSON.stringify(snapshot.certification.evidenceSummary.customer, null, 2),
  );
  fs.writeFileSync(
    operatorEvidencePath,
    JSON.stringify(snapshot.certification.evidenceSummary.operator, null, 2),
  );
  fs.writeFileSync(
    adminEvidencePath,
    JSON.stringify(snapshot.certification.evidenceSummary.admin, null, 2),
  );
  fs.writeFileSync(
    soakEvidencePath,
    JSON.stringify(snapshot.certification.evidenceSummary.soak, null, 2),
  );
  fs.writeFileSync(
    scenarioCoveragePath,
    JSON.stringify(snapshot.certification.evidenceSummary.syntheticCoverage, null, 2),
  );
  fs.writeFileSync(
    worldStatePath,
    JSON.stringify(snapshot.certification.evidenceSummary.worldState, null, 2),
  );
  fs.writeFileSync(
    executionTracePath,
    JSON.stringify(snapshot.certification.evidenceSummary.executionTrace, null, 2),
  );
  fs.writeFileSync(codebaseTruthPath, JSON.stringify(snapshot.codebaseTruth, null, 2));
  fs.writeFileSync(resolvedManifestPath, JSON.stringify(snapshot.resolvedManifest, null, 2));

  return {
    reportPath,
    matrixPath,
    certificatePath,
    convergencePlanPath,
    convergencePlanMarkdownPath,
    runtimeEvidencePath,
    runtimeProbesPath,
    browserEvidencePath,
    flowEvidencePath,
    invariantEvidencePath,
    observabilityEvidencePath,
    recoveryEvidencePath,
    customerEvidencePath,
    operatorEvidencePath,
    adminEvidencePath,
    soakEvidencePath,
    scenarioCoveragePath,
    worldStatePath,
    executionTracePath,
    codebaseTruthPath,
    resolvedManifestPath,
    productMapPath,
  };
}
