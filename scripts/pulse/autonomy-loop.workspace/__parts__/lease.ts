import * as path from 'node:path';

import type { PulseWorkerLeaseValidationInput } from './types';

export function normalizeRepoPath(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/^\.\//, '');
}

export function normalizeLeasePath(filePath: string, rootDir?: string): string | null {
  const trimmed = filePath.trim().replace(/\s+\(\d+\)$/, '');
  if (!trimmed || trimmed === '.' || trimmed === '..') {
    return null;
  }
  const slashNormalized = normalizeRepoPath(trimmed);
  const relativePath =
    rootDir && path.isAbsolute(slashNormalized)
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

function violatesForbiddenFile(filePath: string, forbiddenFiles: string[]): boolean {
  const normalized = normalizeRepoPath(filePath);
  return forbiddenFiles.some((forbidden) => {
    const entry = normalizeRepoPath(forbidden);
    return normalized === entry || normalized.startsWith(entry.endsWith('/') ? entry : `${entry}/`);
  });
}

export function validateChangedFilesAgainstLease(
  changedFiles: string[],
  lease: PulseWorkerLeaseValidationInput,
  rootDir?: string,
): string | null {
  if (lease.leaseStatus && lease.leaseStatus !== 'active') {
    return `Worker lease ${lease.leaseId || 'missing'} is ${lease.leaseStatus}.`;
  }
  if (lease.leaseExpiresAt) {
    const expiresAt = Date.parse(lease.leaseExpiresAt);
    if (Number.isNaN(expiresAt)) {
      return `Worker lease ${lease.leaseId || 'missing'} has an invalid expiration timestamp.`;
    }
    if (expiresAt <= Date.now()) {
      return `Worker lease ${lease.leaseId || 'missing'} expired at ${lease.leaseExpiresAt}.`;
    }
  }
  const ownedFiles = new Set<string>();
  for (const filePath of lease.ownedFiles || []) {
    const normalized = normalizeLeasePath(filePath, rootDir);
    if (!normalized) {
      return `${filePath} is an invalid ownedFiles entry for worker lease ${lease.leaseId || 'missing'}.`;
    }
    if (violatesForbiddenFile(normalized, lease.forbiddenFiles || [])) {
      return `${normalized} is forbidden and cannot be owned by worker lease ${lease.leaseId || 'missing'}.`;
    }
    ownedFiles.add(normalized);
  }
  const forbiddenFiles = lease.forbiddenFiles || [];
  if (ownedFiles.size === 0 && changedFiles.length > 0) {
    return `Worker lease ${lease.leaseId || 'missing'} has no ownedFiles but changed ${changedFiles.length} file(s).`;
  }
  for (const filePath of changedFiles) {
    const normalized = normalizeLeasePath(filePath, rootDir);
    if (!normalized) {
      return `${filePath} is an invalid changed path for worker lease ${lease.leaseId || 'missing'}.`;
    }
    if (violatesForbiddenFile(normalized, forbiddenFiles)) {
      return `${normalized} is forbidden by worker lease ${lease.leaseId || 'missing'}.`;
    }
    if (ownedFiles.size > 0 && !ownedFiles.has(normalized)) {
      return `${normalized} is outside ownedFiles for worker lease ${lease.leaseId || 'missing'}.`;
    }
  }
  return null;
}
