#!/usr/bin/env node
// tools/agent-coordination/taskgraph.mjs — L11 multi-agent coordination.
//
// CLI:
//   node tools/agent-coordination/taskgraph.mjs claim <cluster> <agent>     # acquire lock
//   node tools/agent-coordination/taskgraph.mjs release <cluster> <agent>   # release
//   node tools/agent-coordination/taskgraph.mjs list                        # all locks
//   node tools/agent-coordination/taskgraph.mjs check <cluster>             # who holds it
//   node tools/agent-coordination/taskgraph.mjs heartbeat <cluster> <agent> # refresh TTL
//   node tools/agent-coordination/taskgraph.mjs sweep                       # purge expired
//
// Cluster name pattern: <repo>/<area>/<symbol>  e.g. whatsapp_saas/marketing/ChannelOnboarding
//
// Storage: .claude/task-graph.json (atomic write via tmpfile+rename).
// TTL: 30 min default — refreshed via heartbeat.

import { argv } from 'node:process';
import { readFile, writeFile, mkdir, rename, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const STORE = join(ROOT, '.claude', 'task-graph.json');
const TTL_MS = 30 * 60 * 1000;

async function load() {
  try {
    return JSON.parse(await readFile(STORE, 'utf8'));
  } catch {
    return { locks: {}, version: 1 };
  }
}

async function save(state) {
  await mkdir(dirname(STORE), { recursive: true });
  const tmp = STORE + '.tmp';
  await writeFile(tmp, JSON.stringify(state, null, 2));
  await rename(tmp, STORE);
}

function isExpired(lock) {
  return Date.now() - lock.heartbeatAt > TTL_MS;
}

const commands = {
  async claim(cluster, agent) {
    if (!cluster || !agent) throw new Error('usage: claim <cluster> <agent>');
    const state = await load();
    const existing = state.locks[cluster];
    if (existing && !isExpired(existing) && existing.agent !== agent) {
      console.error(`CONFLICT: ${cluster} held by ${existing.agent} since ${existing.claimedAt}`);
      process.exit(2);
    }
    state.locks[cluster] = {
      agent,
      claimedAt: existing?.claimedAt || new Date().toISOString(),
      heartbeatAt: Date.now(),
      pid: process.pid,
    };
    await save(state);
    console.log(`OK: ${agent} claimed ${cluster}`);
  },
  async release(cluster, agent) {
    if (!cluster || !agent) throw new Error('usage: release <cluster> <agent>');
    const state = await load();
    const existing = state.locks[cluster];
    if (!existing) {
      console.log(`NOOP: ${cluster} was not claimed`);
      return;
    }
    if (existing.agent !== agent) {
      console.error(`REFUSED: ${cluster} held by ${existing.agent}, not ${agent}`);
      process.exit(2);
    }
    delete state.locks[cluster];
    await save(state);
    console.log(`OK: ${agent} released ${cluster}`);
  },
  async list() {
    const state = await load();
    const out = Object.entries(state.locks).map(([cluster, lock]) => ({
      cluster,
      agent: lock.agent,
      claimedAt: lock.claimedAt,
      ageMs: Date.now() - lock.heartbeatAt,
      expired: isExpired(lock),
    }));
    console.log(JSON.stringify(out, null, 2));
  },
  async check(cluster) {
    if (!cluster) throw new Error('usage: check <cluster>');
    const state = await load();
    const lock = state.locks[cluster];
    if (!lock) {
      console.log(JSON.stringify({ cluster, free: true }, null, 2));
      return;
    }
    console.log(
      JSON.stringify(
        {
          cluster,
          free: isExpired(lock),
          holder: lock.agent,
          claimedAt: lock.claimedAt,
          heartbeatAgeMs: Date.now() - lock.heartbeatAt,
          ttlRemainingMs: Math.max(0, TTL_MS - (Date.now() - lock.heartbeatAt)),
        },
        null,
        2,
      ),
    );
  },
  async heartbeat(cluster, agent) {
    if (!cluster || !agent) throw new Error('usage: heartbeat <cluster> <agent>');
    const state = await load();
    const lock = state.locks[cluster];
    if (!lock || lock.agent !== agent) {
      console.error('REFUSED: lock not held by you');
      process.exit(2);
    }
    lock.heartbeatAt = Date.now();
    await save(state);
    console.log(`OK: ${cluster} refreshed`);
  },
  async sweep() {
    const state = await load();
    let purged = 0;
    for (const [cluster, lock] of Object.entries(state.locks)) {
      if (isExpired(lock)) {
        delete state.locks[cluster];
        purged++;
        console.log(`SWEEP: ${cluster} (held by ${lock.agent}, expired)`);
      }
    }
    await save(state);
    console.log(`done: purged ${purged} expired locks`);
  },
};

const [, , cmd, ...args] = argv;
const fn = commands[cmd];
if (!fn) {
  console.error(`unknown command: ${cmd}. Available: ${Object.keys(commands).join(', ')}`);
  process.exit(1);
}
await fn(...args).catch((e) => {
  console.error(e.message);
  process.exit(1);
});
