import type { MerkleDag, MerkleNode, MerkleProof } from '../../types.merkle-cache';
import { computeSha256, deriveHash } from './internal-helpers';

export function buildParentMap(nodes: Record<string, MerkleNode>): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const node of Object.values(nodes)) {
    for (const childId of node.children) {
      const parents = map.get(childId) ?? [];
      parents.push(node.id);
      map.set(childId, parents);
    }
  }
  return map;
}

export function addAncestors(
  nodeId: string,
  parentMap: Map<string, string[]>,
  affected: Set<string>,
): void {
  const parents = parentMap.get(nodeId);
  if (!parents) return;
  for (const parentId of parents) {
    if (!affected.has(parentId)) {
      affected.add(parentId);
      addAncestors(parentId, parentMap, affected);
    }
  }
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

  return { valid: failures.length === 0, failures };
}

/**
 * Generate a Merkle proof for a node, allowing verification of its inclusion
 * in the DAG without requiring the full tree.
 *
 * The proof collects sibling derived hashes, parent content hashes, and
 * sibling counts per level so an external verifier can recompute the root.
 *
 * @param dag     The current Merkle DAG.
 * @param nodeId  The id of the node to prove inclusion for.
 * @returns A {@link MerkleProof} or null if the node doesn't exist.
 */
export function generateProof(dag: MerkleDag, nodeId: string): MerkleProof | null {
  const node = dag.nodes[nodeId];
  if (!node) return null;

  const parentMap = buildParentMap(dag.nodes);
  const proofPath: string[] = [nodeId];
  const siblingHashes: string[] = [];
  const siblingCounts: number[] = [];
  const parentContentHashes: string[] = [];

  let currentId = nodeId;

  while (true) {
    const parents = parentMap.get(currentId);
    if (!parents || parents.length === 0) break;

    const parentId = parents[0];
    const parent = dag.nodes[parentId];
    if (!parent) break;

    const siblings = parent.children
      .filter((c) => c !== currentId)
      .map((c) => dag.nodes[c]?.derivedHash ?? '')
      .filter(Boolean)
      .sort();

    siblingHashes.push(...siblings);
    siblingCounts.push(siblings.length);
    parentContentHashes.push(parent.contentHash);
    proofPath.push(parentId);
    currentId = parentId;
  }

  return {
    nodeId,
    contentHash: node.contentHash,
    derivedHash: node.derivedHash,
    siblingHashes,
    siblingCounts,
    parentContentHashes,
    proofPath,
  };
}

/**
 * Verify a {@link MerkleProof} against a root hash.
 *
 * Reconstructs the root `derivedHash` level-by-level from the leaf up.
 * At each proof level, combines the current `derivedHash` with the level's
 * sibling hashes and parent content hash to produce the parent's `derivedHash`.
 *
 * @param proof      The proof to verify.
 * @param rootHash   The expected root hash.
 * @returns Whether the proof is valid.
 */
export function verifyProof(proof: MerkleProof, rootHash: string): boolean {
  if (proof.proofPath.length === 0) return false;
  if (proof.proofPath.length === 1) {
    return proof.derivedHash === rootHash;
  }

  let resultHash = proof.derivedHash;
  let cursor = 0;

  for (let level = 0; level < proof.proofPath.length - 1; level++) {
    const siblingCount = proof.siblingCounts[level] ?? 0;
    const parentContentHash = proof.parentContentHashes[level] ?? '';

    const childHashes = [resultHash];
    for (let s = 0; s < siblingCount; s++) {
      childHashes.push(proof.siblingHashes[cursor] ?? '');
      cursor++;
    }

    const sortedChildHashes = childHashes.filter(Boolean).sort().join('');
    resultHash = computeSha256(parentContentHash + sortedChildHashes);
  }

  return resultHash === rootHash;
}
