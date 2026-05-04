import * as path from 'path';

import type { DestructiveActionKind, SandboxRiskLevel } from '../../types.safety-sandbox';

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

export const RISK_ORDER: SandboxRiskLevel[] = ['safe', 'normal', 'high', 'critical'];

export const DEFAULT_LOGICAL_SANDBOX_MINUTES = RISK_ORDER.length * RISK_ORDER.length;

export const ACTION_KIND_GRAMMAR: DestructiveActionKind[] = [
  'migration',
  'external_state_mutation',
  'access_boundary_change',
  'infra_change',
  'secret_access',
  'delete_operation',
  'governance_change',
  'protected_file_edit',
];

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

export function normalizeRepoPath(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\.\//, '');
}

export function hasPathSegment(relativePath: string, segment: string): boolean {
  return normalizeRepoPath(relativePath).split('/').includes(segment);
}

export function addPathDerivedFileEffects(graph: FileEffectGraph): void {
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

export function addContentDerivedPatchEffects(graph: FileEffectGraph, content: string): void {
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
      kind: 'protected_file_edit',
      description: 'Protected governance file effect detected',
    });
  }
  if (graph.fileEffects.has('governance_surface')) {
    actions.push({ kind: 'governance_change', description: 'Governance surface effect detected' });
  }
  if (graph.fileEffects.has('secret_surface') || graph.patchEffects.has('secret_evidence')) {
    actions.push({ kind: 'secret_access', description: 'Secret or credential evidence detected' });
  }
  if (graph.fileEffects.has('migration_surface') || graph.patchEffects.has('destructive_sql')) {
    actions.push({
      kind: 'migration',
      description: 'Database schema or migration effect detected',
    });
  }
  if (graph.fileEffects.has('infra_surface')) {
    actions.push({ kind: 'infra_change', description: 'Infrastructure surface effect detected' });
  }
  if (graph.patchEffects.has('persistent_delete')) {
    actions.push({ kind: 'delete_operation', description: 'Persistent delete effect detected' });
  }
  if (graph.patchEffects.has('external_mutation')) {
    actions.push({
      kind: 'external_state_mutation',
      description: 'External or persistent state mutation effect detected',
    });
  }
  if (
    graph.fileEffects.has('access_boundary_surface') ||
    graph.patchEffects.has('access_boundary_change')
  ) {
    actions.push({
      kind: 'access_boundary_change',
      description: 'Access boundary effect detected',
    });
  }

  return actions;
}

export function maxRisk(...levels: SandboxRiskLevel[]): SandboxRiskLevel {
  return levels.reduce((max, level) =>
    RISK_ORDER.indexOf(level) > RISK_ORDER.indexOf(max) ? level : max,
  );
}

export function hasPatchEffects(graph: FileEffectGraph): boolean {
  return graph.patchEffects.size > Number.parseInt('0', 10);
}
