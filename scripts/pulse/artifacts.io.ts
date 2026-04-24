/**
 * Pulse artifact I/O primitives.
 * Low-level file helpers used by the artifact generation pipeline.
 */
import * as path from 'path';
import { ensureDir, pathExists, readTextFile, renamePath, writeTextFile } from './safe-fs';
import type { PulseArtifactRegistry } from './artifact-registry';

export function writeAtomic(
  targetPath: string,
  content: string,
  registry: PulseArtifactRegistry,
): void {
  ensureDir(path.dirname(targetPath), { recursive: true });
  ensureDir(registry.tempDir, { recursive: true });
  const tempPath = path.join(
    registry.tempDir,
    `${path.basename(targetPath)}.${Date.now().toString(36)}.tmp`,
  );
  writeTextFile(tempPath, content);
  renamePath(tempPath, targetPath);
}

export function mirrorIfNeeded(
  relativePath: string,
  content: string,
  registry: PulseArtifactRegistry,
): void {
  if (!registry.mirrors.includes(relativePath)) {
    return;
  }
  const rootMirrorPath = path.join(registry.rootDir, relativePath);
  writeAtomic(rootMirrorPath, content, registry);
}

export function writeArtifact(
  relativePath: string,
  content: string,
  registry: PulseArtifactRegistry,
): string {
  const targetPath = path.join(registry.canonicalDir, relativePath);
  writeAtomic(targetPath, content, registry);
  mirrorIfNeeded(relativePath, content, registry);
  return targetPath;
}

export function compact(value: string, max: number = 240): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= max) {
    return normalized;
  }
  return `${normalized.slice(0, max - 3)}...`;
}

export function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

export function readOptionalJson<T>(filePath: string): T | null {
  if (!pathExists(filePath)) {
    return null;
  }
  try {
    return JSON.parse(readTextFile(filePath, 'utf8')) as T;
  } catch {
    return null;
  }
}
