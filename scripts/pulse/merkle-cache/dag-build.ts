import * as path from 'path';
import type { MerkleDag, MerkleNode } from '../types.merkle-cache';
import { discoverAllObservedArtifactFilenames } from '../dynamic-reality-kernel/token-evidence';
import { ensureDir, pathExists, readJsonFile, writeTextFile } from '../safe-fs';
import {
  CACHE_DIR,
  DAG_FILE,
  MERKLE_CAP_KIND,
  MERKLE_FILE_KIND,
  MERKLE_FLOW_KIND,
  MERKLE_ROOT_KIND,
  walkDir,
  computeSha256,
  computeFileHash,
  nowISO,
  deriveHash,
  normalizeChangedFileSet,
  topologicalSort,
  type BuildMerkleDagOptions,
} from './core';

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
      kind: MERKLE_FILE_KIND,
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
        kind: MERKLE_CAP_KIND,
        contentHash,
        derivedHash: '',
        children: fileIds,
        dependsOn: [],
        lastComputed: nowISO(),
        changed,
      };

      if (changed) changedCount++;
    }

    const capNodes = Object.values(nodes).filter((n) => n.kind === MERKLE_CAP_KIND);
    const flowId = `flow:main`;
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
        kind: MERKLE_FLOW_KIND,
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
      kind: MERKLE_ROOT_KIND,
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
  const merkleCacheFilename =
    discoverAllObservedArtifactFilenames().merkleCache || 'PULSE_MERKLE_CACHE.json';
  const currentPath = path.join(currentDir, merkleCacheFilename);
  writeTextFile(currentPath, JSON.stringify(dag, null, 2));

  return dag;
}
