import * as path from 'path';
import { readFileSync } from 'fs';
import type { MerkleDag, MerkleNode } from '../../types.merkle-cache';
import { computeSha256, deriveHash, nowISO } from './internal-helpers';
import { buildParentMap, addAncestors } from './verification-proofs';

function computeAggregateContentHash(node: MerkleNode, nodes: Record<string, MerkleNode>): string {
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

  if (node.kind === 'file') {
    try {
      const raw = readFileSync(rootDir ? path.join(rootDir, node.id) : node.id);
      node.contentHash = computeSha256(raw);
    } catch {
      node.contentHash = '';
    }
  }

  if (node.kind === 'capability' || node.kind === 'flow' || node.kind === 'graph_root') {
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

  dag.rootHash = dag.nodes['root']?.derivedHash ?? '';
  dag.generatedAt = nowISO();
  dag.changedNodes = Object.values(dag.nodes).filter((item) => item.changed).length;

  return dag;
}
