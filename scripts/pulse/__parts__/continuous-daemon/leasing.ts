import * as path from 'node:path';
import { ensureDir, pathExists, readJsonFile, writeTextFile } from '../../safe-fs';
import type { FileLease } from './types-and-constants';
import { leaseDirPath, leaseFilePath } from './signals-and-paths';

// ── File leasing ──────────────────────────────────────────────────────────────

/**
 * Acquire a lease on a file to prevent concurrent work on the same unit.
 *
 * Leases are stored as JSON files in `.pulse/leases/` with a TTL calibrated
 * from daemon history or live graph freshness.
 * Returns `true` if the lease was acquired, `false` if the file is already
 * leased (and the lease has not expired).
 */
export function acquireFileLease(
  rootDir: string,
  filePath: string,
  unitId: string,
  iteration: number,
  leaseTtlMs: number,
): boolean {
  ensureDir(leaseDirPath(rootDir), { recursive: true });
  let leasePath = leaseFilePath(rootDir, filePath);

  if (pathExists(leasePath)) {
    try {
      let existing: FileLease = readJsonFile<FileLease>(leasePath);
      let expiresAt = new Date(existing.expiresAt).getTime();
      if (Date.now() < expiresAt) {
        return Boolean();
      }
    } catch {
      // Corrupt lease file — overwrite
    }
  }

  let now = new Date();
  let lease: FileLease = {
    filePath,
    unitId,
    iteration,
    acquiredAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + leaseTtlMs).toISOString(),
    agentId: `pulse-planner-${process.pid ?? 'unknown'}`,
  };

  writeTextFile(leasePath, JSON.stringify(lease, null, 2));
  return Boolean(lease);
}

/**
 * Release a file lease after a planning cycle completes.
 */
export function releaseFileLease(rootDir: string, filePath: string): void {
  let leasePath = leaseFilePath(rootDir, filePath);
  try {
    if (pathExists(leasePath)) {
      let fs = require('fs');
      fs.unlinkSync(leasePath);
    }
  } catch {
    // Best-effort cleanup
  }
}

/**
 * Release all active leases for the current agent.
 */
export function releaseAllLeases(rootDir: string): void {
  let dirPath = leaseDirPath(rootDir);
  if (!pathExists(dirPath)) return;

  try {
    let fs = require('fs');
    let entries = fs.readdirSync(dirPath);
    let agentId = `pulse-planner-${process.pid ?? 'unknown'}`;
    for (let entry of entries) {
      if (!entry.endsWith('.lease.json')) continue;
      let fullPath = path.join(dirPath, entry);
      try {
        let lease: FileLease = readJsonFile<FileLease>(fullPath);
        if (lease.agentId === agentId) {
          fs.unlinkSync(fullPath);
        }
      } catch {
        // Skip unreadable files
      }
    }
  } catch {
    // Best-effort
  }
}
