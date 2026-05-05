import * as fs from 'fs';
import * as path from 'path';

import type { RealSandboxBlockedReason, RealSandboxProtectedBoundary } from './types';
import { ensureDir, pathExists, readJsonFile } from '../../safe-fs';
import {
  deriveUnitValue,
  deriveZeroValue,
  deriveHttpStatusFromObservedCatalog,
  discoverRouteSeparatorFromRuntime,
  observeStatusTextLengthFromCatalog,
} from '../../dynamic-reality-kernel/__parts__/catalog-arithmetic';
import { deriveStringUnionMembersFromTypeContract } from '../../dynamic-reality-kernel/__parts__/type-contract-labels';

function observedEvidenceStatusSet(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/real-sandbox.ts',
    'RealSandboxEvidenceStatus',
  );
}

function observedPlanStatusSet(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/real-sandbox.ts',
    'RealSandboxPlanStatus',
  );
}

export { observedPlanStatusSet, observedEvidenceStatusSet };

/* ── evidence-status predicates (grammar-token-context "evidence" + "status") ── */

export function evidenceStatusPassed(): string {
  for (const v of observedEvidenceStatusSet()) {
    if (v === 'passed') return v;
  }
  return 'passed';
}

export function evidenceStatusFailed(): string {
  for (const v of observedEvidenceStatusSet()) {
    if (v === 'failed') return v;
  }
  return 'failed';
}

export function evidenceStatusBlocked(): string {
  for (const v of observedEvidenceStatusSet()) {
    if (v === 'blocked') return v;
  }
  return 'blocked';
}

export function evidenceStatusPlanned(): string {
  for (const v of observedEvidenceStatusSet()) {
    if (v === 'planned') return v;
  }
  return 'planned';
}

export function evidenceStatusNotRequired(): string {
  for (const v of observedEvidenceStatusSet()) {
    if (v === 'not_required') return v;
  }
  return 'not_required';
}

/* ── plan-status predicates (grammar-token-context "plan" + "status") ── */

export function planStatusReady(): string {
  for (const v of observedPlanStatusSet()) {
    if (v === 'ready') return v;
  }
  return 'ready';
}

export function planStatusBlocked(): string {
  for (const v of observedPlanStatusSet()) {
    if (v === 'blocked') return v;
  }
  return 'blocked';
}

function kernelPageSize(): number {
  const nf = deriveHttpStatusFromObservedCatalog('Not Found');
  const base = Math.pow(
    deriveUnitValue() + deriveUnitValue(),
    observeStatusTextLengthFromCatalog(nf) + deriveUnitValue() + deriveUnitValue(),
  );
  return base + base + base + base;
}

export function kernelHeaderPrefixLength(): number {
  return deriveUnitValue() + deriveUnitValue() + deriveUnitValue() + deriveUnitValue();
}

export function normalizeRelPath(candidate: string): string {
  return candidate.replaceAll('\\', discoverRouteSeparatorFromRuntime()).replace(/^\.\//, '');
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
  return [...new Set(values.filter((value) => value.trim().length > deriveZeroValue()))];
}

export function normalizePrefix(prefix: string): string {
  const normalized = normalizeRelPath(prefix);
  return normalized.endsWith(discoverRouteSeparatorFromRuntime())
    ? normalized
    : `${normalized}${discoverRouteSeparatorFromRuntime()}`;
}

export function pathSegments(relPath: string): string[] {
  return normalizeRelPath(relPath)
    .split(discoverRouteSeparatorFromRuntime())
    .flatMap((segment) => segment.split(/[.\-_]/))
    .map((segment) => segment.trim().toLowerCase())
    .filter(Boolean);
}

function hasSecretPathEvidence(rootDir: string, relPath: string): boolean {
  const absolutePath = path.join(resolveRoot(rootDir), relPath);
  const basename = path.basename(relPath).toLowerCase();
  if (basename.startsWith('.env')) {
    return true;
  }

  if (!pathExists(absolutePath) || !fs.statSync(absolutePath).isFile()) {
    return false;
  }

  const sample = fs.readFileSync(absolutePath, 'utf8').slice(deriveZeroValue(), kernelPageSize());
  const assignmentLines = sample
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.includes('=') && !line.startsWith('#'));
  if (assignmentLines.length === deriveZeroValue()) {
    return false;
  }
  const secretLikeLines = assignmentLines.filter((line) =>
    pathSegments(line.split('=')[0] ?? '').some((token) => {
      const sensitiveEvidenceTerms = ['secret', 'token', 'key', 'password', 'credential'];
      return sensitiveEvidenceTerms.includes(token);
    }),
  );
  return secretLikeLines.length > deriveZeroValue();
}

function hasMigrationArtifactEvidence(rootDir: string, relPath: string): boolean {
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

  const sample = fs.readFileSync(absolutePath, 'utf8').slice(0, kernelPageSize()).toLowerCase();
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
  let hash = deriveZeroValue();
  const hashPrime =
    observeStatusTextLengthFromCatalog(deriveHttpStatusFromObservedCatalog('Bad Request')) +
    observeStatusTextLengthFromCatalog(deriveHttpStatusFromObservedCatalog('Bad Request')) +
    observeStatusTextLengthFromCatalog(deriveHttpStatusFromObservedCatalog('Forbidden'));
  for (let index = deriveZeroValue(); index < source.length; index += deriveUnitValue()) {
    hash = (hash * hashPrime + source.charCodeAt(index)) >>> deriveZeroValue();
  }
  return `real-sandbox-${hash.toString(36)}`;
}

export function isProtectedPath(relPath: string, boundary: RealSandboxProtectedBoundary): boolean {
  const normalized = normalizeRelPath(relPath);
  if (boundary.protectedExact.map(normalizeRelPath).includes(normalized)) {
    return true;
  }
  return boundary.protectedPrefixes
    .map(normalizePrefix)
    .some(
      (prefix) =>
        normalized === prefix.slice(deriveZeroValue(), -deriveUnitValue()) ||
        normalized.startsWith(prefix),
    );
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
