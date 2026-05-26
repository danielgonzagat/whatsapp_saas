#!/usr/bin/env node
// tools/test-affected/run.mjs — Wave 4: run only the specs affected by changed files.
//
// CLI:
//   node tools/test-affected/run.mjs            # uses `git diff` (uncommitted + staged)
//   node tools/test-affected/run.mjs --base=main  # uses `git diff main...HEAD`
//   node tools/test-affected/run.mjs --files=a.ts,b.ts  # explicit list
//   node tools/test-affected/run.mjs --dry-run   # print specs only, don't run
//
// Resolution: enriched-graph.json's `exercises` edges (spec → file). Spec is
// considered affected when:
//   1) the changed file is directly imported by it
//   2) OR any symbol DECLARED in the spec's file mentions it (transitive 1-hop)

import { argv } from 'node:process';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const DRY = argv.includes('--dry-run');
const BASE = argv.find((a) => a.startsWith('--base='))?.split('=')[1];
const FILES_ARG = argv.find((a) => a.startsWith('--files='))?.split('=')[1];

async function main() {
  const graph = JSON.parse(await readFile(join(ROOT, 'graphify-out/enriched-graph.json'), 'utf8'));

  const changed = FILES_ARG
    ? FILES_ARG.split(',')
    : (await gitDiff(BASE)).filter((f) => /\.(ts|tsx|mts|cts|js|mjs|cjs|jsx)$/.test(f));

  if (changed.length === 0) {
    console.log('[test-affected] no changed files — nothing to run');
    return;
  }
  console.log(`[test-affected] changed files: ${changed.length}`);

  // For each changed file, find specs whose `exercises` edges point at it.
  const specs = new Set();
  for (const file of changed) {
    const target = `file:${file}`;
    for (const e of graph.edges) {
      if (e.kind === 'exercises' && e.target === target) {
        const specNode = graph.nodes.find((n) => n.id === e.source);
        if (specNode?.file) specs.add(specNode.file);
      }
    }
  }
  console.log(`[test-affected] resolved ${specs.size} affected spec(s)`);

  if (specs.size === 0) {
    console.log('[test-affected] no specs found — exiting');
    return;
  }

  if (DRY) {
    console.log([...specs].sort().join('\n'));
    return;
  }

  // Group by workspace (backend/frontend/worker/tools) and dispatch vitest.
  const byWs = {};
  for (const s of specs) {
    const ws = s.split('/')[0];
    (byWs[ws] ||= []).push(s);
  }
  for (const [ws, files] of Object.entries(byWs)) {
    console.log(`[test-affected] ${ws}: ${files.length} specs`);
    const relFiles = files.map((f) => f.slice(ws.length + 1));
    await runShell(`cd ${ws} && npx vitest run ${relFiles.map(quote).join(' ')}`);
  }
}

function gitDiff(base) {
  return new Promise((resolve) => {
    const args = base ? ['diff', '--name-only', `${base}...HEAD`] : ['diff', '--name-only', 'HEAD'];
    const child = spawn('git', args, { cwd: ROOT, stdio: ['inherit', 'pipe', 'pipe'] });
    let out = '';
    child.stdout?.on('data', (d) => (out += d.toString()));
    child.on('exit', () => resolve(out.split('\n').filter(Boolean)));
    child.on('error', () => resolve([]));
  });
}

function runShell(cmd) {
  return new Promise((resolve, reject) => {
    const child = spawn('bash', ['-lc', cmd], { cwd: ROOT, stdio: 'inherit' });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`exit ${code}`))));
    child.on('error', reject);
  });
}

function quote(s) {
  return /[\s"]/.test(s) ? `'${s}'` : s;
}

await main();
