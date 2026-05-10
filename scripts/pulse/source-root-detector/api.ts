import * as path from 'path';
import { pathExists, readDir, statPath } from '../safe-fs';
import { safeJoin } from '../safe-path';
import {
  DetectedSourceRoot,
  SourceRootEvidenceBasis,
  WEAK_FALLBACK_SEGMENTS,
  CONVENTIONAL_SOURCE_DIR_NAMES,
  SKIP_DIR_NAMES,
  ZERO,
} from './types';
import {
  normalizeRelative,
  hasSkippedSegment,
  inferKindFromFileEvidence,
} from './helpers';
import { addRoot } from './source-resolution';
import { addPackageRoots, addTsConfigRoots, discoverBuildConfigRoots } from './scanners';
import { discoverPackageDirs } from './package-discovery';

function discoverConventionalSourceDirsFromTopLevel(rootDir: string): string[] {
  const candidates = new Set<string>();
  for (const entry of readDir(rootDir)) {
    if (SKIP_DIR_NAMES.has(entry) || entry.startsWith('.')) continue;
    const entryPath = safeJoin(rootDir, entry);
    try {
      if (!statPath(entryPath).isDirectory()) continue;
    } catch {
      continue;
    }
    for (const sourceDirName of CONVENTIONAL_SOURCE_DIR_NAMES) {
      if (pathExists(safeJoin(entryPath, sourceDirName))) {
        candidates.add(normalizeRelative(safeJoin(entry, sourceDirName)));
      }
    }
  }
  return [...candidates];
}

function addFileEvidenceRoots(roots: Map<string, DetectedSourceRoot>, rootDir: string): void {
  const candidates = new Set<string>();

  for (const relativeDir of discoverConventionalSourceDirsFromTopLevel(rootDir)) {
    candidates.add(relativeDir);
  }

  for (const relativePath of candidates) {
    const segments = relativePath.split('/');
    const kind = inferKindFromFileEvidence(rootDir, segments[ZERO] ?? relativePath);
    const basis: SourceRootEvidenceBasis = kind === 'unknown' ? 'file-evidence' : 'import-graph';
    addRoot(roots, rootDir, relativePath, null, `${basis}:source-files`, basis, { kind });
  }
}

function addWeakFallbackRoots(roots: Map<string, DetectedSourceRoot>, rootDir: string): void {
  if (roots.size > ZERO) return;

  for (const fallback of WEAK_FALLBACK_SEGMENTS) {
    const relativePath = normalizeRelative(safeJoin(fallback.base, fallback.sourceDir));
    if (!pathExists(safeJoin(rootDir, relativePath))) continue;
    addRoot(
      roots,
      rootDir,
      relativePath,
      fallback.packageName,
      'weak-fallback:conventional-source-root-exists-without-manifest-evidence',
      'weak-fallback',
      { weakCandidate: true },
    );
  }
}

export function detectSourceRoots(rootDir: string): DetectedSourceRoot[] {
  const absoluteRoot = path.resolve(rootDir);
  const roots = new Map<string, DetectedSourceRoot>();
  const packages = discoverPackageDirs(absoluteRoot);

  addPackageRoots(roots, absoluteRoot, packages);
  addTsConfigRoots(roots, absoluteRoot, packages);
  discoverBuildConfigRoots(roots, absoluteRoot, packages);
  addFileEvidenceRoots(roots, absoluteRoot);
  addWeakFallbackRoots(roots, absoluteRoot);

  return [...roots.values()].sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

export function sourceGlobsForTsMorph(rootDir: string): string[] {
  const files = new Set<string>();
  for (const root of detectSourceRoots(rootDir)) {
    if (!pathExists(root.absolutePath)) continue;
    for (const entry of readDir(root.absolutePath, { recursive: true }) as string[]) {
      const relativeEntry = normalizeRelative(entry);
      if (hasSkippedSegment(relativeEntry)) continue;
      const extension = path.extname(relativeEntry);
      if (!root.languageExtensions.includes(extension)) continue;
      files.add(safeJoin(root.absolutePath, relativeEntry).split(path.sep).join('/'));
    }
  }
  return [...files].sort();
}
