import type { MerkleDag, MerkleProof } from '../../types.merkle-cache';
import {
  deriveZeroValue,
  deriveUnitValue,
} from '../../dynamic-reality-kernel/__parts__/catalog-arithmetic';
import { computeSha256 } from './core';
import { buildParentMap } from './dag-graph';

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
    if (!parents || parents.length === deriveZeroValue()) break;

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
  if (proof.proofPath.length === deriveZeroValue()) return false;
  if (proof.proofPath.length === deriveUnitValue()) {
    return proof.derivedHash === rootHash;
  }

  let resultHash = proof.derivedHash;
  let cursor = 0;

  for (let level = 0; level < proof.proofPath.length - deriveUnitValue(); level++) {
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
