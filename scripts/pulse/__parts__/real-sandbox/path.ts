import * as fs from 'fs';
import * as path from 'path';
import { ensureDir, pathExists, readJsonFile } from '../../safe-fs';
import type { RealSandboxProtectedBoundary, RealSandboxBlockedReason } from './types';
import { GOVERNANCE_BOUNDARY_PATH, DEFAULT_PROTECTED_BOUNDARY } from './types';

export function normalizeRelPath(candidate: string): string {
  return candidate.replaceAll('\\', '/').replace(/^\.\//, '');
}

export function resolveRoot(rootDir: string): string {
  return path.resolve(rootDir);
}

export function resolveInsideRoot(
  rootDir: string,
  candidate: string,
): { inside: boolean; relPath: string } {
  const root = resolveRoot(rootDir);
  const resolved = path.resolve(root, candidate);
  const inside = resolved === root || resolved.startsWith(root + path.sep);
  return {
    inside,
    relPath: normalizeRelPath(path.relative(root, resolved)),
  };
}

export function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

export function normalizePrefix(prefix: string): string {
  const normalized = normalizeRelPath(prefix);
  return normalized.endsWith('/') ? normalized : `${normalized}/`;
}

export function pathSegments(relPath: string): string[] {
  return normalizeRelPath(relPath)
    .split('/')
    .flatMap((segment) => segment.split(/[.\-_]/))
    .map((segment) => segment.trim().toLowerCase())
    .filter(Boolean);
}

export function hasSecretPathEvidence(rootDir: string, relPath: string): boolean {
  const absolutePath = path.join(resolveRoot(rootDir), relPath);
  const basename = path.basename(relPath).toLowerCase();
  if (basename.startsWith('.env')) {
    return true;
  }

  if (!pathExists(absolutePath) || !fs.statSync(absolutePath).isFile()) {
    return false;
  }

  const sample = fs.readFileSync(absolutePath, 'utf8').slice(0, 4096);
  const assignmentLines = sample
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.includes('=') && !line.startsWith('#'));
  if (assignmentLines.length === 0) {
    return false;
  }
  const secretLikeLines = assignmentLines.filter((line) =>
    pathSegments(line.split('=')[0] ?? '').some((token) => {
      const sensitiveEvidenceTerms = ['secret', 'token', 'key', 'password', 'credential'];
      return sensitiveEvidenceTerms.includes(token);
    }),
  );
  return secretLikeLines.length > 0;
}

export function hasMigrationArtifactEvidence(rootDir: string, relPath: string): boolean {
  const segments = pathSegments(relPath);
  if (segments.includes('migrations') || path.basename(relPath) === 'schema.prisma') {
    return (
      segments.includes('prisma') ||
      segments.includes('migration') ||
      segments.includes('migrations')
    );
  }

  const absolutePath = path.join(resolveRoot(rootDir), relPath);
  if (!pathExists(absolutePath) || !fs.statSync(absolutePath).isFile()) {
    return false;
  }

  const sample = fs.readFileSync(absolutePath, 'utf8').slice(0, 4096).toLowerCase();
  return (
    sample.includes('create table') || sample.includes('alter table') || sample.includes('model ')
  );
}

export function normalizeCommand(command: string): string {
  return command.trim().replace(/\s+/g, ' ');
}

export function quoteCommandArg(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

export function stableWorkspaceId(
  rootDir: string,
  touchedPaths: readonly string[],
  commands: readonly string[],
): string {
  const source = `${resolveRoot(rootDir)}:${touchedPaths.join('|')}:${commands.join('|')}`;
  let hash = 0;
  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 31 + source.charCodeAt(index)) >>> 0;
  }
  return `real-sandbox-${hash.toString(36)}`;
}

export function loadProtectedBoundary(rootDir: string): RealSandboxProtectedBoundary {
  const boundaryPath = path.join(resolveRoot(rootDir), GOVERNANCE_BOUNDARY_PATH);
  if (!pathExists(boundaryPath)) {
    return DEFAULT_PROTECTED_BOUNDARY;
  }

  try {
    const parsed = readJsonFile<{
      protectedExact?: string[];
      protectedPrefixes?: string[];
    }>(boundaryPath);
    return {
      protectedExact: parsed.protectedExact ?? DEFAULT_PROTECTED_BOUNDARY.protectedExact,
      protectedPrefixes: parsed.protectedPrefixes ?? DEFAULT_PROTECTED_BOUNDARY.protectedPrefixes,
    };
  } catch {
    return DEFAULT_PROTECTED_BOUNDARY;
  }
}

export function isProtectedPath(relPath: string, boundary: RealSandboxProtectedBoundary): boolean {
  const normalized = normalizeRelPath(relPath);
  if (boundary.protectedExact.map(normalizeRelPath).includes(normalized)) {
    return true;
  }
  return boundary.protectedPrefixes
    .map(normalizePrefix)
    .some((prefix) => normalized === prefix.slice(0, -1) || normalized.startsWith(prefix));
}

export function classifyPath(
  rootDir: string,
  candidate: string,
  boundary: RealSandboxProtectedBoundary,
): { relPath: string; blockedReasons: RealSandboxBlockedReason[] } {
  const resolved = resolveInsideRoot(rootDir, candidate);
  const target = resolved.relPath || '.';
  const blockedReasons: RealSandboxBlockedReason[] = [];

  if (!resolved.inside) {
    blockedReasons.push({
      code: 'path_outside_root',
      target: candidate,
      reason: 'Path resolves outside the repository root.',
    });
    return { relPath: target, blockedReasons };
  }

  if (isProtectedPath(target, boundary)) {
    blockedReasons.push({
      code: 'protected_path',
      target,
      reason: 'Path is protected by governance boundary.',
    });
  }
  if (hasSecretPathEvidence(rootDir, target)) {
    blockedReasons.push({
      code: 'secret_path',
      target,
      reason: 'Environment files are blocked from sandbox proof execution.',
    });
  }
  if (hasMigrationArtifactEvidence(rootDir, target)) {
    blockedReasons.push({
      code: 'migration_path',
      target,
      reason: 'Migration and Prisma schema paths require human-governed handling.',
    });
  }

  return { relPath: target, blockedReasons };
}
