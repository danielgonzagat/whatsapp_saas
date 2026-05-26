#!/usr/bin/env node
// extractors/bullmq.mjs
//
// Determinístico — sem LLM. Lê backend/src/** + worker/** e detecta:
//   • Queue declarations:  new Queue('autopilot-jobs', ...)  ou lazyQueue('autopilot-jobs')
//   • Producers:           queue.add('job-name', ...)        ou autopilotQueue.add(...)
//   • Workers/consumers:   new Worker('autopilot-jobs', handler)
//
// Emite nodes (queue, worker) + edges (producer→queue, queue→worker).
// Resolve a maioria das relações dinâmicas que o AST puro do graphify perde.

import { argv } from 'node:process';
import { collect, readCapped, rel } from '../lib/scan.mjs';
import { makeShard, addNode, addEdge, writeShard, nid } from '../lib/graph.mjs';

const ROOT = argv[2] || process.cwd();
const OUT = argv[3] || `${ROOT}/graphify-out/shards/bullmq.json`;

const QUEUE_DECL = /\b(?:new\s+(?:Bull)?Queue|lazyQueue|getOrCreateQueue)\s*\(\s*['"`]([\w@\-:.]+)['"`]/g;
const QUEUE_VAR_EXPORT = /export\s+const\s+([a-zA-Z_$][\w$]*)\s*=\s*(?:lazyQueue|new\s+(?:Bull)?Queue)\s*\(\s*['"`]([\w@\-:.]+)['"`]/g;
const QUEUE_ADD = /\b([a-zA-Z_$][\w$]*Queue)\.add\s*\(\s*['"`]([\w@\-:.]+)['"`]/g;
const WORKER_DECL = /\bnew\s+(?:Bull)?Worker\s*\(\s*['"`]([\w@\-:.]+)['"`]/g;
const PROCESS_DECL = /\b([a-zA-Z_$][\w$]*Queue)\.process\s*\(\s*['"`]?([\w@\-:.]*)['"`]?/g;

async function main() {
  const shard = makeShard();

  const files = [
    ...await collect(`${ROOT}/backend/src`, (_p, n) => /\.(ts|mts|cts|js|mjs|cjs)$/.test(n)),
    ...await collect(`${ROOT}/worker`, (_p, n) => /\.(ts|mts|cts|js|mjs|cjs)$/.test(n)),
  ];

  // Pass 1: discover queues + map varName → queueName per-file.
  const varToQueue = new Map(); // key=`${file}:${varName}`, value=queueName
  const queuesSeen = new Set();

  for (const file of files) {
    const src = await readCapped(file);
    if (!src) continue;
    const relPath = rel(file, ROOT);

    // export const fooQueue = lazyQueue('foo-jobs')
    for (const m of src.matchAll(QUEUE_VAR_EXPORT)) {
      const [, varName, queueName] = m;
      varToQueue.set(`${relPath}:${varName}`, queueName);
      registerQueue(shard, queueName, relPath, lineOf(src, m.index), queuesSeen);
    }

    // bare declarations (no var binding)
    for (const m of src.matchAll(QUEUE_DECL)) {
      const queueName = m[1];
      registerQueue(shard, queueName, relPath, lineOf(src, m.index), queuesSeen);
    }
  }

  // Pass 2: producers + consumers.
  for (const file of files) {
    const src = await readCapped(file);
    if (!src) continue;
    const relPath = rel(file, ROOT);

    // Producer: <fooQueue>.add('job-name', ...)
    for (const m of src.matchAll(QUEUE_ADD)) {
      const [, varName, jobName] = m;
      const queueName = resolveVarToQueue(varToQueue, relPath, varName) || varName;
      const producerId = nid('producer', relPath, `${varName}.add(${jobName})`);
      addNode(shard, {
        id: producerId,
        label: `${varName}.add('${jobName}')`,
        type: 'queue-producer',
        file: relPath,
        line: lineOf(src, m.index),
        meta: { jobName, varName, queueName },
      });
      addEdge(shard, producerId, nid('queue', queueName), 'enqueues');
    }

    // Worker: new Worker('queue-name', handler)
    for (const m of src.matchAll(WORKER_DECL)) {
      const [, queueName] = m;
      const workerId = nid('worker', relPath, queueName);
      addNode(shard, {
        id: workerId,
        label: `Worker(${queueName})`,
        type: 'queue-consumer',
        file: relPath,
        line: lineOf(src, m.index),
        meta: { queueName },
      });
      registerQueue(shard, queueName, relPath, lineOf(src, m.index), queuesSeen);
      addEdge(shard, nid('queue', queueName), workerId, 'consumed-by');
    }

    // <fooQueue>.process(name, handler) — legacy bullmq-style
    for (const m of src.matchAll(PROCESS_DECL)) {
      const [, varName, jobName] = m;
      const queueName = resolveVarToQueue(varToQueue, relPath, varName) || varName;
      const consumerId = nid('processor', relPath, `${varName}.process(${jobName || '*'})`);
      addNode(shard, {
        id: consumerId,
        label: `${varName}.process(${jobName || '*'})`,
        type: 'queue-consumer',
        file: relPath,
        line: lineOf(src, m.index),
        meta: { jobName: jobName || '*', varName, queueName },
      });
      addEdge(shard, nid('queue', queueName), consumerId, 'consumed-by');
    }
  }

  await writeShard(shard, OUT);
  console.log(`[bullmq] wrote ${OUT} — ${shard.nodes.length} nodes, ${shard.edges.length} edges`);
  console.log(`[bullmq] stats: ${JSON.stringify(shard.stats)}`);
}

function registerQueue(shard, queueName, file, line, seen) {
  const id = nid('queue', queueName);
  if (seen.has(id)) return;
  seen.add(id);
  addNode(shard, {
    id,
    label: `queue:${queueName}`,
    type: 'queue',
    file,
    line,
    meta: { queueName },
  });
}

function resolveVarToQueue(map, file, varName) {
  // Try same-file first, then any file that exports the var.
  return (
    map.get(`${file}:${varName}`) ||
    [...map.entries()].find(([k]) => k.endsWith(`:${varName}`))?.[1] ||
    null
  );
}

function lineOf(src, idx) {
  return src.slice(0, idx).split('\n').length;
}

await main();
