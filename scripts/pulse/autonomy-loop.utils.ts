/**
 * Pure utility functions for the autonomy loop.
 */
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { buildArtifactRegistry } from './artifact-registry';
import { pathExists, readTextFile, renamePath, writeTextFile, ensureDir } from './safe-fs';
import { AUTONOMY_ARTIFACT, AGENT_ORCHESTRATION_ARTIFACT } from './autonomy-loop.types';

export function compact(value: string, max: number = 400): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= max) {
    return normalized;
  }
  return `${normalized.slice(0, max - 3)}...`;
}

export function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

export function safeJsonParse<T>(value: string | null | undefined): T | null {
  if (!value) {
    return null;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export function coercePositiveInt(value: string | null | undefined, fallback: number): number {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getAutonomyArtifactPath(rootDir: string): string {
  return path.join(rootDir, '.pulse', 'current', AUTONOMY_ARTIFACT);
}

export function getAutonomyMemoryArtifactPath(rootDir: string): string {
  return path.join(rootDir, '.pulse', 'current', 'PULSE_AUTONOMY_MEMORY.json');
}

export function getAgentOrchestrationArtifactPath(rootDir: string): string {
  return path.join(rootDir, '.pulse', 'current', AGENT_ORCHESTRATION_ARTIFACT);
}

export function commandExists(command: string, rootDir: string): boolean {
  const result = spawnSync('zsh', ['-lc', `command -v ${command} >/dev/null 2>&1`], {
    cwd: rootDir,
    stdio: 'ignore',
  });
  return result.status === 0;
}

export function readOptionalArtifact<T>(filePath: string): T | null {
  if (!pathExists(filePath)) {
    return null;
  }
  return safeJsonParse<T>(readTextFile(filePath));
}

export function writeAtomicArtifact(targetPath: string, rootDir: string, content: string): void {
  const registry = buildArtifactRegistry(rootDir);
  ensureDir(path.dirname(targetPath), { recursive: true });
  ensureDir(registry.tempDir, { recursive: true });
  const tempPath = path.join(
    registry.tempDir,
    `${path.basename(targetPath)}.${Date.now().toString(36)}.tmp`,
  );
  writeTextFile(tempPath, content);
  renamePath(tempPath, targetPath);
}

export function readCanonicalArtifact(
  rootDir: string,
  relativePath: string,
): Record<string, unknown> | null {
  const canonicalPath = path.join(rootDir, '.pulse', 'current', relativePath);
  return readOptionalArtifact<Record<string, unknown>>(canonicalPath);
}

export function readAgentsSdkVersion(rootDir: string): string | null {
  const packagePath = path.join(rootDir, 'node_modules', '@openai', 'agents', 'package.json');
  if (!pathExists(packagePath)) {
    return null;
  }
  const packageJson = safeJsonParse<{ version?: string }>(readTextFile(packagePath));
  return packageJson?.version || null;
}
