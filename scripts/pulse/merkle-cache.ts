import { createHash } from 'crypto';
import { readFileSync, statSync } from 'fs';
import * as path from 'path';
import type { MerkleDag, MerkleNode, MerkleProof } from './types.merkle-cache';
import { ensureDir, pathExists, readDir, readJsonFile, writeTextFile } from './safe-fs';
import { normalizePath } from './scope-state.codacy';

const CACHE_DIR = '.pulse/cache';
const DAG_FILE = 'merkle-dag.json';

const SKIP_PATTERNS = ['node_modules', 'dist', '.next', '.git', '.pulse'];

interface BuildMerkleDagOptions {
  changedFilePaths?: string[];
}

interface FileHashResult {
  contentHash: string;
  reused: boolean;
}

function walkDir(dir: string, rootDir: string): string[] {
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

function computeSha256(content: string | Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}

function deriveHash(node: MerkleNode, nodes: Record<string, MerkleNode>): string {
  const childHashes = node.children
    .map((id) => nodes[id]?.derivedHash ?? '')
    .filter(Boolean)
    .sort()
    .join('');
  return computeSha256(node.contentHash + childHashes);
}

function nowISO(): string {
  return new Date().toISOString();
}

/**
 * Build (or rebuild) the Merkle DAG for the repo rooted at `rootDir`.
 *
 * Walks every file (excluding node_modules, dist, .next, .git, .pulse),
 * computes SHA-256 content hashes, compares against a previously-cached DAG,
 * and builds capability/flow nodes from the optional `structuralGraph`.
 *
 * @param rootDir  Absolute path to the repo root.
 * @param structuralGraph  Optional structural graph with nodes and edges that
 *   describe capabilities and flows. Each node has an `id`, a `file` path
 *   relative to `rootDir`, and a human-readable `label`. Edges describe
 *   imports/dependencies between nodes.
 * @returns A fully computed `MerkleDag`.
 */
export function buildMerkleDag(
  rootDir: string,
  structuralGraph?: {
    nodes: Array<{ id: string; file: string; label: string }>;
    edges: Array<{ from: string; to: string }>;
  },
  options: BuildMerkleDagOptions = {},
): MerkleDag {
  const cacheDir = path.join(rootDir, CACHE_DIR);
  ensureDir(cacheDir, { recursive: true });

  const dagPath = path.join(cacheDir, DAG_FILE);
  const prevDag: MerkleDag | null = pathExists(dagPath) ? readJsonFile<MerkleDag>(dagPath) : null;

  const prevNodes = prevDag?.nodes ?? {};
  const nodes: Record<string, MerkleNode> = {};
  let changedCount = 0;
  const changedFileSet = normalizeChangedFileSet(rootDir, options.changedFilePaths ?? []);

  const filePaths = walkDir(rootDir, rootDir).sort();

  for (const relPath of filePaths) {
    const absPath = path.join(rootDir, relPath);
    const fileHash = computeFileHash(absPath, relPath, prevNodes, changedFileSet);
    if (!fileHash) {
      continue;
    }

    const prev = prevNodes[relPath];
    const changed = !prev || prev.contentHash !== fileHash.contentHash;

    nodes[relPath] = {
      id: relPath,
      kind: 'file',
      contentHash: fileHash.contentHash,
      derivedHash: '', // computed bottom-up later
      children: [],
      dependsOn: [],
      lastComputed: fileHash.reused && prev ? prev.lastComputed : nowISO(),
      changed,
    };

    if (changed) changedCount++;
  }

  if (structuralGraph) {
    const graphNodeMap = new Map<string, (typeof structuralGraph.nodes)[0]>();
    for (const node of structuralGraph.nodes) {
      graphNodeMap.set(node.id, node);
    }

    for (const edge of structuralGraph.edges) {
      const fromNode = nodes[edge.from];
      const toNode = nodes[edge.to];
      if (fromNode && toNode) {
        fromNode.dependsOn.push(edge.to);
      }
    }

    const capabilityGroups = new Map<string, string[]>();
    for (const graphNode of structuralGraph.nodes) {
      const fileNode = nodes[graphNode.file];
      if (!fileNode) continue;

      const capId = `cap:${graphNode.id}`;
      if (!capabilityGroups.has(capId)) {
        capabilityGroups.set(capId, []);
      }
      capabilityGroups.get(capId)!.push(graphNode.file);
    }

    const capEntries = Array.from(capabilityGroups.entries());
    for (const [capId, fileIds] of capEntries) {
      const childHashes = fileIds
        .map((id) => nodes[id]?.contentHash ?? '')
        .filter(Boolean)
        .sort()
        .join('');
      const contentHash = computeSha256(childHashes);

      const prev = prevNodes[capId];
      const changed = !prev || prev.contentHash !== contentHash;

      nodes[capId] = {
        id: capId,
        kind: 'capability',
        contentHash,
        derivedHash: '',
        children: fileIds,
        dependsOn: [],
        lastComputed: nowISO(),
        changed,
      };

      if (changed) changedCount++;
    }

    const capNodes = Object.values(nodes).filter((n) => n.kind === 'capability');
    const flowId = 'flow:main';
    const childIds = capNodes.map((n) => n.id);
    const childHashes = childIds
      .map((id) => nodes[id]?.contentHash ?? '')
      .filter(Boolean)
      .sort()
      .join('');
    const flowContentHash = computeSha256(childHashes);

    {
      const prev = prevNodes[flowId];
      const changed = !prev || prev.contentHash !== flowContentHash;

      nodes[flowId] = {
        id: flowId,
        kind: 'flow',
        contentHash: flowContentHash,
        derivedHash: '',
        children: childIds,
        dependsOn: [],
        lastComputed: nowISO(),
        changed,
      };

      if (changed) changedCount++;
    }
  }

  const rootId = 'root';
  {
    let rootChildren: string[];
    if (structuralGraph) {
      rootChildren = ['flow:main'];
    } else {
      rootChildren = filePaths;
    }

    const rootChildHashes = rootChildren
      .map((id) => nodes[id]?.contentHash ?? '')
      .filter(Boolean)
      .sort()
      .join('');
    const rootContentHash = computeSha256(rootChildHashes);

    const prev = prevNodes[rootId];
    const changed = !prev || prev.contentHash !== rootContentHash;

    nodes[rootId] = {
      id: rootId,
      kind: 'graph_root',
      contentHash: rootContentHash,
      derivedHash: '',
      children: rootChildren,
      dependsOn: [],
      lastComputed: nowISO(),
      changed,
    };

    if (changed) changedCount++;
  }

  const sortedIds = topologicalSort(nodes);

  for (const id of sortedIds) {
    nodes[id].derivedHash = deriveHash(nodes[id], nodes);
  }

  const dag: MerkleDag = {
    generatedAt: nowISO(),
    rootHash: nodes[rootId]?.derivedHash ?? '',
    totalNodes: Object.keys(nodes).length,
    changedNodes: changedCount,
    nodes,
  };

  writeTextFile(dagPath, JSON.stringify(dag, null, 2));

  const currentDir = path.join(rootDir, '.pulse', 'current');
  ensureDir(currentDir, { recursive: true });
  const currentPath = path.join(currentDir, 'PULSE_MERKLE_CACHE.json');
  writeTextFile(currentPath, JSON.stringify(dag, null, 2));

  return dag;
}

function normalizeChangedFileSet(rootDir: string, changedFilePaths: string[]): Set<string> {
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

function computeFileHash(
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

function topologicalSort(nodes: Record<string, MerkleNode>): string[] {
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
