#!/usr/bin/env node
import * as childProcess from 'node:child_process';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const jsonMode = process.argv.includes('--json');
const sourceDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(sourceDir, '..', '..', '..');
const launcher = path.resolve(sourceDir, '..', 'atomic-edit-mcp-launcher.sh');

function record(results, name, ok, detail) {
  results.push({ name, ok, detail });
}

async function hostedLauncherStartsMcp() {
  const transport = new StdioClientTransport({
    command: launcher,
    args: [],
    cwd: repoRoot,
    stderr: 'pipe',
    env: {
      ...process.env,
      ATOMIC_HOST_SANDBOX: 'macos-sandbox-exec',
      ATOMIC_HOST_ATOMIC_ONLY: '1',
      ATOMIC_HOST_WRITE_ROOT: repoRoot,
      CODEX_PROJECT_DIR: repoRoot,
      TMPDIR: repoRoot,
      TMP: repoRoot,
      TEMP: repoRoot,
    },
  });
  const client = new Client({ name: 'mcp-launcher-host-boundary-proof', version: '1.0.0' });
  try {
    await client.connect(transport);
    const listed = await client.listTools();
    return { ok: listed.tools?.some((tool) => tool.name === 'atomic_y_certificate') === true, tools: listed.tools?.length ?? 0 };
  } finally {
    try {
      await client.close();
    } catch {
      // best effort
    }
  }
}

async function main() {
  const results = [];
  const denied = childProcess.spawnSync(launcher, [], {
    cwd: repoRoot,
    encoding: 'utf8',
    timeout: 5000,
    env: {
      ...process.env,
      ATOMIC_HOST_SANDBOX: '',
      ATOMIC_HOST_ATOMIC_ONLY: '',
      ATOMIC_HOST_WRITE_ROOT: '',
    },
  });
  record(results, 'unhosted MCP launcher is refused before server start', denied.status === 79 && /requires the atomic host sandbox boundary/.test(denied.stderr ?? ''), {
    status: denied.status,
    stderr: denied.stderr,
  });

  const hosted = await hostedLauncherStartsMcp();
  record(results, 'host-marked MCP launcher starts the Atomic server', hosted.ok === true, hosted);

  return { ok: results.every((entry) => entry.ok), results };
}

main().then((result) => {
  if (jsonMode) process.stdout.write(JSON.stringify(result) + '\n');
  else for (const entry of result.results) process.stdout.write(`${entry.ok ? 'PASS' : 'FAIL'} ${entry.name}\n`);
  process.exit(result.ok ? 0 : 1);
}).catch((error) => {
  process.stderr.write((error instanceof Error ? error.stack ?? error.message : String(error)) + '\n');
  process.exit(1);
});
