/**
 * Pure helper builders for the PULSE CLI directive: preconditions,
 * allowedActions, forbiddenActions, successCriteria. Extracted from
 * artifacts.directive.ts to keep the main file under the architecture
 * line budget.
 */
import type { PulseArtifactSnapshot } from './artifacts.types';
import type { QueueUnit } from './artifacts.queue';

export function buildPreconditions(snapshot: PulseArtifactSnapshot, unit: QueueUnit): string[] {
  const conditions: string[] = [];

  if (unit.evidenceMode === 'inferred') {
    conditions.push('Structural evidence must be rechecked for accuracy.');
  }

  if (snapshot.externalSignalState.summary.staleAdapters > 0) {
    conditions.push('External signal adapters are stale; consider refreshing before this work.');
  }

  if (unit.executionMode === 'human_required') {
    conditions.push('Human approval required before execution.');
  }

  if (
    unit.affectedCapabilityIds.some((capId) =>
      snapshot.capabilityState.capabilities.some(
        (cap) => cap.id === capId && (cap.status === 'phantom' || cap.status === 'partial'),
      ),
    )
  ) {
    conditions.push('One or more affected capabilities are still partial or phantom.');
  }

  if (
    unit.relatedFiles.some((file) =>
      snapshot.codacyEvidence.hotspots.some(
        (hotspot) => hotspot.filePath === file && hotspot.highSeverityCount > 0,
      ),
    )
  ) {
    conditions.push('Affected files have high-severity Codacy hotspots; address those first.');
  }

  return conditions.length > 0 ? conditions : ['No preconditions; safe to start.'];
}

export function buildAllowedActions(unit: QueueUnit): string[] {
  if (unit.executionMode === 'observation_only') {
    return ['Read-only scanning', 'Report generation', 'Dependency analysis'];
  }

  if (unit.executionMode === 'human_required') {
    return ['Manual code review', 'Planning and design', 'Approval workflows', 'Risk assessment'];
  }

  return [
    'Code generation',
    'File mutations',
    'Integration setup',
    'Test writing',
    'Schema migrations',
    'Configuration changes',
  ];
}

export function buildForbiddenActions(snapshot: PulseArtifactSnapshot): string[] {
  return [
    'Do not suppress Codacy or linting results',
    'Do not edit governance-protected files (scripts/ops/*, CLAUDE.md, AGENTS.md, .codacy.yml)',
    'Do not use db push in production or CI',
    'Do not reduce test coverage or delete existing tests',
    'Do not commit secrets or credentials',
    'Do not bypass payment, auth, or webhook validation',
    'Do not rewrite git history or force pushes',
    ...(snapshot.externalSignalState.signals.some((s) => s.severity >= 0.85)
      ? [
          'Pause work if critical external signals appear (Sentry error, Datadog alert, failed Action)',
        ]
      : []),
  ];
}

export function buildSuccessCriteria(unit: QueueUnit): string[] {
  const criteria: string[] = [];

  if (unit.kind === 'capability') {
    criteria.push('Capability status changed from LATENT/PHANTOM to REAL or PARTIAL.');
    criteria.push('All affected routes have working backend endpoints.');
  }

  if (unit.kind === 'flow') {
    criteria.push('Flow execution chain is complete (entry → steps → exit).');
    criteria.push('All conditional branches are covered.');
  }

  if (unit.kind === 'scope' && unit.breakTypes.includes('SCOPE_PARITY_GAP')) {
    criteria.push('Gap type (front/back/persistence/etc) resolved.');
    criteria.push('Affected surface now has real backing.');
  }

  criteria.push('All affected files pass linting and typecheck.');
  criteria.push('No new Codacy high/critical issues introduced.');
  criteria.push('Tests passing for affected modules.');

  return criteria;
}
