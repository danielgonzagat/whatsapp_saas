import { safeJoin } from './safe-path';
import * as path from 'path';
import type { PulseConfig } from './types.manifest';
import { pathExists, readTextFile } from './safe-fs';
import { detectSourceRoots } from './source-root-detector/api';
import type { DetectedSourceRoot } from './source-root-detector/types';
import { walkUnskippedFiles } from './source-root-detector/helpers';

function hasMatchingFile(rootDir: string, matcher: (relativePath: string) => boolean): boolean {
  if (!pathExists(rootDir)) return false;
  try {
    const files = walkUnskippedFiles(rootDir);
    return files.some((file) => matcher(String(file).split(path.sep).join('/')));
  } catch {
    return false;
  }
}

function sourceRootScore(root: DetectedSourceRoot): number {
  return (root.weakCandidate ? -100 : 0) + root.evidenceBasis.length * 10 + root.evidence.length;
}

function isRuntimeSourceRoot(root: DetectedSourceRoot): boolean {
  const segments = root.relativePath.split('/');
  return (
    !root.relativePath.startsWith('scripts/') &&
    !segments.some((segment) => segment === '__parts__' || segment === '__companions__') &&
    segments[segments.length - 1] !== 'scripts' &&
    segments[segments.length - 1] !== 'prisma'
  );
}

function pickRoot(
  roots: DetectedSourceRoot[],
  role: DetectedSourceRoot['kind'],
  matcher: (root: DetectedSourceRoot) => boolean,
): DetectedSourceRoot | null {
  const roleCandidates = roots.filter((root) => root.kind === role);
  const candidates = (roleCandidates.length > 0 ? roleCandidates : roots.filter(matcher)).sort(
    (a, b) => sourceRootScore(b) - sourceRootScore(a),
  );
  return candidates[0] ?? null;
}

function findSchemaPath(rootDir: string): string {
  try {
    const schemas = walkUnskippedFiles(rootDir)
      .map((entry) => String(entry).split(path.sep).join('/'))
      .filter(
        (entry) => !entry.split('/').some((part) => part === 'node_modules' || part === 'dist'),
      )
      .filter((entry) => path.basename(entry) === 'schema.prisma')
      .sort();
    return schemas[0] ? safeJoin(rootDir, schemas[0]) : '';
  } catch {
    return '';
  }
}

function detectGlobalPrefix(backendRoot: string): string {
  if (!pathExists(backendRoot)) return '';
  const mainFiles = walkUnskippedFiles(backendRoot)
    .map((entry) => String(entry).split(path.sep).join('/'))
    .filter((entry) => path.basename(entry) === 'main.ts')
    .sort();

  for (const mainFile of mainFiles) {
    const content = readTextFile(safeJoin(backendRoot, mainFile), 'utf8');
    const prefixMatch = content.match(/setGlobalPrefix\s*\(\s*['"`]([^'"`]*)['"`]\s*\)/);
    if (prefixMatch) {
      return prefixMatch[1];
    }
  }
  return '';
}

/** Detect config. */
export function detectConfig(rootDir: string): PulseConfig {
  const detectedRoots = detectSourceRoots(rootDir);
  const runtimeRoots = detectedRoots.filter(isRuntimeSourceRoot);
  const frontendRoot = pickRoot(runtimeRoots, 'frontend', (root) =>
    hasMatchingFile(root.absolutePath, (file) => file.endsWith('.tsx') || file.startsWith('app/')),
  );
  const backendRoot = pickRoot(runtimeRoots, 'backend', (root) =>
    hasMatchingFile(root.absolutePath, (file) => file.endsWith('.controller.ts')),
  );
  const workerRoot = pickRoot(runtimeRoots, 'worker', (root) =>
    hasMatchingFile(root.absolutePath, (file) =>
      /(?:^|\/)(queue|worker|processor|bootstrap)\.ts$/.test(file),
    ),
  );
  const frontendDirs = runtimeRoots
    .filter(
      (root) =>
        root.kind === 'frontend' ||
        hasMatchingFile(
          root.absolutePath,
          (file) => file.endsWith('.tsx') || file.startsWith('app/'),
        ),
    )
    .map((root) => root.absolutePath);
  const frontendDir = frontendRoot?.absolutePath ?? detectedRoots[0]?.absolutePath ?? rootDir;
  const backendDir = backendRoot?.absolutePath ?? detectedRoots[0]?.absolutePath ?? rootDir;
  const workerDir = workerRoot?.absolutePath ?? detectedRoots[0]?.absolutePath ?? rootDir;
  const schemaPath = findSchemaPath(rootDir);
  const globalPrefix = detectGlobalPrefix(backendDir);

  return {
    rootDir,
    frontendDir,
    frontendDirs: frontendDirs.length > 0 ? frontendDirs : [frontendDir],
    backendDir,
    workerDir,
    schemaPath,
    globalPrefix,
  };
}
