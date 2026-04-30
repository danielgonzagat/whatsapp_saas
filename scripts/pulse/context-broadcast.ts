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

type SnapshotStatus = 'ready' | 'missing' | 'stale' | 'invalid';
type LeaseStatus = 'active' | 'expired' | 'released' | 'conflicted';
type GitNexusSourceMode = 'local_files' | 'cli' | 'missing';

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
  return filePath.replace(/\\/g, '/').replace(/^\.\//, '');
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
    normalized.startsWith('../') ||
    path.isAbsolute(normalized) ||
    normalized.split('/').includes('..') ||
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
