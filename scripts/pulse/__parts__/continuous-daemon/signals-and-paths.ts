import * as path from 'node:path';
import { ensureDir, pathExists, readJsonFile, writeTextFile } from '../../safe-fs';
import { resolveRoot } from '../../lib/safe-path';
import type { ContinuousDaemonState } from '../../types.continuous-daemon';
import type { BehaviorGraph } from '../../types.behavior-graph';
import { AUTONOMY_STATE_FILENAME, BEHAVIOR_GRAPH_ARTIFACT, LEASE_DIR } from './types-and-constants';

// ── Daemon-level signal state ─────────────────────────────────────────────────

export let shutdownRequested = false;

function onSignal(signal: string): void {
  if (shutdownRequested) {
    process.exit(0);
  }
  shutdownRequested = true;
  if (process.env.PULSE_CONTINUOUS_DEBUG === '1') {
    console.warn(`[continuous-daemon] Received ${signal}, initiating graceful shutdown...`);
  }
}

export function installSignalHandlers(): void {
  process.once('SIGTERM', () => onSignal('SIGTERM'));
  process.once('SIGINT', () => onSignal('SIGINT'));
}

export function uninstallSignalHandlers(): void {
  process.removeAllListeners('SIGTERM');
  process.removeAllListeners('SIGINT');
}

// ── Path helpers ──────────────────────────────────────────────────────────────

export function autonomyStatePath(rootDir: string): string {
  return path.join(rootDir, '.pulse', 'current', AUTONOMY_STATE_FILENAME);
}

export function behaviorGraphPath(rootDir: string): string {
  return path.join(rootDir, BEHAVIOR_GRAPH_ARTIFACT);
}

export function leaseDirPath(rootDir: string): string {
  return path.join(rootDir, LEASE_DIR);
}

export function leaseFilePath(rootDir: string, filePath: string): string {
  let safeName = filePath.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 120);
  return path.join(leaseDirPath(rootDir), `${safeName}.lease.json`);
}

// ── State I/O ────────────────────────────────────────────────────────────────

export function loadAutonomyState(rootDir: string): ContinuousDaemonState | null {
  let filePath = autonomyStatePath(rootDir);
  if (!pathExists(filePath)) return null;
  try {
    return readJsonFile<ContinuousDaemonState>(filePath);
  } catch {
    return null;
  }
}

export function saveAutonomyState(rootDir: string, state: ContinuousDaemonState): void {
  let filePath = autonomyStatePath(rootDir);
  ensureDir(path.dirname(filePath), { recursive: true });
  state.generatedAt = new Date().toISOString();
  writeTextFile(filePath, JSON.stringify(state, null, 2));
}

export function loadOptionalArtifact<T>(rootDir: string, artifactPath: string): T | null {
  let fullPath = path.join(rootDir, artifactPath);
  if (!pathExists(fullPath)) return null;
  try {
    return readJsonFile<T>(fullPath);
  } catch {
    return null;
  }
}

// ── Behavior graph loading ───────────────────────────────────────────────────

export function loadBehaviorGraph(rootDir: string): BehaviorGraph | null {
  let artifactPath = behaviorGraphPath(rootDir);
  if (!pathExists(artifactPath)) return null;
  try {
    return readJsonFile<BehaviorGraph>(artifactPath);
  } catch {
    return null;
  }
}
