import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import { compact } from '../../artifacts.io';
import { pathExists } from '../../safe-fs';
import { safeJoin } from '../../safe-path';
import { currentCommit, fileMtimeIso, readJsonRecord } from './utils';

type SnapshotStatus = 'ready' | 'missing' | 'stale' | 'invalid';
type GitNexusSourceMode = 'local_files' | 'cli' | 'missing';

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
