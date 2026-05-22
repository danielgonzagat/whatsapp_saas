#!/usr/bin/env node
// tools/hooks/pre-commit-claim-check.mjs — Wave 3 #2 + #4 coreography.
//
// Designed to be invoked from .husky/pre-commit or .git/hooks/pre-commit.
//
// Behavior:
//   • Reads staged files via `git diff --cached --name-only`
//   • Resolves cluster IDs from graphify-out/enriched-graph.json (best-effort)
//   • Checks .claude/task-graph.json — every cluster touched by staged files
//     MUST have an active claim, OR the env $AGENT_NAME must own it.
//   • If TASK_GRAPH_STRICT=1 → fail commit on unclaimed clusters.
//   • Otherwise → warn but allow (default).
//
// Opt-out: set TASK_GRAPH_BYPASS=1 (logged to graphify-out/hooks.log).
//
// Cluster derivation: file belongs to cluster `<repo>/<top-dir>/<symbol-or-second-segment>`.
// Example: backend/src/autopilot/foo.ts → whatsapp_saas/backend/autopilot
//          frontend/src/components/kloel/marketing/MarketingView.tsx
//            → whatsapp_saas/frontend/marketing

import { readFile, appendFile, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const TASK_GRAPH = join(ROOT, '.claude', 'task-graph.json');
const LOG = join(ROOT, 'graphify-out', 'hooks.log');

const STRICT = process.env.TASK_GRAPH_STRICT === '1';
const BYPASS = process.env.TASK_GRAPH_BYPASS === '1';
const AGENT = process.env.AGENT_NAME || 'unknown-agent';

async function main() {
  if (BYPASS) {
    await logLine(`bypass agent=${AGENT}`);
    process.exit(0);
  }

  const staged = await capture(['git', 'diff', '--cached', '--name-only']);
  const files = staged.split('\n').filter(Boolean);
  if (files.length === 0) process.exit(0);

  let locks = { locks: {} };
  try {
    locks = JSON.parse(await readFile(TASK_GRAPH, 'utf8'));
  } catch {
    /* no locks yet */
  }

  const clusters = new Set(files.map(clusterFor));
  const unclaimed = [];
  const conflicts = [];

  for (const cluster of clusters) {
    const lock = locks.locks?.[cluster];
    if (!lock) {
      unclaimed.push(cluster);
    } else if (lock.agent !== AGENT && Date.now() - lock.heartbeatAt <= 30 * 60 * 1000) {
      conflicts.push({ cluster, holder: lock.agent });
    }
  }

  if (conflicts.length > 0) {
    console.error('[pre-commit-claim-check] CONFLICT:');
    for (const c of conflicts) {
      console.error(`  • ${c.cluster} held by ${c.holder} (you are ${AGENT})`);
    }
    console.error('To proceed, coordinate with the holder or wait for expiry. Set AGENT_NAME=<you>.');
    await logLine(`conflict agent=${AGENT} clusters=${conflicts.map((c) => c.cluster).join(',')}`);
    process.exit(STRICT ? 1 : 0);
  }

  if (unclaimed.length > 0) {
    const msg = `[pre-commit-claim-check] WARN: ${unclaimed.length} cluster(s) unclaimed: ${unclaimed.join(', ')}`;
    console.error(msg);
    console.error(`Hint: npm run agent:claim ${unclaimed[0]} ${AGENT}`);
    await logLine(`unclaimed agent=${AGENT} clusters=${unclaimed.join(',')}`);
    if (STRICT) process.exit(1);
  }
  process.exit(0);
}

function clusterFor(file) {
  const segs = file.split('/');
  if (segs.length < 2) return `whatsapp_saas/root/${segs[0]}`;
  const top = segs[0];
  let area = segs[1];
  if (top === 'backend' && segs[2]) area = segs[2];
  if (top === 'frontend' && segs[1] === 'src' && segs[3]) area = segs[3];
  return `whatsapp_saas/${top}/${area}`;
}

async function logLine(line) {
  try {
    await mkdir(dirname(LOG), { recursive: true });
    await appendFile(LOG, `[${new Date().toISOString()}] ${line}\n`);
  } catch {
    /* ignore */
  }
}

function capture(argv) {
  return new Promise((resolve) => {
    let out = '';
    const child = spawn(argv[0], argv.slice(1), { cwd: ROOT, stdio: ['inherit', 'pipe', 'pipe'] });
    child.stdout?.on('data', (d) => (out += d.toString()));
    child.on('exit', () => resolve(out));
    child.on('error', () => resolve(''));
  });
}

await main();
