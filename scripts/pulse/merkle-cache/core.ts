import { createHash } from 'crypto';
import { readFileSync, statSync } from 'fs';
import * as path from 'path';
import type { MerkleNode } from '../types.merkle-cache';
import { deriveStringUnionMembersFromTypeContract } from '../dynamic-reality-kernel/type-contract-labels';
import { deriveZeroValue } from '../dynamic-reality-kernel/catalog-arithmetic';
import { readDir } from '../safe-fs';
import { normalizePath } from '../scope-state.codacy';

export const CACHE_DIR = '.pulse/cache';
export const DAG_FILE = 'merkle-dag.json';

export const SKIP_PATTERNS = ['node_modules', 'dist', '.next', '.git', '.pulse'];

export const MERKLE_NODE_KINDS = deriveStringUnionMembersFromTypeContract(
  'scripts/pulse/types.merkle-cache.ts',
  'kind',
);
export const MERKLE_CAP_KIND =
  [...MERKLE_NODE_KINDS].find((k) => k === 'capability') ?? 'capability';
export const MERKLE_FLOW_KIND = [...MERKLE_NODE_KINDS].find((k) => k === 'flow') ?? 'flow';
export const MERKLE_ROOT_KIND =
  [...MERKLE_NODE_KINDS].find((k) => k === 'graph_root') ?? 'graph_root';
export const MERKLE_FILE_KIND = [...MERKLE_NODE_KINDS].find((k) => k === 'file') ?? 'file';

export function isNonFileMerkleKind(k: string): boolean {
  return MERKLE_NODE_KINDS.has(k) && k !== MERKLE_FILE_KIND;
}

export interface BuildMerkleDagOptions {
  changedFilePaths?: string[];
}

export interface FileHashResult {
  contentHash: string;
  reused: boolean;
}

export function walkDir(dir: string, rootDir: string): string[] {
  const result: string[] = [];
  const entries = readDir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const name = typeof entry === 'string' ? entry : entry.name;
    if (SKIP_PATTERNS.some((p) => name === p && name !== 'dist')) {
      continue;
    }
    const fullPath = path.join(dir, name);
    if (typeof entry === 'string') {
      try {
        const stat = statSync(fullPath);
        if (stat.isFile()) {
          result.push(path.relative(rootDir, fullPath));
        } else if (stat.isDirectory()) {
          result.push(...walkDir(fullPath, rootDir));
        }
      } catch {
        // skip inaccessible entries
      }
    } else if (entry.isFile()) {
      result.push(path.relative(rootDir, fullPath));
    } else if (entry.isDirectory()) {
      result.push(...walkDir(fullPath, rootDir));
    }
  }
  return result;
}

export function computeSha256(content: string | Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}

export function deriveHash(node: MerkleNode, nodes: Record<string, MerkleNode>): string {
  const childHashes = node.children
    .map((id) => nodes[id]?.derivedHash ?? '')
    .filter(Boolean)
    .sort()
    .join('');
  return computeSha256(node.contentHash + childHashes);
}

export function nowISO(): string {
  return new Date().toISOString();
}

export function normalizeChangedFileSet(rootDir: string, changedFilePaths: string[]): Set<string> {
  const normalized = new Set<string>();
  for (const filePath of changedFilePaths) {
    const relPath = path.isAbsolute(filePath) ? path.relative(rootDir, filePath) : filePath;
    const normalizedPath = normalizePath(relPath);
    if (!normalizedPath || normalizedPath.startsWith('../')) {
      continue;
    }
    normalized.add(normalizedPath);
  }
  return normalized;
}

export function computeFileHash(
  absPath: string,
  relPath: string,
  prevNodes: Record<string, MerkleNode>,
  changedFileSet: Set<string>,
): FileHashResult | null {
  const prev = prevNodes[relPath];
  if (prev && changedFileSet.size > deriveZeroValue() && !changedFileSet.has(relPath)) {
    return { contentHash: prev.contentHash, reused: true };
  }

  try {
    const raw = readFileSync(absPath);
    return { contentHash: computeSha256(raw), reused: false };
  } catch {
    return null;
  }
}

export function topologicalSort(nodes: Record<string, MerkleNode>): string[] {
  const visited = new Set<string>();
  const result: string[] = [];

  function visit(id: string): void {
    if (visited.has(id)) return;
    visited.add(id);
    const node = nodes[id];
    if (node) {
      for (const child of node.children) {
        visit(child);
      }
    }
    result.push(id);
  }

  for (const id of Object.keys(nodes)) {
    visit(id);
  }

  return result;
}
