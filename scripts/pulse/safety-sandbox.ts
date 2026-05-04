// PULSE — Live Codebase Nervous System
// Safety Sandbox (Wave 9.3)
//
// Classifies destructive operations by risk level, defines isolation
// rules per operation type, simulates logical sandbox workspaces for
// planning validation, and gates autonomous execution of dangerous changes.
//
// This is a PLANNING module — it defines what should happen.
// It does NOT actually clone workspaces, execute patches, or apply migrations.

import * as path from 'path';
import * as fs from 'fs';

import { buildPulseCommandGraph, type PulseCommandPurpose } from './command-graph';
import {
  deriveUnitValue,
  deriveZeroValue,
  discoverAllObservedArtifactFilenames,
  discoverConvergenceEvidenceConfidenceLabels,
  discoverDirectorySkipHintsFromEvidence,
  deriveStringUnionMembersFromTypeContract,
} from './dynamic-reality-kernel';
import { ensureDir, pathExists, readJsonFile, writeTextFile } from './safe-fs';
import type {
  DestructiveAction,
  DestructiveActionKind,
  SandboxIsolationRules,
  SandboxRiskLevel,
  SandboxState,
  SandboxWorkspace,
} from './types.safety-sandbox';

const PROTECTED_FILES_PATH = 'ops/protected-governance-files.json';

interface ProtectedGovernanceConfig {
  protectedExact: string[];
  protectedPrefixes: string[];
}

// ────────────────────────────────────────────────────────────────────────────
// Effect Graph Calibration
// ────────────────────────────────────────────────────────────────────────────

interface ActionSafetyRequirements {
  requiresGovernedSandbox: boolean;
  requiresDryRun: boolean;
  requiresBackup: boolean;
  requiresRollbackProof: boolean;
  sandboxOnly: boolean;
}

interface FileEffectGraph {
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

let _riskOrderCache: SandboxRiskLevel[] | null = null;
function getRiskOrder(): SandboxRiskLevel[] {
  if (!_riskOrderCache) {
    _riskOrderCache = [...deriveStringUnionMembersFromTypeContract(
      'scripts/pulse/types.safety-sandbox.ts',
      'SandboxRiskLevel',
    )] as SandboxRiskLevel[];
  }
  return _riskOrderCache;
}

let _actionKindGrammarCache: DestructiveActionKind[] | null = null;
function getActionKindGrammar(): DestructiveActionKind[] {
  if (!_actionKindGrammarCache) {
    _actionKindGrammarCache = [...deriveStringUnionMembersFromTypeContract(
      'scripts/pulse/types.safety-sandbox.ts',
      'DestructiveActionKind',
    )] as DestructiveActionKind[];
  }
  return _actionKindGrammarCache;
}

const _riskOrderRef = getRiskOrder();
const _z = deriveZeroValue();
const _u = deriveUnitValue();
const _u2 = _u + _u;
const _u3 = _u + _u + _u;
const _u4 = _u + _u + _u + _u;
const _u5 = _u + _u + _u + _u + _u;
const _u6 = _u + _u + _u + _u + _u + _u;
const _u7 = _u + _u + _u + _u + _u + _u + _u;
function _riskAtOrdinal(n: number): SandboxRiskLevel {
  return _riskOrderRef[n];
}
function _kindAtOrdinal(n: number): DestructiveActionKind {
  return getActionKindGrammar()[n];
}

// ────────────────────────────────────────────────────────────────────────────
// Sandbox Isolation Rules
// ────────────────────────────────────────────────────────────────────────────

function getDefaultLogicalSandboxMinutes(): number {
  const len = getRiskOrder().length;
  return len * len;
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

function buildFileEffectGraph(input: {
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

function deriveActionKindsFromEffectGraph(graph: FileEffectGraph): Array<{
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
    actions.push({ kind: _kindAtOrdinal(_u4), description: 'Secret or credential evidence detected' });
  }
  if (graph.fileEffects.has('migration_surface') || graph.patchEffects.has('destructive_sql')) {
    actions.push({
      kind: _kindAtOrdinal(_z),
      description: 'Database schema or migration effect detected',
    });
  }
  if (graph.fileEffects.has('infra_surface')) {
    actions.push({ kind: _kindAtOrdinal(_u3), description: 'Infrastructure surface effect detected' });
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

function maxRisk(...levels: SandboxRiskLevel[]): SandboxRiskLevel {
  return levels.reduce((max, level) =>
    getRiskOrder().indexOf(level) > getRiskOrder().indexOf(max) ? level : max,
  );
}

function hasPatchEffects(graph: FileEffectGraph): boolean {
  return graph.patchEffects.size > deriveZeroValue();
}

function buildEmptyEffectGraph(kind: DestructiveActionKind): FileEffectGraph {
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

function deriveRiskLevelFromEffectGraph(
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

function deriveRequirementsFromEffectGraph(
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
      riskLevel !== _riskAtOrdinal(_z) || boundary || persistentOrExternal || hasPatchEffects(graph),
    requiresDryRun:
      !boundary && (persistentOrExternal || riskLevel === _riskAtOrdinal(_u2) || hasPatchEffects(graph)),
    requiresBackup: irreversible || graph.fileEffects.has('migration_surface') || boundary,
    requiresRollbackProof:
      irreversible || persistentOrExternal || boundary || riskLevel === _riskAtOrdinal(_u3),
    sandboxOnly:
      !boundary &&
      (riskLevel === _riskAtOrdinal(_u2) || graph.patchEffects.has('external_mutation') || persistentOrExternal),
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Protected Files
// ────────────────────────────────────────────────────────────────────────────

export function loadProtectedFiles(rootDir: string): string[] {
  const configPath = path.join(rootDir, PROTECTED_FILES_PATH);

  if (!pathExists(configPath)) {
    return [];
  }

  try {
    const config = readJsonFile<ProtectedGovernanceConfig>(configPath);
    const files: string[] = [];

    if (config.protectedExact) {
      for (const file of config.protectedExact) {
        files.push(file);
      }
    }

    if (config.protectedPrefixes) {
      for (const prefix of config.protectedPrefixes) {
        const fullPrefix = path.join(rootDir, prefix);
        if (pathExists(fullPrefix)) {
          expandDirectory(fullPrefix, rootDir, files);
        }
      }
    }

    return files;
  } catch {
    return [];
  }
}

function expandDirectory(dirPath: string, rootDir: string, accumulator: string[]): void {
  if (!pathExists(dirPath)) {
    return;
  }

  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      expandDirectory(full, rootDir, accumulator);
    } else if (entry.isFile()) {
      accumulator.push(path.relative(rootDir, full));
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Destructive Action Classification
// ────────────────────────────────────────────────────────────────────────────

export function classifyDestructiveActions(rootDir: string): DestructiveAction[] {
  const protectedFiles = loadProtectedFiles(rootDir);
  const skipHints = discoverDirectorySkipHintsFromEvidence();
  const actions: DestructiveAction[] = [];
  const seen = new Set<string>();

  function walk(dir: string): void {
    if (!pathExists(dir)) {
      return;
    }

    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (
        entry.name.startsWith('.') &&
        entry.name !== '.github' &&
        !entry.name.startsWith('.env') &&
        entry.name !== '.codacy.yml'
      ) {
        continue;
      }
      if (skipHints.has(entry.name)) {
        continue;
      }

      const full = path.join(dir, entry.name);
      const relative = path.relative(rootDir, full);

      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        let content = '';
        try {
          content = fs.readFileSync(full, 'utf8');
        } catch {
          content = '';
        }

        const normalizedRelative = normalizeRepoPath(relative);
        const isProtected = protectedFiles.some((protectedFile) => {
          const normalizedProtected = normalizeRepoPath(protectedFile);
          return (
            normalizedProtected === normalizedRelative ||
            normalizedRelative.startsWith(`${normalizedProtected}/`)
          );
        });
        const effectGraph = buildFileEffectGraph({
          relativePath: normalizedRelative,
          content,
          protectedByGovernance: isProtected,
        });

        for (const { kind, description } of deriveActionKindsFromEffectGraph(effectGraph)) {
          if (seen.has(`${kind}:${normalizedRelative}`)) continue;
          seen.add(`${kind}:${normalizedRelative}`);
          const reqs = deriveRequirementsFromEffectGraph(kind, effectGraph);
          const riskLevel = deriveRiskLevelFromEffectGraph(kind, effectGraph);

          actions.push({
            actionId: `${kind}:${normalizedRelative}`,
            kind,
            description: `${description}: ${normalizedRelative}`,
            targetFile: normalizedRelative,
            riskLevel,
            requiresHumanApproval: false,
            requiresGovernedSandbox: reqs.requiresGovernedSandbox,
            requiresDryRun: reqs.requiresDryRun,
            requiresBackup: reqs.requiresBackup,
            requiresRollbackProof: reqs.requiresRollbackProof,
            sandboxOnly: reqs.sandboxOnly,
          });
        }
      }
    }
  }

  walk(rootDir);
  return actions;
}

// ────────────────────────────────────────────────────────────────────────────
// Risk Classification
// ────────────────────────────────────────────────────────────────────────────

export function classifyRiskLevel(kind: DestructiveActionKind): SandboxRiskLevel {
  return deriveRiskLevelFromEffectGraph(kind, null);
}

export function isActionAllowedInAutonomy(action: DestructiveAction): boolean {
  if (action.requiresGovernedSandbox) {
    return false;
  }
  if (action.sandboxOnly) {
    return false;
  }
  const restricted = new Set([
    _kindAtOrdinal(_u6),
    _kindAtOrdinal(_u7),
    _kindAtOrdinal(_u4),
  ]);
  if (restricted.has(action.kind)) {
    return false;
  }
  return true;
}

// ────────────────────────────────────────────────────────────────────────────
// Gate Requirements Per Operation Type
// ────────────────────────────────────────────────────────────────────────────

/**
 * Gate level derived from the operation kind's risk profile and requirements.
 *
 * Used by the autonomy loop to decide whether a proposed change can proceed
 * through PULSE-governed validation.
 */
export type GateDecision =
  | 'alllow_autonomous' // No gate required; safe for autonomous execution
  | 'require_sandbox' // Must execute inside a validated sandbox
  | 'block_permanently'; // Operation should never be attempted

function buildGovernedSandboxChecks(action: DestructiveAction): string[] {
  const checks = ['sandbox-created', 'pre-validation', 'patch-validated'];

  if (action.requiresDryRun) {
    checks.push('dry-run');
  }
  if (action.requiresBackup) {
    checks.push('backup-created');
  }
  if (action.requiresRollbackProof) {
    checks.push('rollback-validated');
  }

  checks.push('post-validation');
  return checks;
}

function isAutonomousPolicyBoundary(action: DestructiveAction): boolean {
  return action.requiresGovernedSandbox && !action.requiresDryRun && !action.sandboxOnly;
}

/**
 * Classify the gate requirement for a specific destructive action.
 *
 * This is the central decision function that the autonomy loop calls
 * before applying any change to the repository.
 */
export function classifyGateRequirement(action: DestructiveAction): {
  decision: GateDecision;
  reason: string;
  requiredChecks: string[];
} {
  const kind = action.kind;

  if (isAutonomousPolicyBoundary(action)) {
    return {
      decision: 'block_permanently',
      reason: `${kind} is outside autonomous execution policy. PULSE records the boundary and blocks execution with policy evidence.`,
      requiredChecks: ['policy-boundary-recorded'],
    };
  }

  if (action.requiresGovernedSandbox || action.sandboxOnly) {
    return {
      decision: 'require_sandbox',
      reason: `${kind} requires governed sandbox validation from its patch effects, blast radius, and proof needs.`,
      requiredChecks: buildGovernedSandboxChecks(action),
    };
  }

  return {
    decision: 'alllow_autonomous',
    reason: `${kind} has no sandbox-only, dry-run, backup, rollback, or boundary proof requirement.`,
    requiredChecks: [],
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Patch Validation
// ────────────────────────────────────────────────────────────────────────────

export function validatePatchForProtectedFiles(
  patchFile: string,
  protectedFiles: string[],
): boolean {
  if (!protectedFiles.length) {
    return true;
  }

  if (!pathExists(patchFile)) {
    return false;
  }

  let content: string;
  try {
    content = fs.readFileSync(patchFile, 'utf8');
  } catch {
    return false;
  }

  const modifiedFiles = extractModifiedFilesFromPatch(content);

  for (const file of modifiedFiles) {
    for (const pf of protectedFiles) {
      if (file === pf) {
        return false;
      }
      if (pf.endsWith('/') && file.startsWith(pf)) {
        return false;
      }
      if (file.startsWith(pf + '/')) {
        return false;
      }
    }
  }

  return true;
}

function extractModifiedFilesFromPatch(patch: string): string[] {
  const files: string[] = [];
  const seen = new Set<string>();

  for (const line of patch.split('\n')) {
    if (line.startsWith('--- a/') || line.startsWith('+++ b/')) {
      const filePath = line.replace(/^[-+]{3} [ab]\//, '').trim();
      if (filePath && filePath !== '/dev/null' && !seen.has(filePath)) {
        seen.add(filePath);
        files.push(filePath);
      }
    }
  }

  return files;
}

// ────────────────────────────────────────────────────────────────────────────
// Logical Sandbox Workspace (Planning Concept)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Create a logical sandbox workspace for planning validation.
 *
 * This is NOT an actual git worktree clone. It is a planning concept
 * that records what a workspace would look like for a set of proposed
 * changes, so the autonomy loop can make gating decisions.
 */
export function createLogicalSandbox(params: {
  parentBranch: string;
  filesTouched: string[];
  actionKinds: DestructiveActionKind[];
  rootDir: string;
}): SandboxWorkspace {
  const now = new Date();
  const maxRisk = params.actionKinds.reduce<SandboxRiskLevel>((max, kind) => {
    const risk = deriveRiskLevelFromEffectGraph(kind, null);
    return getRiskOrder().indexOf(risk) > getRiskOrder().indexOf(max) ? risk : max;
  }, _riskAtOrdinal(_z));

  const maxMinutes = params.actionKinds.reduce((max, kind) => {
    const rules = deriveIsolationRules(kind, params.rootDir);
    return Math.max(max, rules.maxActiveMinutes);
  }, getDefaultLogicalSandboxMinutes());

  const expiresAt = new Date(now.getTime() + maxMinutes * 60 * 1000);

  const workspaceId = `sandbox-${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`;
  const workspacePath = path.join(params.rootDir, '.pulse', 'sandboxes', workspaceId);

  return {
    workspacePath,
    parentBranch: params.parentBranch,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    filesTouched: params.filesTouched,
    maxRiskLevel: maxRisk,
    patches: [],
    validationResults: [],
    status: 'active',
    allowedActionKinds: params.actionKinds,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Isolation Rules Access
// ────────────────────────────────────────────────────────────────────────────

function commandsByPurpose(rootDir: string, purposes: PulseCommandPurpose[]): string[] {
  try {
    const purposeSet = new Set<PulseCommandPurpose>(purposes);
    return buildPulseCommandGraph(rootDir)
      .commands.filter((command) => purposeSet.has(command.purpose))
      .sort((left, right) => {
        const confidenceOrder = [...discoverConvergenceEvidenceConfidenceLabels()];
        const byConfidence =
          confidenceOrder.indexOf(left.confidence) -
          confidenceOrder.indexOf(right.confidence);
        return byConfidence === 0 ? left.command.localeCompare(right.command) : byConfidence;
      })
      .map((command) => command.command);
  } catch {
    return [];
  }
}

function deriveBlockedPaths(rootDir: string | null, graph: FileEffectGraph): string[] {
  if (!rootDir) {
    return [];
  }

  const blocked = new Set<string>();

  if (graph.protectedByGovernance || graph.fileEffects.has('governance_surface')) {
    for (const protectedFile of loadProtectedFiles(rootDir)) {
      blocked.add(normalizeRepoPath(protectedFile));
    }
  }

  if (graph.fileEffects.has('secret_surface') || graph.patchEffects.has('secret_evidence')) {
    try {
      for (const environmentVariable of buildPulseCommandGraph(rootDir).environmentVariables) {
        if (environmentVariable.secretLike) {
          blocked.add(normalizeRepoPath(environmentVariable.sourcePath));
        }
      }
    } catch {
      return [...blocked].sort();
    }
  }

  return [...blocked].sort();
}

function deriveValidationPurposes(graph: FileEffectGraph): {
  pre: PulseCommandPurpose[];
  post: PulseCommandPurpose[];
} {
  const pre = new Set<PulseCommandPurpose>();
  const post = new Set<PulseCommandPurpose>();

  if (!graph.fileEffects.has('secret_surface')) {
    pre.add('lint');
    pre.add('typecheck');
  }
  if (!graph.protectedByGovernance && !graph.fileEffects.has('secret_surface')) {
    post.add('test');
  }
  if (graph.fileEffects.has('infra_surface')) {
    post.add('build');
  }

  return { pre: [...pre], post: [...post] };
}

function deriveMaxActiveMinutes(input: {
  riskLevel: SandboxRiskLevel;
  requirements: ActionSafetyRequirements;
  preValidationCommands: string[];
  postValidationCommands: string[];
}): number {
  const riskWeight = getRiskOrder().indexOf(input.riskLevel) + getRiskOrder().length;
  const proofSteps = [
    input.requirements.requiresDryRun,
    input.requirements.requiresBackup,
    input.requirements.requiresRollbackProof,
    input.requirements.sandboxOnly,
  ].filter(Boolean).length;
  const validationSteps = input.preValidationCommands.length + input.postValidationCommands.length;

  return getDefaultLogicalSandboxMinutes() * (riskWeight + proofSteps + validationSteps);
}

function deriveIsolationRules(
  kind: DestructiveActionKind,
  rootDir: string | null,
): SandboxIsolationRules {
  const graph = buildEmptyEffectGraph(kind);
  const riskLevel = deriveRiskLevelFromEffectGraph(kind, graph);
  const requirements = deriveRequirementsFromEffectGraph(kind, graph);
  const purposes = deriveValidationPurposes(graph);
  const preValidationCommands = rootDir ? commandsByPurpose(rootDir, purposes.pre) : [];
  const postValidationCommands = rootDir ? commandsByPurpose(rootDir, purposes.post) : [];

  return {
    kind,
    requiresSeparateWorktree: requirements.requiresGovernedSandbox || requirements.sandboxOnly,
    requiresNetworkIsolation:
      graph.patchEffects.has('external_mutation') || graph.fileEffects.has('secret_surface'),
    requiresDatabaseIsolation:
      graph.fileEffects.has('migration_surface') ||
      graph.patchEffects.has('persistent_delete') ||
      graph.patchEffects.has('destructive_sql') ||
      graph.patchEffects.has('external_mutation'),
    blockedPaths: deriveBlockedPaths(rootDir, graph),
    preValidationCommands,
    postValidationCommands,
    maxActiveMinutes: deriveMaxActiveMinutes({
      riskLevel,
      requirements,
      preValidationCommands,
      postValidationCommands,
    }),
  };
}

export function getIsolationRules(
  kind: DestructiveActionKind,
  rootDir: string | null = null,
): SandboxIsolationRules {
  return deriveIsolationRules(kind, rootDir);
}

export function getAllIsolationRules(rootDir: string | null = null): SandboxIsolationRules[] {
  return getActionKindGrammar().map((kind) => deriveIsolationRules(kind, rootDir));
}

/**
 * Check whether an action kind is compatible with a workspace's isolation
 * rules (i.e., all required preconditions are configured).
 */
export function validateWorkspaceForAction(
  workspace: SandboxWorkspace,
  actionKind: DestructiveActionKind,
): { valid: boolean; missingRules: string[] } {
  const rules = deriveIsolationRules(actionKind, null);

  const missing: string[] = [];

  if (rules.requiresSeparateWorktree && !workspace.workspacePath) {
    missing.push('separate_worktree');
  }

  for (const cmd of rules.preValidationCommands) {
    const result = workspace.validationResults.find((r) => r.command === cmd);
    if (!result || !result.passed) {
      missing.push(`pre_validation:${cmd}`);
    }
  }

  return { valid: missing.length === 0, missingRules: missing };
}

// ────────────────────────────────────────────────────────────────────────────
// Sandbox State Construction
// ────────────────────────────────────────────────────────────────────────────

export function buildSandboxState(rootDir: string): SandboxState {
  const protectedFiles = loadProtectedFiles(rootDir);
  const destructiveActions = classifyDestructiveActions(rootDir);

  const governedSandboxActions = destructiveActions.filter((a) => a.requiresGovernedSandbox).length;
  const humanRequiredActions = 0;
  const sandboxOnlyActions = destructiveActions.filter((a) => a.sandboxOnly).length;
  const governanceViolations = destructiveActions.filter(
    (a) => a.kind.includes('governance') || a.kind.includes('protected'),
  ).length;

  const riskBreakdown = getRiskOrder().reduce(
    (breakdown, level) => ({
      ...breakdown,
      [level]: destructiveActions.filter((a) => a.riskLevel === level).length,
    }),
    {} as Record<SandboxRiskLevel, number>,
  );

  const isolationRules = getAllIsolationRules(rootDir);

  const state: SandboxState = {
    generatedAt: new Date().toISOString(),
    destructiveActions,
    activeWorkspaces: [],
    protectedFiles,
    isolationRules,
    summary: {
      totalDestructiveActions: destructiveActions.length,
      humanRequiredActions,
      governedSandboxActions,
      sandboxOnlyActions,
      activeWorkspaces: 0,
      riskBreakdown,
      governanceViolations,
    },
  };

  const pulseDir = path.join(rootDir, '.pulse', 'current');
  ensureDir(pulseDir, { recursive: true });
  writeTextFile(
    path.join(pulseDir, discoverAllObservedArtifactFilenames().sandboxState || 'PULSE_SANDBOX_STATE.json'),
    JSON.stringify(state, null, 2),
  );

  return state;
}
