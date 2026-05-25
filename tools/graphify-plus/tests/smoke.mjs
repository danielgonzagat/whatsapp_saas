#!/usr/bin/env node
// Smoke test — runs every extractor + merge against the live repo and asserts
// minimum non-empty output. No external network calls (skips runtime-railway).

import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..', '..');

let failed = 0;

function assertGte(actual, min, label) {
  if (actual >= min) {
    console.log(`  ok   ${label}: ${actual} ≥ ${min}`);
  } else {
    console.error(`  FAIL ${label}: ${actual} < ${min}`);
    failed++;
  }
}

function run(args, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', args, { cwd: ROOT, env: { ...process.env, ...env }, stdio: 'inherit' });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`exit ${code}`))));
  });
}

async function main() {
  console.log('▸ running extractors (fast path)');
  await run(['tools/graphify-plus/run.mjs', '--fast']);

  console.log('▸ asserting enriched graph');
  const enriched = JSON.parse(await readFile(join(ROOT, 'graphify-out/enriched-graph.json'), 'utf8'));
  const hasCodeGraphBase = (enriched.meta?.baseNodes ?? 0) > 0;
  if (hasCodeGraphBase) {
    assertGte(enriched.nodes.length, 80_000, 'enriched.nodes (base + shards)');
    assertGte(enriched.edges.length, 150_000, 'enriched.edges (base links + shard edges)');
  } else {
    assertGte(enriched.nodes.length, 3_500, 'enriched.nodes (shards-only mode)');
    assertGte(enriched.edges.length, 20_000, 'enriched.edges (shards-only mode)');
  }
  assertGte(Object.keys(enriched.shards).length, 8, 'shards merged');

  console.log('▸ asserting bullmq shard');
  const bullmq = JSON.parse(await readFile(join(ROOT, 'graphify-out/shards/bullmq.json'), 'utf8'));
  assertGte(bullmq.nodes.filter((n) => n.type === 'queue').length, 5, 'queues discovered');
  assertGte(bullmq.nodes.filter((n) => n.type === 'queue-consumer').length, 5, 'consumers discovered');
  assertGte(bullmq.edges.filter((e) => e.kind === 'enqueues').length, 10, 'enqueue edges');

  console.log('▸ asserting nestjs shard');
  const nest = JSON.parse(await readFile(join(ROOT, 'graphify-out/shards/nestjs.json'), 'utf8'));
  assertGte(nest.nodes.filter((n) => n.type === 'nest-controller').length, 50, 'controllers');
  assertGte(nest.nodes.filter((n) => n.type === 'nest-module').length, 50, 'modules');
  assertGte(nest.edges.filter((e) => e.kind === 'injects').length, 200, 'DI injects');

  console.log('▸ asserting nextjs shard');
  const next = JSON.parse(await readFile(join(ROOT, 'graphify-out/shards/nextjs.json'), 'utf8'));
  assertGte(next.nodes.filter((n) => n.type === 'next-page').length, 50, 'pages');
  assertGte(next.nodes.filter((n) => n.type === 'next-route').length, 20, 'API routes');

  console.log('▸ asserting api-contract shard');
  const api = JSON.parse(await readFile(join(ROOT, 'graphify-out/shards/api-contract.json'), 'utf8'));
  assertGte(api.nodes.filter((n) => n.type === 'api-endpoint').length, 200, 'endpoints');
  assertGte(api.edges.filter((e) => e.kind === 'calls-endpoint').length, 100, 'cross-repo links');

  console.log('▸ asserting metadata shard');
  const meta = JSON.parse(await readFile(join(ROOT, 'graphify-out/shards/metadata.json'), 'utf8'));
  assertGte(meta.nodes.filter((n) => n.type === 'memory').length, 50, 'memory notes indexed');
  assertGte(meta.nodes.filter((n) => n.type === 'adr').length, 1, 'ADRs indexed');
  assertGte(meta.edges.filter((e) => e.kind === 'mentions').length, 500, 'symbol mentions');

  console.log('▸ asserting test-impact shard (L8)');
  try {
    const ti = JSON.parse(await readFile(join(ROOT, 'graphify-out/shards/test-impact.json'), 'utf8'));
    assertGte(ti.nodes.filter((n) => n.type === 'spec').length, 100, 'specs indexed');
    assertGte(ti.edges.filter((e) => e.kind === 'exercises').length, 50, 'spec→symbol exercises edges');
  } catch (e) {
    console.error(`  FAIL test-impact: ${e.message}`);
    failed++;
  }

  console.log('▸ smoke-testing edit-by-graph');
  await run(['tools/graphify-plus/lib/edit-by-graph.mjs', 'deps', 'AutopilotOpsService']);

  console.log('▸ smoke-testing taskgraph lock (L11)');
  await run(['tools/agent-coordination/taskgraph.mjs', 'claim', 'test-cluster-smoke', 'smoke-test']);
  await run(['tools/agent-coordination/taskgraph.mjs', 'release', 'test-cluster-smoke', 'smoke-test']);

  console.log(failed === 0 ? '\n✓ ALL SMOKE TESTS PASSED' : `\n✗ ${failed} ASSERTIONS FAILED`);
  process.exit(failed === 0 ? 0 : 1);
}

await main();
