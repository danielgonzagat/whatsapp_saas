import { safeJoin } from './safe-path';
import * as path from 'path';
import type { PulseConfig } from './types';
import { pathExists, readDir, readTextFile } from './safe-fs';
import { detectSourceRoots, type DetectedSourceRoot } from './source-root-detector';

function hasMatchingFile(rootDir: string, matcher: (relativePath: string) => boolean): boolean {
  if (!pathExists(rootDir)) return false;
  try {
    const files = readDir(rootDir, { recursive: true }) as string[];
    return files.some((file) => matcher(String(file).split(path.sep).join('/')));
  } catch {
    return false;
  }
}

function sourceRootScore(root: DetectedSourceRoot): number {
  return (root.weakCandidate ? -100 : 0) + root.evidenceBasis.length * 10 + root.evidence.length;
}

function pickRoot(
  roots: DetectedSourceRoot[],
  role: DetectedSourceRoot['kind'],
  matcher: (root: DetectedSourceRoot) => boolean,
): DetectedSourceRoot | null {
  const candidates = roots
    .filter((root) => root.kind === role || matcher(root))
    .sort((a, b) => sourceRootScore(b) - sourceRootScore(a));
  return candidates[0] ?? null;
}

function findSchemaPath(rootDir: string): string {
  try {
    const schemas = (readDir(rootDir, { recursive: true }) as string[])
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
  const mainFiles = (readDir(backendRoot, { recursive: true }) as string[])
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
  const frontendRoot = pickRoot(detectedRoots, 'frontend', (root) =>
    hasMatchingFile(root.absolutePath, (file) => file.endsWith('.tsx') || file.startsWith('app/')),
  );
  const backendRoot = pickRoot(detectedRoots, 'backend', (root) =>
    hasMatchingFile(root.absolutePath, (file) => file.endsWith('.controller.ts')),
  );
  const workerRoot = pickRoot(detectedRoots, 'worker', (root) =>
    hasMatchingFile(root.absolutePath, (file) =>
      /(?:^|\/)(queue|worker|processor|bootstrap)\.ts$/.test(file),
    ),
  );
  const frontendDirs = detectedRoots
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
