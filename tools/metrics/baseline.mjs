#!/usr/bin/env node
// tools/metrics/baseline.mjs — Wave 3 #6 baseline metrics.
//
// Mede operações comuns COM e SEM o stack revolucionário.
// Persiste graphify-out/metrics-baseline.json com snapshots datados.
//
//   node tools/metrics/baseline.mjs           # roda tudo
//   node tools/metrics/baseline.mjs --task=X  # roda só uma tarefa

import { argv } from 'node:process';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const OUT = join(ROOT, 'graphify-out', 'metrics-baseline.json');

const TASK_FILTER = argv.find((a) => a.startsWith('--task='))?.split('=')[1];

const tasks = {
  /** Find the emitter of a string literal (the classic "where does X come from"). */
  'find-emitter': {
    description: 'Find the emitter of "autopilot_queue_failed" in the codebase',
    before: async () => {
      // grep -rn
      const t0 = performance.now();
      const out = await captureOutput(['grep', '-rn', "'autopilot_queue_failed'", 'backend/src', 'worker'], { cwd: ROOT });
      return { ms: performance.now() - t0, hits: out.split('\n').filter(Boolean).length, payloadBytes: out.length };
    },
    after: async () => {
      // graphify-plus enriched-graph + jq
      const t0 = performance.now();
      const graph = JSON.parse(await readFile(join(ROOT, 'graphify-out/enriched-graph.json'), 'utf8'));
      const matches = graph.nodes.filter(
        (n) => n.label?.includes('autopilot_queue_failed') || n.id?.includes('autopilot_queue_failed'),
      );
      return { ms: performance.now() - t0, hits: matches.length, payloadBytes: JSON.stringify(matches).length };
    },
  },

  /** Which specs cover a given symbol. */
  'specs-for-symbol': {
    description: 'List specs exercising AutopilotOpsService',
    before: async () => {
      const t0 = performance.now();
      const out = await captureOutput(['grep', '-rln', 'AutopilotOpsService', 'backend/src', 'worker'], { cwd: ROOT });
      const specs = out.split('\n').filter((l) => l.includes('.spec.'));
      return { ms: performance.now() - t0, hits: specs.length };
    },
    after: async () => {
      const t0 = performance.now();
      const graph = JSON.parse(await readFile(join(ROOT, 'graphify-out/enriched-graph.json'), 'utf8'));
      // Find the symbol's file
      const target = graph.nodes.find((n) => n.id === 'nest-provider:AutopilotOpsService');
      const targetFile = target?.file;
      // Find specs whose `exercises` edges point at it
      const specs = targetFile
        ? graph.edges
            .filter((e) => e.kind === 'exercises' && e.target === `file:${targetFile}`)
            .map((e) => e.source)
        : [];
      return { ms: performance.now() - t0, hits: specs.length };
    },
  },

  /** Endpoint blast-radius: how many callsites hit `/marketing/connect/status`? */
  'endpoint-callers': {
    description: 'Find callers of GET /marketing/connect/status',
    before: async () => {
      const t0 = performance.now();
      const out = await captureOutput(['grep', '-rln', '/marketing/connect/status', 'frontend/src', 'backend/src'], { cwd: ROOT });
      return { ms: performance.now() - t0, hits: out.split('\n').filter(Boolean).length };
    },
    after: async () => {
      const t0 = performance.now();
      const graph = JSON.parse(await readFile(join(ROOT, 'graphify-out/enriched-graph.json'), 'utf8'));
      const target = graph.nodes.find(
        (n) => n.type === 'api-endpoint' && n.meta?.route === '/marketing/connect/status',
      );
      const callsites = target
        ? graph.edges.filter((e) => e.kind === 'calls-endpoint' && e.target === target.id).map((e) => e.source)
        : [];
      return { ms: performance.now() - t0, hits: callsites.length };
    },
  },

  /** Lock check for two agents — does L11 actually serialize? */
  'taskgraph-claim-throughput': {
    description: 'Claim+release 50 distinct clusters round-trip',
    after: async () => {
      const t0 = performance.now();
      let ops = 0;
      for (let i = 0; i < 50; i++) {
        const cluster = `bench/cluster-${i}`;
        await captureOutput(['node', 'tools/agent-coordination/taskgraph.mjs', 'claim', cluster, 'bench'], { cwd: ROOT });
        await captureOutput(['node', 'tools/agent-coordination/taskgraph.mjs', 'release', cluster, 'bench'], { cwd: ROOT });
        ops += 2;
      }
      return { ms: performance.now() - t0, ops };
    },
  },

  /** Memory query — what do my saved memories say about Stripe? */
  'memory-search': {
    description: 'Search all memory notes for "Stripe" symbol mentions',
    before: async () => {
      const t0 = performance.now();
      const out = await captureOutput(
        ['grep', '-rln', 'Stripe', `${process.env.HOME}/.claude/projects/-Users-danielpenin-whatsapp-saas/memory`],
        { cwd: ROOT, allowFail: true },
      );
      return { ms: performance.now() - t0, hits: out.split('\n').filter(Boolean).length };
    },
    after: async () => {
      const t0 = performance.now();
      const graph = JSON.parse(await readFile(join(ROOT, 'graphify-out/enriched-graph.json'), 'utf8'));
      const memoryHits = graph.nodes.filter((n) => n.type === 'memory');
      // Find which memory nodes mention Stripe-related symbols
      const stripeMentions = graph.edges.filter(
        (e) =>
          e.kind === 'mentions' &&
          e.target?.includes('Stripe') &&
          memoryHits.find((m) => m.id === e.source),
      );
      return { ms: performance.now() - t0, hits: stripeMentions.length };
    },
  },
};

async function main() {
  const result = {
    timestamp: new Date().toISOString(),
    repo: 'whatsapp_saas',
    tasks: {},
  };

  const taskNames = TASK_FILTER ? [TASK_FILTER] : Object.keys(tasks);

  for (const name of taskNames) {
    const task = tasks[name];
    if (!task) continue;
    console.log(`▸ ${name}: ${task.description}`);
    const entry = { description: task.description };
    if (task.before) {
      console.log(`  before:`);
      entry.before = await task.before();
      console.log(`    ${JSON.stringify(entry.before)}`);
    }
    if (task.after) {
      console.log(`  after:`);
      entry.after = await task.after();
      console.log(`    ${JSON.stringify(entry.after)}`);
    }
    if (entry.before && entry.after) {
      entry.speedup = entry.before.ms / entry.after.ms;
      entry.payload_reduction =
        entry.before.payloadBytes && entry.after.payloadBytes
          ? entry.before.payloadBytes / entry.after.payloadBytes
          : null;
      console.log(`  speedup: ${entry.speedup.toFixed(2)}x`);
    }
    result.tasks[name] = entry;
  }

  // Append to history
  let history = [];
  try {
    history = JSON.parse(await readFile(OUT, 'utf8'));
    if (!Array.isArray(history)) history = [];
  } catch {
    /* first run */
  }
  history.push(result);
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(history, null, 2));
  console.log(`\nappended to ${OUT}`);
  console.log(JSON.stringify(result, null, 2));
}

function captureOutput(argv, { cwd, allowFail = false } = {}) {
  return new Promise((resolve) => {
    let out = '';
    const child = spawn(argv[0], argv.slice(1), { cwd, stdio: ['inherit', 'pipe', 'pipe'] });
    child.stdout?.on('data', (d) => (out += d.toString()));
    child.stderr?.on('data', () => {});
    child.on('exit', (code) => {
      if (code !== 0 && !allowFail) {
        resolve(out); // grep returns 1 when no match; that's OK
      } else resolve(out);
    });
    child.on('error', () => resolve(''));
  });
}

await main();
