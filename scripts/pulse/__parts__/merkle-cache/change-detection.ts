import { readFileSync } from 'fs';
import type { MerkleNode } from '../../types.merkle-cache';
import { computeSha256, type FileHashResult } from './internal-helpers';

export function computeFileHash(
  absPath: string,
  relPath: string,
  prevNodes: Record<string, MerkleNode>,
  changedFileSet: Set<string>,
): FileHashResult | null {
  const prev = prevNodes[relPath];
  if (prev && changedFileSet.size > 0 && !changedFileSet.has(relPath)) {
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
