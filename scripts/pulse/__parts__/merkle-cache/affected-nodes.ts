import type { MerkleDag, MerkleNode } from '../../types.merkle-cache';

function buildParentMap(nodes: Record<string, MerkleNode>): Map<string, string[]> {
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

function addAncestors(
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
 * Return the set of all node ids affected by a change anywhere in the DAG.
 *
 * Includes leaf nodes marked as `changed` plus every ancestor whose
 * `derivedHash` would shift as a result (cascade).
 *
 * @param dag  The current Merkle DAG.
 * @returns Sorted array of affected node ids.
 */
export function computeChangedNodes(dag: MerkleDag): string[] {
  const affected = new Set<string>();
  const parentMap = buildParentMap(dag.nodes);

  for (const node of Object.values(dag.nodes)) {
    if (node.changed) {
      affected.add(node.id);
      addAncestors(node.id, parentMap, affected);
    }
    if (node.kind === 'file') {
      for (const depId of node.dependsOn) {
        const dep = dag.nodes[depId];
        if (dep?.changed) {
          affected.add(node.id);
          addAncestors(node.id, parentMap, affected);
        }
      }
    }
  }

  return Array.from(affected).sort();
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
