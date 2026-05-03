import * as path from 'node:path';
import { pathExists, readTextFile } from '../../safe-fs';
import { safeJoin } from '../../safe-path';
import { currentCommit, sha256, fileMtimeIso } from './utils';

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
  const issueLines = issuesText.split('\n').filter((line) => line.trim().length > 0);
  const interactions = pathExists(interactionsPath)
    ? readTextFile(interactionsPath, 'utf8')
        .split('\n')
        .filter((line) => line.trim().length > 0)
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
