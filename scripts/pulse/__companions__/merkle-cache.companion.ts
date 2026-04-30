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

function computeAggregateContentHash(node: MerkleNode, nodes: Record<string, MerkleNode>): string {
  const childHashes = node.children
    .map((id) => nodes[id]?.contentHash ?? '')
    .filter(Boolean)
    .sort()
    .join('');
  return computeSha256(childHashes);
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
 * Given a list of changed file paths (relative to the repo root), walk up
 * the DAG to enumerate every capability, flow, and artifact node that depends
 * on those files and therefore needs recomputation.
 *
 * @param dag              The current Merkle DAG.
 * @param changedFilePaths  File paths that changed (relative to rootDir).
 * @returns Sorted array of affected artifact node ids (capability, flow, graph_root).
 */
export function getAffectedArtifacts(dag: MerkleDag, changedFilePaths: string[]): string[] {
  const affected = new Set<string>();
  const parentMap = buildParentMap(dag.nodes);

  for (const filePath of changedFilePaths) {
    const fileNode = dag.nodes[filePath];
    if (!fileNode) continue;

    affected.add(fileNode.id);
    addAncestors(fileNode.id, parentMap, affected);
  }

  return Array.from(affected)
    .filter((id) => {
      const node = dag.nodes[id];
      return (
        node && (node.kind === 'capability' || node.kind === 'flow' || node.kind === 'graph_root')
      );
    })
    .sort();
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

