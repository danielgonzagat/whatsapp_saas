#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const sourceDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const source = fs.readFileSync(path.join(sourceDir, 'server-tools-exec.ts'), 'utf8');
const results = [];
function record(name, ok, detail = {}) {
  results.push({ name, ok: Boolean(ok), detail });
}

record(
  'atomic_exec probes direct sandbox usability instead of trusting sandbox-exec existence',
  source.includes('function sandboxExecUsable()') &&
    source.includes("['-p', atomicSandboxProfile(null, null), '/bin/bash', '-c', 'true']") &&
    source.includes('sandbox_apply') &&
    source.includes('sandboxExecUsableCache'),
  {
    hasProbe: source.includes('function sandboxExecUsable()'),
    checksSandboxApply: source.includes('sandbox_apply'),
  },
);
record(
  'atomic_exec recovers Codex broker endpoint from .atomic/codex-broker-current.json',
  source.includes("const statePath = path.join(REPO_ROOT, '.atomic', 'codex-broker-current.json')") &&
    source.includes("JSON.parse(fs.readFileSync(statePath, 'utf8'))") &&
    source.includes('brokerEndpointIfPresent(state.socket)'),
  {
    hasStatePath: source.includes('codex-broker-current.json'),
    hasStateParse: source.includes("JSON.parse(fs.readFileSync(statePath, 'utf8'))"),
  },
);
record(
  'atomic_exec prefers recovered broker when direct sandbox is unusable',
  source.includes('const directSandboxActive = sandboxExecUsable();') &&
    source.includes('const useBroker = hostSandbox || (!directSandboxActive && Boolean(brokerSock));') &&
    source.includes('const sandboxActive = useBroker ? Boolean(brokerSock) : directSandboxActive;') &&
    source.includes('res = useBroker'),
  {
    hasUseBroker: source.includes('const useBroker = hostSandbox || (!directSandboxActive && Boolean(brokerSock));'),
    runUsesBroker: source.includes('res = useBroker'),
  },
);
record(
  'atomic_exec fails closed with a substrate reason when neither direct sandbox nor broker is usable',
  source.includes('sandbox_apply is denied in this process') &&
    source.includes('no live broker endpoint was recovered'),
  {
    hasSubstrateText: source.includes('sandbox_apply is denied in this process'),
  },
);

const ok = results.every((entry) => entry.ok);
console.log(JSON.stringify({ ok, results }, null, 2));
process.exit(ok ? 0 : 1);
