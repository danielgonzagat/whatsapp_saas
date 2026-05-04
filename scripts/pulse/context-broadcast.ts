import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { buildDecisionQueue, type QueueUnit } from './artifacts.queue';
import { compact } from './artifacts.io';
import { pathExists, readDir, readTextFile } from './safe-fs';
import { safeJoin } from './safe-path';
import type { PulseArtifactRegistry } from './artifact-registry';
import type { PulseConvergencePlan } from './types';
import {
  discoverAllObservedArtifactFilenames,
  discoverConvergenceExecutionModeLabels,
  deriveUnitValue,
  deriveZeroValue,
  discoverRouteSeparatorFromRuntime,
} from './dynamic-reality-kernel';

type SnapshotStatus = 'ready' | 'missing' | 'stale' | 'invalid';
type LeaseStatus = 'active' | 'expired' | 'released' | 'conflicted';
type GitNexusSourceMode = 'local_files' | 'cli' | 'missing';

let _artifactFilenames: ReturnType<typeof discoverAllObservedArtifactFilenames> | null = null;
function artifactFilenames() {
  if (!_artifactFilenames) _artifactFilenames = discoverAllObservedArtifactFilenames();
  return _artifactFilenames;
}

function isAiSafeExecutionMode(mode: string): boolean {
  return discoverConvergenceExecutionModeLabels().has(mode) && mode === 'ai_safe';
}

interface ProtectedGovernanceConfig {
  protectedExact: string[];
  protectedPrefixes: string[];
}

interface PulseContextSnapshot {
  provider: 'gitnexus' | 'beads';
  status: SnapshotStatus;
  generatedAt: string;
  ref: string;
  currentCommit: string | null;
  sourceMode: GitNexusSourceMode;
  summary: string;
  warnings: string[];
  errors: string[];
  metadata: Record<string, string | number | boolean | null>;
}

export interface WorkerContextEnvelope {
  workerId: string;
  workstreamId: string;
  unitId: string;
  leaseId: string;
  leaseStatus: LeaseStatus;
  leaseExpiresAt: string;
  contextDigest: string;
  ownedFiles: string[];
  readOnlyFiles: string[];
  forbiddenFiles: string[];
  affectedCapabilities: string[];
  affectedFlows: string[];
  gitnexusDelta: PulseContextSnapshot;
  beadsDelta: PulseContextSnapshot;
  validationContract: string[];
  stopConditions: string[];
}

export interface PulseWorkerLease {
  leaseId: string;
  workerId: string;
  unitId: string;
  ownedFiles: string[];
  readOnlyFiles: string[];
  forbiddenFiles: string[];
  expiresAt: string;
  status: LeaseStatus;
  conflictReasons: string[];
}

export interface PulseContextBroadcast {
  generatedAt: string;
  runId: string;
  contextDigest: string;
  gitnexusRef: string;
  beadsRef: string;
  directiveRef: string;
  certificateRef: string;
  workers: WorkerContextEnvelope[];
}

export interface PulseContextDelta {
  generatedAt: string;
  runId: string;
  contextDigest: string;
  previousDigest: string | null;
  changed: boolean;
  staleContextBlocksExecution: boolean;
  blockers: string[];
}

export interface PulseContextFabricBundle {
  gitnexusState: PulseContextSnapshot;
  beadsState: PulseContextSnapshot;
  broadcast: PulseContextBroadcast;
  leases: {
    generatedAt: string;
    runId: string;
    contextDigest: string;
    ttlMinutes: number;
    leases: PulseWorkerLease[];
    ownershipConflictPass: boolean;
    protectedFilesForbiddenPass: boolean;
  };
  delta: PulseContextDelta;
}

const CONTEXT_TTL_MINUTES = 30;
const DEFAULT_WORKER_COUNT = 10;

function normalizeRepoPath(filePath: string): string {
  const sep = discoverRouteSeparatorFromRuntime();
  return filePath.replace(/\\/g, sep).replace(/^\.\//, '');
}

function normalizeLeasePath(rootDir: string, filePath: string): string | null {
  const trimmed = filePath.trim().replace(/\s+\(\d+\)$/, '');
  if (!trimmed || trimmed === '.' || trimmed === '..') {
    return null;
  }
  const slashNormalized = normalizeRepoPath(trimmed);
  const relativePath = path.isAbsolute(slashNormalized)
    ? path.relative(rootDir, slashNormalized)
    : slashNormalized;
  const normalized = normalizeRepoPath(relativePath);
  if (
    !normalized ||
    normalized === '.' ||
    normalized === '..' ||
    normalized.startsWith('..' + discoverRouteSeparatorFromRuntime()) ||
    path.isAbsolute(normalized) ||
    normalized.split(discoverRouteSeparatorFromRuntime()).includes('..') ||
    /\s+\(\d+\)$/.test(normalized)
  ) {
    return null;
  }
  return normalized;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean).map(normalizeRepoPath))].sort();
}

function uniqueLeasePaths(rootDir: string, values: string[]): string[] {
  return [
    ...new Set(
      values.map((value) => normalizeLeasePath(rootDir, value)).filter(Boolean) as string[],
    ),
  ].sort();
}

function readProtectedGovernanceConfig(rootDir: string): ProtectedGovernanceConfig {
  const fallback: ProtectedGovernanceConfig = {
    protectedExact: ['AGENTS.md', 'CLAUDE.md', 'CODEX.md', 'package.json', '.codacy.yml'],
    protectedPrefixes: [
      'ops/',
      'scripts/ops/',
      '.github/workflows/',
      'docs/codacy/',
      'docs/design/',
    ],
  };
  const configPath = safeJoin(rootDir, 'ops', 'protected-governance-files.json');
  if (!pathExists(configPath)) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(
      readTextFile(configPath, 'utf8'),
    ) as Partial<ProtectedGovernanceConfig>;
    return {
      protectedExact: Array.isArray(parsed.protectedExact)
        ? parsed.protectedExact.map(String)
        : fallback.protectedExact,
      protectedPrefixes: Array.isArray(parsed.protectedPrefixes)
        ? parsed.protectedPrefixes.map(String)
        : fallback.protectedPrefixes,
    };
  } catch {
    return fallback;
  }
}

function isProtectedFile(filePath: string, config: ProtectedGovernanceConfig): boolean {
  const normalized = normalizeRepoPath(filePath);
  return (
    config.protectedExact.includes(normalized) ||
    config.protectedPrefixes.some((prefix) => normalized.startsWith(normalizeRepoPath(prefix)))
  );
}

function protectedForbiddenFiles(config: ProtectedGovernanceConfig): string[] {
  return uniqueStrings([...config.protectedExact, ...config.protectedPrefixes]);
}

function currentCommit(rootDir: string): string | null {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 3_000,
    }).trim();
  } catch {
    return null;
  }
}

function readJsonRecord(filePath: string): Record<string, unknown> | null {
  if (!pathExists(filePath)) {
    return null;
  }
  try {
    const parsed = JSON.parse(readTextFile(filePath, 'utf8')) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function sha256(value: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function fileMtimeIso(filePath: string): string | null {
  try {
    return fs.statSync(filePath).mtime.toISOString();
  } catch {
    return null;
  }
}

interface GitNexusLocalSnapshot {
  status: SnapshotStatus;
  ref: string;
  sourceMode: GitNexusSourceMode;
  summary: string;
  warnings: string[];
  metadata: Record<string, string | number | boolean | null>;
}

function buildGitNexusLocalSnapshot(input: {
  rootDir: string;
  commit: string | null;
  indexPath: string;
  statusPath: string;
  metaPath: string;
}): GitNexusLocalSnapshot {
  const metadata: Record<string, string | number | boolean | null> = {
    indexExists: pathExists(input.indexPath),
    statusPath: path.relative(input.rootDir, input.statusPath),
    metaPath: path.relative(input.rootDir, input.metaPath),
  };
  const warnings: string[] = [];
  let status: SnapshotStatus = 'missing';
  let ref = 'gitnexus:missing';
  let sourceMode: GitNexusSourceMode = 'missing';
  let summary = 'GitNexus local index is missing.';

  if (!pathExists(input.indexPath)) {
    warnings.push('Missing .gitnexus local index.');
    return { status, ref, sourceMode, summary, warnings, metadata };
  }

  const statusJson = readJsonRecord(input.statusPath) || readJsonRecord(input.metaPath);
  const lastIndexedCommit =
    typeof statusJson?.commit === 'string'
      ? statusJson.commit
      : typeof statusJson?.lastCommit === 'string'
        ? statusJson.lastCommit
        : null;
  const lastIndexedAt =
    typeof statusJson?.indexedAt === 'string'
      ? statusJson.indexedAt
      : typeof statusJson?.lastIndexedAt === 'string'
        ? statusJson.lastIndexedAt
        : fileMtimeIso(input.indexPath);

  metadata.lastIndexedCommit = lastIndexedCommit;
  metadata.lastIndexedAt = lastIndexedAt;
  status =
    lastIndexedCommit && input.commit && lastIndexedCommit === input.commit ? 'ready' : 'stale';
  ref = `gitnexus:${lastIndexedCommit ?? 'unknown'}:${lastIndexedAt ?? 'unknown'}`;
  sourceMode = 'local_files';
  summary =
    status === 'ready'
      ? `GitNexus local index matches HEAD ${input.commit?.slice(0, 8) ?? 'unknown'}.`
      : 'GitNexus local index exists but does not prove freshness for current HEAD.';
  if (status === 'stale') {
    warnings.push(summary);
  }

  return { status, ref, sourceMode, summary, warnings, metadata };
}

function gitNexusAutoReindexEnabled(): boolean {
  return process.env.PULSE_GITNEXUS_AUTO_REINDEX !== '0';
}

function attemptGitNexusReindex(input: {
  rootDir: string;
  cliAvailable: boolean;
  status: SnapshotStatus;
}): {
  attempted: boolean;
  eligible: boolean;
  command: string | null;
  exitCode: number | null;
  durationMs: number | null;
  stderr: string | null;
  skippedReason: string | null;
} {
  const eligible = input.cliAvailable && (input.status === 'missing' || input.status === 'stale');
  const command = 'npx -y gitnexus@latest analyze . --skip-agents-md';
  if (!eligible) {
    return {
      attempted: false,
      eligible,
      command,
      exitCode: null,
      durationMs: null,
      stderr: null,
      skippedReason: input.cliAvailable
        ? 'gitnexus index already fresh.'
        : 'gitnexus CLI unavailable.',
    };
  }
  if (!gitNexusAutoReindexEnabled()) {
    return {
      attempted: false,
      eligible,
      command,
      exitCode: null,
      durationMs: null,
      stderr: null,
      skippedReason: 'PULSE_GITNEXUS_AUTO_REINDEX=0.',
    };
  }

  const start = Date.now();
  const result = spawnSync('npx', ['-y', 'gitnexus@latest', 'analyze', '.', '--skip-agents-md'], {
    cwd: input.rootDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 600_000,
  });
  return {
    attempted: true,
    eligible,
    command,
    exitCode: result.status,
    durationMs: Date.now() - start,
    stderr: result.stderr ? compact(result.stderr, 240) : null,
    skippedReason: null,
  };
}

export function buildGitNexusSnapshot(rootDir: string, generatedAt: string): PulseContextSnapshot {
  const commit = currentCommit(rootDir);
  const indexPath = safeJoin(rootDir, '.gitnexus');
  const statusPath = safeJoin(indexPath, 'status.json');
  const metaPath = safeJoin(indexPath, 'meta.json');
  const cliWarnings: string[] = [];
  const errors: string[] = [];

  const cli = spawnSync('npx', ['-y', 'gitnexus@latest', '--version'], {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 15_000,
  });
  let snapshot = buildGitNexusLocalSnapshot({
    rootDir,
    commit,
    indexPath,
    statusPath,
    metaPath,
  });
  let metadata = snapshot.metadata;
  metadata.cliAvailable = cli.status === 0;
  if (cli.status !== 0) {
    cliWarnings.push('GitNexus CLI version probe did not succeed.');
    if (cli.stderr) {
      errors.push(compact(cli.stderr, 240));
    }
  }

  const reindex = attemptGitNexusReindex({
    rootDir,
    cliAvailable: cli.status === 0,
    status: snapshot.status,
  });
  metadata.reindexEligible = reindex.eligible;
  metadata.reindexAttempted = reindex.attempted;
  metadata.reindexCommand = reindex.command;
  metadata.reindexExitCode = reindex.exitCode;
  metadata.reindexDurationMs = reindex.durationMs;
  metadata.reindexSkippedReason = reindex.skippedReason;
  if (reindex.stderr) {
    errors.push(reindex.stderr);
  }

  if (reindex.attempted) {
    const refreshedSnapshot = buildGitNexusLocalSnapshot({
      rootDir,
      commit,
      indexPath,
      statusPath,
      metaPath,
    });
    metadata = {
      ...refreshedSnapshot.metadata,
      cliAvailable: metadata.cliAvailable,
      reindexEligible: metadata.reindexEligible,
      reindexAttempted: metadata.reindexAttempted,
      reindexCommand: metadata.reindexCommand,
      reindexExitCode: metadata.reindexExitCode,
      reindexDurationMs: metadata.reindexDurationMs,
      reindexSkippedReason: metadata.reindexSkippedReason,
      postReindexStatus: refreshedSnapshot.status,
      postReindexRef: refreshedSnapshot.ref,
      postReindexFresh: refreshedSnapshot.status === 'ready',
    };
    snapshot = {
      ...refreshedSnapshot,
      sourceMode: 'cli',
      metadata,
      warnings: refreshedSnapshot.warnings,
    };
  }

  return {
    provider: 'gitnexus',
    status: snapshot.status,
    generatedAt,
    ref: snapshot.ref,
    currentCommit: commit,
    sourceMode: snapshot.sourceMode,
    summary:
      reindex.attempted && snapshot.status === 'ready'
        ? `GitNexus reindex refreshed local index for HEAD ${commit?.slice(0, 8) ?? 'unknown'}.`
        : snapshot.summary,
    warnings: [...cliWarnings, ...snapshot.warnings],
    errors,
    metadata,
  };
}

export function buildBeadsSnapshot(rootDir: string, generatedAt: string): PulseContextSnapshot {
  const commit = currentCommit(rootDir);
  const beadsDir = safeJoin(rootDir, '.beads');
  const issuesPath = safeJoin(beadsDir, 'issues.jsonl');
  const interactionsPath = safeJoin(beadsDir, 'interactions.jsonl');
  const warnings: string[] = [];
  const errors: string[] = [];
  const metadata: Record<string, string | number | boolean | null> = {
    beadsDirExists: pathExists(beadsDir),
    issuesPath: path.relative(rootDir, issuesPath),
  };

  if (!pathExists(beadsDir) || !pathExists(issuesPath)) {
    warnings.push('beads local state is missing.');
    return {
      provider: 'beads',
      status: 'missing',
      generatedAt,
      ref: 'beads:missing',
      currentCommit: commit,
      sourceMode: 'missing',
      summary: 'beads local state is missing.',
      warnings,
      errors,
      metadata,
    };
  }

  const issuesText = readTextFile(issuesPath, 'utf8');
  const issueLines = issuesText.split('\n').filter((line) => line.trim().length > deriveZeroValue());
  const interactions = pathExists(interactionsPath)
    ? readTextFile(interactionsPath, 'utf8')
        .split('\n')
        .filter((line) => line.trim().length > deriveZeroValue())
    : [];
  const touchedAt =
    fileMtimeIso(safeJoin(beadsDir, 'last-touched')) || fileMtimeIso(issuesPath) || generatedAt;
  metadata.issueCount = issueLines.length;
  metadata.interactionCount = interactions.length;
  metadata.touchedAt = touchedAt;

  return {
    provider: 'beads',
    status: 'ready',
    generatedAt,
    ref: `beads:${sha256({ issueLines, touchedAt }).slice(0, 16)}`,
    currentCommit: commit,
    sourceMode: 'local_files',
    summary: `beads local state loaded with ${issueLines.length} issue row(s).`,
    warnings,
    errors,
    metadata,
  };
}

function unitValidationContract(unit: QueueUnit): string[] {
  return uniqueStrings([
    ...unit.validationArtifacts,
    ...unit.exitCriteria,
    ...unit.gateNames.map((gate) => `gate:${gate}`),
  ]);
}

function unitStopConditions(unit: QueueUnit, staleContextBlocksExecution: boolean): string[] {
  return uniqueStrings([
    staleContextBlocksExecution ? 'Context digest changed or snapshot is stale.' : '',
    'Attempted write outside ownedFiles.',
    'Attempted write to forbiddenFiles or governance-protected surface.',
    !isAiSafeExecutionMode(unit.executionMode) ? 'Unit is not ai_safe.' : '',
  ]);
}

function leaseId(runId: string, workerId: string, unitId: string): string {
  return `lease-${sha256({ runId, workerId, unitId }).slice(0, 18)}`;
}

function workerId(index: number): string {
  return `pulse-worker-${String(index + deriveUnitValue()).padStart(2, '0')}`;
}

function workstreamId(unit: QueueUnit): string {
  return `${unit.kind}:${unit.ownerLane}`;
}

function buildContextDigest(input: {
  runId: string;
  gitnexusRef: string;
  beadsRef: string;
  directiveRef: string;
  certificateRef: string;
  unitIds: string[];
  protectedFiles: string[];
}): string {
  return sha256(input);
}

function loadPreviousContextDigest(rootDir: string): string | null {
  const previousPath = safeJoin(rootDir, '.pulse', 'current', artifactFilenames().contextBroadcast);
  const previous = readJsonRecord(previousPath);
  return typeof previous?.contextDigest === 'string' ? previous.contextDigest : null;
}

export function buildPulseContextFabricBundle(input: {
  rootDir: string;
  registry: PulseArtifactRegistry;
  convergencePlan: PulseConvergencePlan;
  runId: string;
  directiveContent: string;
  certificateContent: string;
  workerCount?: number;
}): PulseContextFabricBundle {
  const generatedAt = new Date().toISOString();
  const protectedConfig = readProtectedGovernanceConfig(input.rootDir);
  const forbiddenFiles = protectedForbiddenFiles(protectedConfig);
  const gitnexusState = buildGitNexusSnapshot(input.rootDir, generatedAt);
  const beadsState = buildBeadsSnapshot(input.rootDir, generatedAt);
  const units = buildDecisionQueue(input.convergencePlan)
    .filter((unit) => isAiSafeExecutionMode(unit.executionMode))
    .slice(0, input.workerCount ?? DEFAULT_WORKER_COUNT);
  const af = artifactFilenames();
  const directiveRef = `${af.cliDirective}#${sha256(input.directiveContent).slice(0, 16)}`;
  const certificateRef = `${af.certificate}#${sha256(input.certificateContent).slice(0, 16)}`;
  const staleContextBlocksExecution =
    gitnexusState.status === 'stale' ||
    gitnexusState.status === 'missing' ||
    beadsState.status === 'stale' ||
    beadsState.status === 'missing';
  const contextDigest = buildContextDigest({
    runId: input.runId,
    gitnexusRef: gitnexusState.ref,
    beadsRef: beadsState.ref,
    directiveRef,
    certificateRef,
    unitIds: units.map((unit) => unit.id),
    protectedFiles: forbiddenFiles,
  });
  const expiresAt = new Date(Date.now() + CONTEXT_TTL_MINUTES * 60_000).toISOString();
  const assignedFiles = new Set<string>();
  const mutableOwners = new Map<string, string>();

  const leases: PulseWorkerLease[] = [];
  const workers: WorkerContextEnvelope[] = units.map((unit, index) => {
    const id = workerId(index);
    const normalizedRelatedFiles = uniqueLeasePaths(input.rootDir, unit.relatedFiles);
    const mutableCandidates = normalizedRelatedFiles.filter(
      (filePath) => !isProtectedFile(filePath, protectedConfig),
    );
    const duplicateReadOnly: string[] = [];
    const ownedFiles: string[] = [];

    for (const filePath of mutableCandidates) {
      if (assignedFiles.has(filePath)) {
        duplicateReadOnly.push(filePath);
      } else {
        assignedFiles.add(filePath);
        mutableOwners.set(filePath, id);
        ownedFiles.push(filePath);
      }
    }

    const readOnlyFiles = uniqueStrings([
      ...duplicateReadOnly,
      ...unit.validationArtifacts,
      ...unit.artifactPaths,
      ...normalizedRelatedFiles.filter((filePath) => isProtectedFile(filePath, protectedConfig)),
      af.contextBroadcast,
      af.workerLeases,
      af.gitnexusState,
      af.beadsState,
    ]);
    const conflictReasons =
      duplicateReadOnly.length > deriveZeroValue()
        ? duplicateReadOnly.map(
            (filePath) =>
              `${filePath} already leased to ${mutableOwners.get(filePath) ?? 'another worker'}.`,
          )
        : [];
    const currentLeaseId = leaseId(input.runId, id, unit.id);
    const lease: PulseWorkerLease = {
      leaseId: currentLeaseId,
      workerId: id,
      unitId: unit.id,
      ownedFiles,
      readOnlyFiles,
      forbiddenFiles,
      expiresAt,
      status: 'active',
      conflictReasons,
    };
    leases.push(lease);
    return {
      workerId: id,
      workstreamId: workstreamId(unit),
      unitId: unit.id,
      leaseId: currentLeaseId,
      leaseStatus: lease.status,
      leaseExpiresAt: lease.expiresAt,
      contextDigest,
      ownedFiles,
      readOnlyFiles,
      forbiddenFiles,
      affectedCapabilities: unit.affectedCapabilityIds,
      affectedFlows: unit.affectedFlowIds,
      gitnexusDelta: gitnexusState,
      beadsDelta: beadsState,
      validationContract: unitValidationContract(unit),
      stopConditions: unitStopConditions(unit, staleContextBlocksExecution),
    };
  });

  const previousDigest = loadPreviousContextDigest(input.rootDir);
  const blockers = [
    gitnexusState.status !== 'ready' ? `gitnexus:${gitnexusState.status}` : '',
    beadsState.status !== 'ready' ? `beads:${beadsState.status}` : '',
  ].filter(Boolean);
  return {
    gitnexusState,
    beadsState,
    broadcast: {
      generatedAt,
      runId: input.runId,
      contextDigest,
      gitnexusRef: gitnexusState.ref,
      beadsRef: beadsState.ref,
      directiveRef,
      certificateRef,
      workers,
    },
    leases: {
      generatedAt,
      runId: input.runId,
      contextDigest,
      ttlMinutes: CONTEXT_TTL_MINUTES,
      leases,
      ownershipConflictPass: workers.every((worker) =>
        worker.ownedFiles.every(
          (filePath) =>
            workers.filter((candidate) => candidate.ownedFiles.includes(filePath)).length === deriveUnitValue(),
        ),
      ),
      protectedFilesForbiddenPass:
        workers.every((worker) =>
          forbiddenFiles.every((filePath) => worker.forbiddenFiles.includes(filePath)),
        ) &&
        workers.every((worker) =>
          worker.ownedFiles.every(
            (filePath) =>
              normalizeLeasePath(input.rootDir, filePath) === filePath &&
              !isProtectedFile(filePath, protectedConfig),
          ),
        ),
    },
    delta: {
      generatedAt,
      runId: input.runId,
      contextDigest,
      previousDigest,
      changed: previousDigest !== null && previousDigest !== contextDigest,
      staleContextBlocksExecution,
      blockers,
    },
  };
}

export function buildDirectiveContextFabricPatch(
  bundle: PulseContextFabricBundle,
): Record<string, unknown> {
  return {
    broadcastRef: artifactFilenames().contextBroadcast,
    leasesRef: artifactFilenames().workerLeases,
    gitnexusRef: bundle.broadcast.gitnexusRef,
    beadsRef: bundle.broadcast.beadsRef,
    contextDigest: bundle.broadcast.contextDigest,
    workerEnvelopeCount: bundle.broadcast.workers.length,
    contextBroadcastPass: bundle.broadcast.workers.length >= DEFAULT_WORKER_COUNT,
    ownershipConflictPass: bundle.leases.ownershipConflictPass,
    protectedFilesForbiddenPass: bundle.leases.protectedFilesForbiddenPass,
    workerContextCompletenessPass: bundle.broadcast.workers.every(
      (worker) =>
        worker.leaseId &&
        worker.contextDigest &&
        worker.validationContract.length > deriveZeroValue() &&
        worker.stopConditions.length > deriveZeroValue(),
    ),
    staleContextBlocksExecution: bundle.delta.staleContextBlocksExecution,
    blockers: bundle.delta.blockers,
  };
}
