#!/usr/bin/env node
/**
 * atomic-call.mjs — CLI wrapper that calls any kloel-atomic-edit MCP tool
 * via the running dist server. Formats args as JSON, sends a JSON-RPC
 * tools/call request over stdin, reads the response, and prints to stdout.
 *
 * Usage: node atomic-call.mjs <tool-name> [json-args-string]
 * Example: node atomic-call.mjs code_readcode '{"path":"src/foo.ts"}'
 */

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';
import * as fs from 'node:fs';

const nodeBin = process.env.ATOMIC_NODE_BIN || process.execPath;
const dir = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.join(dir, 'dist', 'server.js');

if (!fs.existsSync(serverPath)) {
  process.stderr.write(`atomic-call: server not found at ${serverPath}\n`);
  process.exit(1);
}

const tool = process.argv[2];
if (!tool) {
  process.stderr.write('Usage: atomic-call.mjs <tool-name> [json-args]\n');
  process.exit(1);
}

let args = {};
if (process.argv[3]) {
  try {
    args = JSON.parse(process.argv[3]);
  } catch {
    args = { path: process.argv[3] };
  }
}

const request = JSON.stringify({
  jsonrpc: '2.0',
  id: 1,
  method: 'tools/call',
  params: { name: tool, arguments: args },
});

const result = spawnSync(nodeBin, [serverPath], {
  input: request,
  encoding: 'utf8',
  timeout: 30000,
  maxBuffer: 64 * 1024 * 1024,
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env, ATOMIC_EDIT_MCP_SELF_HOSTED: '1', ATOMIC_EDIT_ALLOW_SELF_HOSTED: '1', ATOMIC_WORKSPACE_ROOT: '', ATOMIC_DECLARED_WORKSPACE_ROOT: '' },
});

if (result.error) {
  process.stderr.write(`atomic-call: spawn error: ${result.error.message}\n`);
  process.exit(1);
}

// Parse all JSON-RPC lines from output
const lines = result.stdout.split('\n').filter(Boolean);
let response = null;
for (const line of lines) {
  try {
    const r = JSON.parse(line);
    if (r.id === 1 || r.result) response = r;
  } catch {
    // skip non-JSON lines
  }
}

if (!response) {
  process.stderr.write(`atomic-call: no valid response from server\n`);
  process.stderr.write(result.stderr || '');
  process.exit(1);
}

if (response.error) {
  process.stderr.write(`atomic-call error: ${JSON.stringify(response.error)}\n`);
  process.exit(1);
}

const content = response.result?.content;
if (content?.[0]?.text) {
  // Try parsing as JSON for structured output
  try {
    const parsed = JSON.parse(content[0].text);
    console.log(JSON.stringify(parsed, null, 2));
  } catch {
    console.log(content[0].text);
  }
} else {
  console.log(JSON.stringify(response.result, null, 2));
}
