/**
 * Pulse artifact I/O primitives.
 * Low-level file helpers used by the artifact generation pipeline.
 */
import * as path from 'path';
import { ensureDir, pathExists, readTextFile, renamePath, writeTextFile } from './safe-fs';
import type { PulseArtifactRegistry } from './artifact-registry';
import { injectRunIdentity, type PulseRunIdentity } from './run-identity';
import { safeJoin } from './lib/safe-path';

export function writeAtomic(
  targetPath: string,
  content: string,
  registry: PulseArtifactRegistry,
): void {
  ensureDir(path.dirname(targetPath), { recursive: true });
  ensureDir(registry.tempDir, { recursive: true });
  const tempPath = safeJoin(
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
  const rootMirrorPath = safeJoin(registry.rootDir, relativePath);
  writeAtomic(rootMirrorPath, content, registry);
}

/**
 * Write a PULSE artifact to disk.
 *
 * @param relativePath  File name relative to the canonical artifact directory.
 * @param content       Raw file content (JSON string, markdown, etc.).
 * @param registry      Artifact registry for path resolution.
 * @param identity      Optional run identity to inject into JSON artifacts.
 * @returns             The absolute path to the written file.
 */
export function writeArtifact(
  relativePath: string,
  content: string,
  registry: PulseArtifactRegistry,
  identity?: PulseRunIdentity,
): string {
  const targetPath = safeJoin(registry.canonicalDir, relativePath);
  const finalContent =
    identity && relativePath.endsWith('.json')
      ? (() => {
          try {
            return injectRunIdentity(content, identity);
          } catch {
            return content;
          }
        })()
      : content;
  writeAtomic(targetPath, finalContent, registry);
  mirrorIfNeeded(relativePath, finalContent, registry);
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
