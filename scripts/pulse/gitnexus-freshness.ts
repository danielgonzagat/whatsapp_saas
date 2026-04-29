// PULSE — Live Codebase Nervous System
// GitNexus Freshness Engine (Wave 9)

import { execSync } from 'child_process';
import * as path from 'path';

import { ensureDir, pathExists, readJsonFile, readTextFile, writeTextFile } from './safe-fs';
import type { GitNexusFreshness } from './types.gitnexus-freshness';

const ARTIFACT_FILE_NAME = 'PULSE_GITNEXUS_FRESHNESS.json';
const GITNEXUS_INDEX_DIR = '.gitnexus';
const GITNEXUS_STATE_FILE = 'PULSE_GITNEXUS_EVIDENCE.json';

interface GitNexusEvidenceState {
  status?: {
    lastIndexedCommit?: string | null;
    indexState?: string;
  };
}

/**
 * Count the number of files in a directory recursively (sync).
 * Skips dot-directories and common non-indexable paths.
 */
function countFilesRecursive(dirPath: string): number {
  if (!pathExists(dirPath)) {
    return 0;
  }

  let count = 0;
  const fs = require('fs');
  const entries = fs.readdirSync(dirPath, { withFileTypes: true }) as Array<{
    name: string;
    isDirectory(): boolean;
    isFile(): boolean;
  }>;

  for (const entry of entries) {
    if (entry.name.startsWith('.') && entry.name !== '.gitnexus') {
      continue;
    }
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.next') {
      continue;
    }
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      count += countFilesRecursive(full);
    } else if (entry.isFile()) {
      count++;
    }
  }

  return count;
}

/**
 * Estimate the total number of indexable source files in the repository.
 * Indexable files are those with extensions typically indexed by code graph tools.
 */
function estimateIndexableFiles(rootDir: string): number {
  const extensions = new Set([
    '.ts',
    '.tsx',
    '.js',
    '.jsx',
    '.mjs',
    '.cjs',
    '.prisma',
    '.json',
    '.yml',
    '.yaml',
    '.md',
  ]);

  let count = 0;
  const fs = require('fs');

  function walk(dir: string): void {
    if (!pathExists(dir)) {
      return;
    }
    const entries = fs.readdirSync(dir, { withFileTypes: true }) as Array<{
      name: string;
      isDirectory(): boolean;
      isFile(): boolean;
    }>;

    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.name !== '.gitnexus') {
        continue;
      }
      if (
        entry.name === 'node_modules' ||
        entry.name === 'dist' ||
        entry.name === '.next' ||
        entry.name === 'coverage'
      ) {
        continue;
      }

      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        if (extensions.has(ext)) {
          count++;
        }
      }
    }
  }

  walk(rootDir);
  return count;
}

/**
 * Count how many commits the index is behind the current HEAD.
 * Returns -1 if the count cannot be determined.
 */
function countCommitsBehind(rootDir: string, lastIndexedCommit: string | null): number {
  if (!lastIndexedCommit) {
    return -1;
  }

  try {
    const revList = execSync(`git rev-list --count HEAD ^${lastIndexedCommit}`, {
      cwd: rootDir,
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
    }).trim();
    return parseInt(revList, 10);
  } catch {
    return -1;
  }
}

/**
 * Get the current HEAD commit hash.
 */
function getCurrentCommit(rootDir: string): string {
  try {
    return execSync('git rev-parse HEAD', {
      cwd: rootDir,
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
    }).trim();
  } catch {
    return '';
  }
}

/**
 * Read the last indexed commit from the GitNexus evidence state file.
 */
function getLastIndexedCommit(rootDir: string): string | null {
  const evidencePath = path.join(rootDir, '.pulse', 'current', GITNEXUS_STATE_FILE);

  if (!pathExists(evidencePath)) {
    return null;
  }

  try {
    const evidence = readJsonFile<GitNexusEvidenceState>(evidencePath);
    return evidence?.status?.lastIndexedCommit ?? null;
  } catch {
    return null;
  }
}

/**
 * Count the number of files currently indexed by GitNexus.
 */
function getIndexedFileCount(rootDir: string): number {
  const indexPath = path.join(rootDir, GITNEXUS_INDEX_DIR);
  return countFilesRecursive(indexPath);
}

/**
 * Check GitNexus index freshness against the current git HEAD.
 *
 * Compares the last indexed commit with the current HEAD to determine
 * staleness, and computes coverage metrics based on indexable files.
 *
 * @param rootDir - Repository root directory
 * @returns Freshness snapshot with staleness and coverage assessment
 */
export function checkGitNexusFreshness(rootDir: string): GitNexusFreshness {
  const currentCommit = getCurrentCommit(rootDir);
  const lastIndexedCommit = getLastIndexedCommit(rootDir);
  const now = new Date().toISOString();

  const stale = lastIndexedCommit !== null && lastIndexedCommit !== currentCommit;
  const filesBehind = lastIndexedCommit ? countCommitsBehind(rootDir, lastIndexedCommit) : -1;

  const indexedFiles = getIndexedFileCount(rootDir);
  const totalIndexableFiles = estimateIndexableFiles(rootDir);
  const coveragePercent =
    totalIndexableFiles > 0 ? Math.round((indexedFiles / totalIndexableFiles) * 100) : 0;

  const reindexRecommended = stale || indexedFiles === 0;
  const impactAnalysisAvailable = !stale && indexedFiles > 0;

  const freshness: GitNexusFreshness = {
    lastIndexedCommit,
    currentCommit,
    stale,
    filesBehind: filesBehind > 0 ? filesBehind : 0,
    lastChecked: now,
    reindexRecommended,
    impactAnalysisAvailable,
    indexedFiles,
    totalIndexableFiles,
    coveragePercent,
  };

  const pulseDir = path.join(rootDir, '.pulse', 'current');
  ensureDir(pulseDir, { recursive: true });
  writeTextFile(path.join(pulseDir, ARTIFACT_FILE_NAME), JSON.stringify(freshness, null, 2));

  return freshness;
}

/**
 * Trigger a GitNexus reindex of the repository.
 *
 * Runs `npx gitnexus analyze` to regenerate the code graph, then
 * re-evaluates freshness against the new index state.
 *
 * @param rootDir - Repository root directory
 * @returns Freshness snapshot after reindex attempt
 */
export function triggerReindex(rootDir: string): GitNexusFreshness {
  try {
    execSync('npx gitnexus analyze', {
      cwd: rootDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
      timeout: 300_000,
    });
  } catch {
    // Reindex failure is non-fatal; freshness will reflect the stale state
  }

  return checkGitNexusFreshness(rootDir);
}

/**
 * Determine whether the GitNexus knowledge graph is fresh enough
 * to support PULSE autonomous decision-making.
 *
 * Autonomy requires: index exists, not stale, and coverage >= 50%.
 *
 * @param freshness - Freshness snapshot from checkGitNexusFreshness
 * @returns Whether the graph meets autonomy freshness requirements
 */
export function isGraphFreshEnoughForAutonomy(freshness: GitNexusFreshness): boolean {
  return !freshness.stale && freshness.indexedFiles > 0 && freshness.coveragePercent >= 50;
}
