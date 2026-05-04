import { readFileSync } from 'fs';
import * as path from 'path';
import type { MerkleDag, MerkleNode } from '../../types.merkle-cache';
import { deriveZeroValue } from '../../dynamic-reality-kernel';
import { MERKLE_FILE_KIND, isNonFileMerkleKind, computeSha256, deriveHash, nowISO } from './core';
import { buildParentMap, addAncestors } from './dag-graph';

export function computeAggregateContentHash(
  node: MerkleNode,
  nodes: Record<string, MerkleNode>,
): string {
  const childHashes = node.children
    .map((id) => nodes[id]?.contentHash ?? '')
    .filter(Boolean)
    .sort()
    .join('');
  return computeSha256(childHashes);
}

/**
 * Recompute a single node's content hash by re-reading its source and
 * propagate `derivedHash` changes upward to the root.
 *
 * Only `file`-kind nodes are re-read from disk; capability and flow nodes
 * are recomputed from their children's hashes.
 *
 * @param dag     The current DAG (mutated in place).
 * @param nodeId  The id of the node to recompute.
 * @returns The updated DAG (same object reference).
 */
export function recomputeNode(dag: MerkleDag, nodeId: string, rootDir?: string): MerkleDag {
  const node = dag.nodes[nodeId];
  if (!node) return dag;

  const previousDerivedHash = node.derivedHash;
  const previousContentHash = node.contentHash;

  if (node.kind === MERKLE_FILE_KIND) {
    try {
      const raw = readFileSync(rootDir ? path.join(rootDir, node.id) : node.id);
      node.contentHash = computeSha256(raw);
    } catch {
      node.contentHash = '';
    }
  }

  if (isNonFileMerkleKind(node.kind)) {
    node.contentHash = computeAggregateContentHash(node, dag.nodes);
  }

  node.derivedHash = deriveHash(node, dag.nodes);
  node.lastComputed = nowISO();
  node.changed =
    previousContentHash !== node.contentHash || previousDerivedHash !== node.derivedHash;

  const parentMap = buildParentMap(dag.nodes);
  const ancestors = new Set<string>();
  addAncestors(nodeId, parentMap, ancestors);

  const ancestorList = Array.from(ancestors);
  for (const ancestorId of ancestorList) {
    const anc = dag.nodes[ancestorId];
    if (!anc) continue;
    const ancestorPreviousContentHash = anc.contentHash;
    const ancestorPreviousDerivedHash = anc.derivedHash;
    anc.contentHash = computeAggregateContentHash(anc, dag.nodes);
    anc.derivedHash = deriveHash(anc, dag.nodes);
    anc.lastComputed = nowISO();
    anc.changed =
      ancestorPreviousContentHash !== anc.contentHash ||
      ancestorPreviousDerivedHash !== anc.derivedHash;
  }

  dag.rootHash = dag.nodes.root?.derivedHash ?? '';
  dag.generatedAt = nowISO();
  dag.changedNodes = Object.values(dag.nodes).filter((item) => item.changed).length;

  return dag;
}

/**
 * Verify the integrity of every node in the DAG.
 *
 * Each node's `derivedHash` must equal `SHA-256(contentHash + sorted(children derivedHashes))`.
 *
 * @param dag  The DAG to verify.
 * @returns A result with an overall `valid` flag and a list of failing node ids.
 */
export function verifyDagIntegrity(dag: MerkleDag): { valid: boolean; failures: string[] } {
  const failures: string[] = [];

  for (const node of Object.values(dag.nodes)) {
    const expected = deriveHash(node, dag.nodes);
    if (node.derivedHash !== expected) {
      failures.push(node.id);
    }
  }

  return { valid: failures.length === deriveZeroValue(), failures };
}
