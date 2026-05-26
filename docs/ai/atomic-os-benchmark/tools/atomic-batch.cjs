#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');

function findRepoRoot(start) {
  let dir = start;
  for (;;) {
    if (fs.existsSync(path.join(dir, 'package.json')) && fs.existsSync(path.join(dir, 'scripts', 'mcp', 'atomic-edit-mcp-launcher.sh'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error('could not find atomic-edit repo root from ' + start);
    dir = parent;
  }
}

const REPO_ROOT = process.env.ATOMIC_OS_REPO_ROOT || findRepoRoot(__dirname);
const requireFromRepo = createRequire(path.join(REPO_ROOT, 'package.json'));
const { Client } = requireFromRepo('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = requireFromRepo('@modelcontextprotocol/sdk/client/stdio.js');

const PATH_KEYS = new Set(['file', 'dir', 'cwd']);
const PATH_ARRAY_KEYS = new Set(['allowedPaths']);

function usage(exitCode = 2) {
  const stream = exitCode === 0 ? process.stdout : process.stderr;
  stream.write('Usage: atomic-batch.cjs <calls.json|calls.jsonl|->\n');
  stream.write('Each call: {"tool":"atomic_tool_name","arguments":{...}}\n');
  process.exit(exitCode);
}

function assertAbsolutePath(value, key) {
  if (typeof value !== 'string') return;
  if (!path.isAbsolute(value)) {
    throw new Error(`refused: ${key} must be absolute in benchmark worktree mode: ${value}`);
  }
  const cwd = `${process.cwd()}${path.sep}`;
  if (value !== process.cwd() && !value.startsWith(cwd)) {
    throw new Error(`refused: ${key} escapes current worktree: ${value}`);
  }
}

function assertWorktreeSafePaths(value, parentKey = '') {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertWorktreeSafePaths(item, `${parentKey}[${index}]`));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    const fullKey = parentKey ? `${parentKey}.${key}` : key;
    if (PATH_KEYS.has(key)) {
      assertAbsolutePath(child, fullKey);
      continue;
    }
    if (PATH_ARRAY_KEYS.has(key)) {
      if (!Array.isArray(child)) {
        throw new Error(`refused: ${fullKey} must be an array of absolute paths`);
      }
      child.forEach((entry, index) => assertAbsolutePath(entry, `${fullKey}[${index}]`));
      continue;
    }
    assertWorktreeSafePaths(child, fullKey);
  }
}

function readInput(inputPath) {
  if (!inputPath || inputPath === '--help' || inputPath === '-h') usage(inputPath ? 0 : 2);
  return inputPath === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(inputPath, 'utf8');
}

function parseCalls(text) {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const parsed = trimmed.startsWith('[')
    ? JSON.parse(trimmed)
    : trimmed.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  if (!Array.isArray(parsed)) {
    throw new Error('batch input must be a JSON array or JSONL sequence');
  }
  return parsed.map((call, index) => {
    if (!call || typeof call !== 'object' || Array.isArray(call)) {
      throw new Error(`call ${index} must be an object`);
    }
    if (typeof call.tool !== 'string' || !call.tool) {
      throw new Error(`call ${index} is missing a string tool`);
    }
    const args = call.arguments ?? {};
    if (!args || typeof args !== 'object' || Array.isArray(args)) {
      throw new Error(`call ${index} arguments must be an object`);
    }
    assertWorktreeSafePaths(args);
    return { tool: call.tool, arguments: args };
  });
}

async function main() {
  const calls = parseCalls(readInput(process.argv[2]));
  const client = new Client({ name: 'codex-atomic-worktree-safe-batch', version: '1.0.0' });
  const transport = new StdioClientTransport({
    command: 'bash',
    args: [path.join(REPO_ROOT, 'scripts', 'mcp', 'atomic-edit-mcp-launcher.sh')],
  });

  await client.connect(transport);
  try {
    for (const [index, call] of calls.entries()) {
      const result = await client.callTool({ name: call.tool, arguments: call.arguments });
      const output = result.content?.map((part) => part.text || '').join('\n') || '';
      const failed = result.isError || /\bMCP error\b/i.test(output);
      process.stdout.write(JSON.stringify({ index, tool: call.tool, ok: !failed, output }) + '\n');
      if (failed) {
        throw new Error(`atomic batch call ${index} (${call.tool}) failed`);
      }
    }
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
