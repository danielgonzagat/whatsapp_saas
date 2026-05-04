import { createHash } from 'crypto';
import { readFileSync, statSync } from 'fs';
import * as path from 'path';
import type { MerkleNode } from '../../types.merkle-cache';
import { ensureDir, pathExists, readDir, readJsonFile, writeTextFile } from '../../safe-fs';

export const CACHE_DIR = '.pulse/cache';
export const DAG_FILE = 'merkle-dag.json';

export const SKIP_PATTERNS = ['node_modules', 'dist', '.next', '.git', '.pulse'];

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
