/** Merkle DAG incremental computation types for PULSE caching layer. */

export interface MerkleNode {
  /** Unique identifier — file path, capability id, flow id, or 'root'. */
  id: string;
  /** Node category: file leaf, capability group, flow group, or synthetic root. */
  kind: 'file' | 'capability' | 'flow' | 'graph_root';
  /** SHA-256 of its raw content (file bytes or serialized capability/flow data). */
  contentHash: string;
  /** SHA-256 of `contentHash` concatenated with the sorted derived hashes of all children. */
  derivedHash: string;
  /** Child node ids — the structural tree (capability contains files, flow contains capabilities). */
  children: string[];
  /** Node ids this node depends on that are NOT its direct children (cross-cutting deps). */
  dependsOn: string[];
  /** ISO-8601 timestamp of the last computation. */
  lastComputed: string;
  /** Whether the content changed since the last Merkle DAG build. */
  changed: boolean;
}

export interface MerkleProof {
  /** Id of the node being proven. */
  nodeId: string;
  /** Content hash of the node being proven. */
  contentHash: string;
  /** Derived hash of the node being proven. */
  derivedHash: string;
  /**
   * Sibling derived hashes needed to reconstruct the path to root.
   * Flat array; slices are defined by `siblingCounts`.
   */
  siblingHashes: string[];
  /** Number of sibling hashes per proof level (from leaf parent to root). */
  siblingCounts: number[];
  /**
   * Content hash of each parent node along the proof path
   * (index 0 = parent of the proven node, last = root).
   */
  parentContentHashes: string[];
  /** Ordered path from this leaf to the root (inclusive). */
  proofPath: string[];
}

export interface MerkleDag {
  /** ISO-8601 timestamp of DAG generation. */
  generatedAt: string;
  /** Derived hash of the root node. */
  rootHash: string;
  /** Total number of nodes in this DAG. */
  totalNodes: number;
  /** Count of nodes where `changed` is true. */
  changedNodes: number;
  /** All nodes keyed by id. */
  nodes: Record<string, MerkleNode>;
}
