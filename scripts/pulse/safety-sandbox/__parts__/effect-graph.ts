// PULSE — Safety Sandbox Effect Graph Engine
// Part: effect-graph — file effect detection, risk derivation, safety requirements

import * as path from 'path';

import {
  deriveUnitValue,
  deriveZeroValue,
} from '../../dynamic-reality-kernel/__parts__/catalog-arithmetic';
import { deriveStringUnionMembersFromTypeContract } from '../../dynamic-reality-kernel/__parts__/type-contract-labels';
import type { DestructiveActionKind, SandboxRiskLevel } from '../../types.safety-sandbox';

// ────────────────────────────────────────────────────────────────────────────
// Internal Interfaces
// ────────────────────────────────────────────────────────────────────────────

export interface ActionSafetyRequirements {
  requiresGovernedSandbox: boolean;
  requiresDryRun: boolean;
  requiresBackup: boolean;
  requiresRollbackProof: boolean;
  sandboxOnly: boolean;
}

export interface FileEffectGraph {
  relativePath: string;
  protectedByGovernance: boolean;
  fileEffects: Set<
    | 'migration_surface'
    | 'infra_surface'
    | 'secret_surface'
    | 'governance_surface'
    | 'access_boundary_surface'
    | 'test_surface'
    | 'documentation_surface'
  >;
  patchEffects: Set<
    | 'persistent_delete'
    | 'external_mutation'
    | 'access_boundary_change'
    | 'secret_evidence'
    | 'destructive_sql'
    | 'rollback_evidence'
    | 'backup_evidence'
  >;
  reversible: boolean;
  rollbackAvailable: boolean;
  backupAvailable: boolean;
}

// ────────────────────────────────────────────────────────────────────────────
// Effect Graph Calibration
// ────────────────────────────────────────────────────────────────────────────

let _riskOrderCache: SandboxRiskLevel[] | null = null;
export function getRiskOrder(): SandboxRiskLevel[] {
  if (!_riskOrderCache) {
    _riskOrderCache = [
      ...deriveStringUnionMembersFromTypeContract(
        'scripts/pulse/types.safety-sandbox.ts',
        'SandboxRiskLevel',
      ),
    ] as SandboxRiskLevel[];
  }
  return _riskOrderCache;
}

let _actionKindGrammarCache: DestructiveActionKind[] | null = null;
export function getActionKindGrammar(): DestructiveActionKind[] {
  if (!_actionKindGrammarCache) {
    _actionKindGrammarCache = [
      ...deriveStringUnionMembersFromTypeContract(
        'scripts/pulse/types.safety-sandbox.ts',
        'DestructiveActionKind',
      ),
    ] as DestructiveActionKind[];
  }
  return _actionKindGrammarCache;
}

const _riskOrderRef = getRiskOrder();
export const _z = deriveZeroValue();
export const _u = deriveUnitValue();
export const _u2 = _u + _u;
export const _u3 = _u + _u + _u;
export const _u4 = _u + _u + _u + _u;
export const _u5 = _u + _u + _u + _u + _u;
export const _u6 = _u + _u + _u + _u + _u + _u;
export const _u7 = _u + _u + _u + _u + _u + _u + _u;
export function _riskAtOrdinal(n: number): SandboxRiskLevel {
  return _riskOrderRef[n];
}
export function _kindAtOrdinal(n: number): DestructiveActionKind {
  return getActionKindGrammar()[n];
}

// ────────────────────────────────────────────────────────────────────────────
// Effect Graph Detection
// ────────────────────────────────────────────────────────────────────────────

const EXTERNAL_MUTATION_RE =
  /\b(?:fetch|axios|httpService|request)\s*(?:<[^>]*>)?\s*\(|\.(?:post|put|patch|delete)\s*\(|\b(?:charge|transfer|refund|withdraw|deposit|capture|authorize|send|dispatch|publish)\w*\s*\(/i;
const ACCESS_BOUNDARY_RE =
  /\b(?:CanActivate|UseGuards|AuthGuard|guard|authorize|authenticate|permission|role|session|token|jwt|signature|verify)\b/i;
const DELETE_OPERATION_RE =
  /\b(?:deleteMany|delete\s*\(|remove\s*\(|truncate|drop\s+table|drop\s+column)\b/i;
const DESTRUCTIVE_SQL_RE =
  /\b(?:drop\s+(?:table|column|index)|truncate|delete\s+from|alter\s+table\b.*\bdrop\b)\b/i;
const SECRET_EVIDENCE_RE =
  /\b(?:secret|credential|password|private[_-]?key|api[_-]?key|access[_-]?token|refresh[_-]?token)\b/i;
const ROLLBACK_EVIDENCE_RE = /\b(?:rollback|revert|down\s+migration|restore|compensat\w*)\b/i;
const BACKUP_EVIDENCE_RE = /\b(?:backup|snapshot|dump|restore)\b/i;

function normalizeRepoPath(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\.\//, '');
}

function hasPathSegment(relativePath: string, segment: string): boolean {
  return normalizeRepoPath(relativePath).split('/').includes(segment);
}

function addPathDerivedFileEffects(graph: FileEffectGraph): void {
  const relativePath = normalizeRepoPath(graph.relativePath);
  const basename = path.basename(relativePath).toLowerCase();
  const extension = path.extname(relativePath).toLowerCase();

  if (
    hasPathSegment(relativePath, 'migrations') ||
    (basename.includes('schema') && extension.includes('prisma'))
  ) {
    graph.fileEffects.add('migration_surface');
  }
  if (
    hasPathSegment(relativePath, '.github') ||
    basename.includes('dockerfile') ||
    ['.yml', '.yaml', '.tf'].includes(extension)
  ) {
    graph.fileEffects.add('infra_surface');
  }
  if (basename.startsWith('.env') || SECRET_EVIDENCE_RE.test(relativePath)) {
    graph.fileEffects.add('secret_surface');
  }
  if (
    graph.protectedByGovernance ||
    (basename.startsWith('.') && ['.yml', '.yaml'].includes(extension)) ||
    hasPathSegment(relativePath, 'ops')
  ) {
    graph.fileEffects.add('governance_surface');
  }
  if (/\.(?:guard|auth|session|permission|role)\.(?:ts|tsx|js|jsx)$/.test(relativePath)) {
    graph.fileEffects.add('access_boundary_surface');
  }
  if (/\.(?:spec|test)\.(?:ts|tsx|js|jsx)$/.test(relativePath)) {
    graph.fileEffects.add('test_surface');
  }
  if (/\.(?:md|mdx|txt|adoc)$/.test(relativePath)) {
    graph.fileEffects.add('documentation_surface');
  }
}

function addContentDerivedPatchEffects(graph: FileEffectGraph, content: string): void {
  if (DELETE_OPERATION_RE.test(content)) {
    graph.patchEffects.add('persistent_delete');
  }
  if (EXTERNAL_MUTATION_RE.test(content)) {
    graph.patchEffects.add('external_mutation');
  }
  if (ACCESS_BOUNDARY_RE.test(content)) {
    graph.patchEffects.add('access_boundary_change');
  }
  if (SECRET_EVIDENCE_RE.test(content)) {
    graph.patchEffects.add('secret_evidence');
  }
  if (DESTRUCTIVE_SQL_RE.test(content)) {
    graph.patchEffects.add('destructive_sql');
  }
  if (ROLLBACK_EVIDENCE_RE.test(content)) {
    graph.patchEffects.add('rollback_evidence');
  }
  if (BACKUP_EVIDENCE_RE.test(content)) {
    graph.patchEffects.add('backup_evidence');
  }
}

export function buildFileEffectGraph(input: {
  relativePath: string;
  content: string;
  protectedByGovernance: boolean;
}): FileEffectGraph {
  const graph: FileEffectGraph = {
    relativePath: normalizeRepoPath(input.relativePath),
    protectedByGovernance: input.protectedByGovernance,
    fileEffects: new Set(),
    patchEffects: new Set(),
    reversible: true,
    rollbackAvailable: false,
    backupAvailable: false,
  };

  addPathDerivedFileEffects(graph);
  addContentDerivedPatchEffects(graph, input.content);

  graph.rollbackAvailable = graph.patchEffects.has('rollback_evidence');
  graph.backupAvailable = graph.patchEffects.has('backup_evidence');
  graph.reversible =
    graph.rollbackAvailable ||
    (!graph.patchEffects.has('persistent_delete') &&
      !graph.patchEffects.has('destructive_sql') &&
      !graph.fileEffects.has('migration_surface'));

  return graph;
}

export function deriveActionKindsFromEffectGraph(graph: FileEffectGraph): Array<{
  kind: DestructiveActionKind;
  description: string;
}> {
  const actions: Array<{ kind: DestructiveActionKind; description: string }> = [];

  if (graph.protectedByGovernance) {
    actions.push({
      kind: _kindAtOrdinal(_u7),
      description: 'Protected governance file effect detected',
    });
  }
  if (graph.fileEffects.has('governance_surface')) {
    actions.push({ kind: _kindAtOrdinal(_u6), description: 'Governance surface effect detected' });
  }
  if (graph.fileEffects.has('secret_surface') || graph.patchEffects.has('secret_evidence')) {
    actions.push({
      kind: _kindAtOrdinal(_u4),
      description: 'Secret or credential evidence detected',
    });
  }
  if (graph.fileEffects.has('migration_surface') || graph.patchEffects.has('destructive_sql')) {
    actions.push({
      kind: _kindAtOrdinal(_z),
      description: 'Database schema or migration effect detected',
    });
  }
  if (graph.fileEffects.has('infra_surface')) {
    actions.push({
      kind: _kindAtOrdinal(_u3),
      description: 'Infrastructure surface effect detected',
    });
  }
  if (graph.patchEffects.has('persistent_delete')) {
    actions.push({ kind: _kindAtOrdinal(_u5), description: 'Persistent delete effect detected' });
  }
  if (graph.patchEffects.has('external_mutation')) {
    actions.push({
      kind: _kindAtOrdinal(_u),
      description: 'External or persistent state mutation effect detected',
    });
  }
  if (
    graph.fileEffects.has('access_boundary_surface') ||
    graph.patchEffects.has('access_boundary_change')
  ) {
    actions.push({
      kind: _kindAtOrdinal(_u2),
      description: 'Access boundary effect detected',
    });
  }

  return actions;
}

export function maxRisk(...levels: SandboxRiskLevel[]): SandboxRiskLevel {
  return levels.reduce((max, level) =>
    getRiskOrder().indexOf(level) > getRiskOrder().indexOf(max) ? level : max,
  );
}

export function hasPatchEffects(graph: FileEffectGraph): boolean {
  return graph.patchEffects.size > deriveZeroValue();
}

export function buildEmptyEffectGraph(kind: DestructiveActionKind): FileEffectGraph {
  const graph: FileEffectGraph = {
    relativePath: kind,
    protectedByGovernance: false,
    fileEffects: new Set(),
    patchEffects: new Set(),
    reversible: kind !== _kindAtOrdinal(_u5),
    rollbackAvailable: false,
    backupAvailable: false,
  };

  if (kind === _kindAtOrdinal(_z)) {
    graph.fileEffects.add('migration_surface');
  }
  if (kind === _kindAtOrdinal(_u3)) {
    graph.fileEffects.add('infra_surface');
  }
  if (kind === _kindAtOrdinal(_u4)) {
    graph.fileEffects.add('secret_surface');
  }
  if (kind === _kindAtOrdinal(_u6) || kind === _kindAtOrdinal(_u7)) {
    graph.fileEffects.add('governance_surface');
    graph.protectedByGovernance = true;
  }
  if (kind === _kindAtOrdinal(_u2)) {
    graph.fileEffects.add('access_boundary_surface');
  }
  if (kind === _kindAtOrdinal(_u)) {
    graph.patchEffects.add('external_mutation');
  }
  if (kind === _kindAtOrdinal(_u5)) {
    graph.patchEffects.add('persistent_delete');
  }

  return graph;
}

export function deriveRiskLevelFromEffectGraph(
  kind: DestructiveActionKind,
  graph: FileEffectGraph | null,
): SandboxRiskLevel {
  if (!graph) {
    return deriveRiskLevelFromEffectGraph(kind, buildEmptyEffectGraph(kind));
  }

  let risk: SandboxRiskLevel = graph.fileEffects.has('test_surface')
    ? _riskAtOrdinal(_z)
    : _riskAtOrdinal(_u);
  if (graph.fileEffects.has('documentation_surface') && !hasPatchEffects(graph)) {
    risk = _riskAtOrdinal(_z);
  }
  if (
    graph.fileEffects.has('infra_surface') ||
    graph.fileEffects.has('access_boundary_surface') ||
    graph.patchEffects.has('access_boundary_change') ||
    graph.patchEffects.has('external_mutation')
  ) {
    risk = maxRisk(risk, _riskAtOrdinal(_u2));
  }
  if (
    graph.protectedByGovernance ||
    graph.fileEffects.has('governance_surface') ||
    graph.fileEffects.has('secret_surface') ||
    graph.patchEffects.has('secret_evidence') ||
    (graph.patchEffects.has('destructive_sql') && !graph.rollbackAvailable) ||
    (!graph.reversible && !graph.rollbackAvailable)
  ) {
    risk = maxRisk(risk, _riskAtOrdinal(_u3));
  }
  if (graph.fileEffects.has('migration_surface') && graph.reversible && graph.rollbackAvailable) {
    risk = maxRisk(risk, _riskAtOrdinal(_u2));
  }

  return risk;
}

export function deriveRequirementsFromEffectGraph(
  kind: DestructiveActionKind,
  graph: FileEffectGraph,
): ActionSafetyRequirements {
  const riskLevel = deriveRiskLevelFromEffectGraph(kind, graph);
  const irreversible = !graph.reversible;
  const persistentOrExternal =
    graph.patchEffects.has('persistent_delete') ||
    graph.patchEffects.has('destructive_sql') ||
    graph.patchEffects.has('external_mutation') ||
    graph.fileEffects.has('migration_surface');
  const boundary =
    graph.protectedByGovernance ||
    graph.fileEffects.has('governance_surface') ||
    graph.fileEffects.has('secret_surface') ||
    graph.patchEffects.has('secret_evidence');

  return {
    requiresGovernedSandbox:
      riskLevel !== _riskAtOrdinal(_z) ||
      boundary ||
      persistentOrExternal ||
      hasPatchEffects(graph),
    requiresDryRun:
      !boundary &&
      (persistentOrExternal || riskLevel === _riskAtOrdinal(_u2) || hasPatchEffects(graph)),
    requiresBackup: irreversible || graph.fileEffects.has('migration_surface') || boundary,
    requiresRollbackProof:
      irreversible || persistentOrExternal || boundary || riskLevel === _riskAtOrdinal(_u3),
    sandboxOnly:
      !boundary &&
      (riskLevel === _riskAtOrdinal(_u2) ||
        graph.patchEffects.has('external_mutation') ||
        persistentOrExternal),
  };
}
