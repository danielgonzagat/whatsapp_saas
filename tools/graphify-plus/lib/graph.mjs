// tools/graphify-plus/lib/graph.mjs — neutral graph shape used by every extractor.
//
// Each extractor emits the same JSON: { nodes: [...], edges: [...] }.
// The orchestrator merges every shard into the enriched graph.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

/**
 * @typedef {{ id: string, label: string, type: string, file?: string, line?: number, meta?: object }} Node
 * @typedef {{ source: string, target: string, kind: string, meta?: object }} Edge
 */

export function makeShard() {
  /** @type {{ nodes: Node[], edges: Edge[], stats: Record<string, number> }} */
  return { nodes: [], edges: [], stats: {} };
}

export function addNode(shard, node) {
  if (!node.id) throw new Error('node.id required');
  shard.nodes.push(node);
  shard.stats[`nodes:${node.type}`] = (shard.stats[`nodes:${node.type}`] || 0) + 1;
}

export function addEdge(shard, source, target, kind, meta) {
  if (!source || !target) return;
  shard.edges.push({ source, target, kind, ...(meta ? { meta } : {}) });
  shard.stats[`edges:${kind}`] = (shard.stats[`edges:${kind}`] || 0) + 1;
}

export async function writeShard(shard, file) {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(shard, null, 2));
}

export async function readShard(file) {
  try {
    const raw = await readFile(file, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** ID factory: type-prefixed, slash-separated, no spaces. */
export function nid(type, ...parts) {
  return `${type}:${parts.filter(Boolean).join('/').replace(/\s+/g, '_')}`;
}
