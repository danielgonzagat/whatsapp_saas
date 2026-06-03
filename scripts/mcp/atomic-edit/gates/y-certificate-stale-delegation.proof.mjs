#!/usr/bin/env node
import * as childProcess from 'node:child_process';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const jsonMode = process.argv.includes('--json');
const sourceDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(sourceDir, '..', '..', '..');
const server = path.join(sourceDir, 'dist', 'server.js');
const results = [];

function record(name, ok, detail = {}) {
  results.push({ name, ok: Boolean(ok), detail });
}

function parseCertificate(stdout) {
  const payload = JSON.parse(stdout.trim() || '{}');
  const content = Array.isArray(payload.result?.content) ? payload.result.content : [];
  const machine = content.length > 0 ? JSON.parse(content[content.length - 1].text) : null;
  return { payload, machine };
}

const child = childProcess.spawnSync(process.execPath, [server], {
  cwd: repoRoot,
  env: {
    ...process.env,
    ATOMIC_SINGLE_TOOL_CALL: '1',
    ATOMIC_SINGLE_TOOL_NAME: 'atomic_y_certificate',
    ATOMIC_SINGLE_TOOL_ARGS_JSON: JSON.stringify({ scope: 'mcp-controlled', includeAudits: false }),
    ATOMIC_DISABLE_HOT_RELOAD: '1',
    ATOMIC_Y_CERTIFICATE_FORCE_STALE: '1',
    ATOMIC_Y_CERTIFICATE_DELEGATE_DEPTH: '0',
    CODEX_PROJECT_DIR: repoRoot,
    TMPDIR: repoRoot,
    TMP: repoRoot,
    TEMP: repoRoot,
  },
  encoding: 'utf8',
  maxBuffer: 50 * 1024 * 1024,
});

let parsed = null;
try {
  parsed = parseCertificate(child.stdout);
} catch (error) {
  parsed = { payload: null, machine: null, error: error instanceof Error ? error.message : String(error) };
}

const machine = parsed.machine;
const distFreshness = Array.isArray(machine?.domains)
  ? machine.domains.find((domain) => domain.domain === 'distFreshness')
  : null;
record('forced stale certificate exits successfully', child.status === 0, { status: child.status, stderr: child.stderr });
record('forced stale certificate returns ok payload', parsed.payload?.ok === true, parsed.payload);
record(
  'forced stale certificate marks stale delegation',
  Boolean(machine?.delegatedFromStaleRuntime),
  machine?.delegatedFromStaleRuntime ?? null,
);
record('delegated certificate came from a fresh runtime pid', typeof machine?.runtimePid === 'number' && machine.runtimePid !== machine.delegatedFromStaleRuntime?.staleRuntimePid, {
  runtimePid: machine?.runtimePid,
  staleRuntimePid: machine?.delegatedFromStaleRuntime?.staleRuntimePid,
});
record('delegated certificate has GREEN distFreshness', distFreshness?.status === 'GREEN', distFreshness ?? null);
record(
  'delegation marker records the stale-runtime reason',
  machine?.delegatedFromStaleRuntime?.reason === 'stale Atomic MCP runtime delegated certificate issuance to freshly compiled dist/server.js',
  machine?.delegatedFromStaleRuntime ?? null,
);

const payload = { ok: results.every((result) => result.ok), results };
if (jsonMode) process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
else if (!payload.ok) process.stderr.write(JSON.stringify(payload, null, 2) + '\n');
process.exit(payload.ok ? 0 : 1);
