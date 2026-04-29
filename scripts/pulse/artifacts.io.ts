/**
 * Pulse artifact I/O primitives.
 * Low-level file helpers used by the artifact generation pipeline.
 */
import * as path from 'path';
import { ensureDir, pathExists, readTextFile, renamePath, writeTextFile } from './safe-fs';
import type { PulseArtifactDefinition, PulseArtifactRegistry } from './artifact-registry';
import { injectRunIdentity, type PulseRunIdentity } from './run-identity';
import { safeJoin } from './lib/safe-path';

const ARTIFACT_SUMMARY_MAX_DEPTH = 5;
const ARTIFACT_SUMMARY_MAX_ARRAY_ITEMS = 25;
const ARTIFACT_SUMMARY_MAX_OBJECT_KEYS = 40;
const ARTIFACT_SUMMARY_MAX_STRING_LENGTH = 400;

type JsonSummary =
  | null
  | boolean
  | number
  | {
      kind: 'array';
      length: number;
      sample: JsonSummary[];
      omittedItems: number;
    }
  | {
      kind: 'object';
      keyCount: number;
      sampledKeys: string[];
      value: Record<string, JsonSummary>;
      omittedKeys: number;
    }
  | {
      kind: 'max-depth';
      type: string;
    }
  | {
      kind: 'text';
      length: number;
      sample: string;
      truncated: boolean;
    };

interface ArtifactStorageSummary {
  pulseArtifactStorage: {
    status: 'summarized';
    strategy: 'summarize-json';
    originalBytes: number;
    persistedBytesLimit: number;
    reason: string;
    proofSafety: string;
  };
  summary: JsonSummary;
}

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

function byteLength(content: string): number {
  return Buffer.byteLength(content, 'utf8');
}

function findArtifactDefinition(
  relativePath: string,
  registry: PulseArtifactRegistry,
): PulseArtifactDefinition | null {
  return registry.artifacts.find((artifact) => artifact.relativePath === relativePath) ?? null;
}

function summarizeString(value: string): JsonSummary {
  const truncated = value.length > ARTIFACT_SUMMARY_MAX_STRING_LENGTH;
  return {
    kind: 'text',
    length: value.length,
    sample: truncated ? value.slice(0, ARTIFACT_SUMMARY_MAX_STRING_LENGTH) : value,
    truncated,
  };
}

function summarizeJson(value: unknown, depth: number = 0): JsonSummary {
  if (value === null) {
    return null;
  }
  if (typeof value === 'boolean' || typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    return summarizeString(value);
  }
  if (depth >= ARTIFACT_SUMMARY_MAX_DEPTH) {
    return {
      kind: 'max-depth',
      type: Array.isArray(value) ? 'array' : typeof value,
    };
  }
  if (Array.isArray(value)) {
    const sample = value
      .slice(0, ARTIFACT_SUMMARY_MAX_ARRAY_ITEMS)
      .map((entry) => summarizeJson(entry, depth + 1));
    return {
      kind: 'array',
      length: value.length,
      sample,
      omittedItems: Math.max(0, value.length - sample.length),
    };
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    const sampledKeys = keys.slice(0, ARTIFACT_SUMMARY_MAX_OBJECT_KEYS);
    const summarized: Record<string, JsonSummary> = {};
    for (const key of sampledKeys) {
      summarized[key] = summarizeJson(record[key], depth + 1);
    }
    return {
      kind: 'object',
      keyCount: keys.length,
      sampledKeys,
      value: summarized,
      omittedKeys: Math.max(0, keys.length - sampledKeys.length),
    };
  }
  return {
    kind: 'text',
    length: String(value).length,
    sample: String(value),
    truncated: false,
  };
}

function summarizeOversizedArtifact(
  relativePath: string,
  content: string,
  definition: PulseArtifactDefinition,
): string {
  const originalBytes = byteLength(content);
  const maxBytes = definition.maxBytes ?? originalBytes;
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    parsed = content;
  }
  const payload: ArtifactStorageSummary = {
    pulseArtifactStorage: {
      status: 'summarized',
      strategy: 'summarize-json',
      originalBytes,
      persistedBytesLimit: maxBytes,
      reason: `${relativePath} exceeded the optional evidence artifact byte budget.`,
      proofSafety:
        'Full evidence was too large to persist in the canonical single-state artifact set; this summary preserves structure, counts, and samples without marking proof as passing.',
    },
    summary: summarizeJson(parsed),
  };
  return JSON.stringify(payload, null, 2);
}

function applyArtifactStoragePolicy(
  relativePath: string,
  content: string,
  registry: PulseArtifactRegistry,
): string {
  const definition = findArtifactDefinition(relativePath, registry);
  if (
    !definition ||
    !definition.maxBytes ||
    definition.oversizedStrategy !== 'summarize-json' ||
    byteLength(content) <= definition.maxBytes
  ) {
    return content;
  }
  return summarizeOversizedArtifact(relativePath, content, definition);
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
  const policyContent = applyArtifactStoragePolicy(relativePath, content, registry);
  const finalContent =
    identity && relativePath.endsWith('.json')
      ? (() => {
          try {
            return injectRunIdentity(policyContent, identity);
          } catch {
            return policyContent;
          }
        })()
      : policyContent;
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
