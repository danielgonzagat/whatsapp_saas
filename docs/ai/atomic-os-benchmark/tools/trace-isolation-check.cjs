#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

function usage() {
  console.error('Usage: trace-isolation-check.cjs --worktree <abs> --coordinator <abs> [--since <date>] [--json]');
  process.exit(2);
}

function parseArgs(argv) {
  const out = { json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--worktree') {
      out.worktree = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--coordinator') {
      out.coordinator = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--since') {
      out.since = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--json') {
      out.json = true;
      continue;
    }
    usage();
  }
  if (!out.worktree || !out.coordinator) usage();
  for (const key of ['worktree', 'coordinator']) {
    if (!path.isAbsolute(out[key])) {
      throw new Error(`${key} must be absolute: ${out[key]}`);
    }
  }
  return out;
}

function traceIds(root) {
  const dir = path.join(root, '.atomic', 'traces');
  try {
    return fs.readdirSync(dir).filter((name) => name.endsWith('.json')).sort();
  } catch (error) {
    if (error && error.code === 'ENOENT') return [];
    throw error;
  }
}

function traceCountSince(root, since) {
  if (!since) return null;
  const timestamp = Date.parse(since);
  if (!Number.isFinite(timestamp)) throw new Error(`invalid --since date: ${since}`);
  const dir = path.join(root, '.atomic', 'traces');
  try {
    return fs
      .readdirSync(dir)
      .filter((name) => name.endsWith('.json'))
      .filter((name) => fs.statSync(path.join(dir, name)).mtimeMs >= timestamp).length;
  } catch (error) {
    if (error && error.code === 'ENOENT') return 0;
    throw error;
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const worktreeIds = traceIds(args.worktree);
  const coordinatorIds = new Set(traceIds(args.coordinator));
  const matchingTraceIds = worktreeIds.filter((id) => coordinatorIds.has(id));
  const result = {
    ok: matchingTraceIds.length === 0,
    worktreeTraceCount: worktreeIds.length,
    coordinatorTraceCount: coordinatorIds.size,
    coordinatorNewTraceCount: traceCountSince(args.coordinator, args.since),
    matchingTraceIds,
  };
  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`worktree_traces=${result.worktreeTraceCount}`);
    console.log(`coordinator_traces=${result.coordinatorTraceCount}`);
    if (result.coordinatorNewTraceCount !== null) {
      console.log(`coordinator_new_traces=${result.coordinatorNewTraceCount}`);
    }
    console.log(`matching_trace_ids=${matchingTraceIds.length}`);
  }
  process.exit(result.ok ? 0 : 1);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
