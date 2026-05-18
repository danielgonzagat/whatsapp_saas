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

function parseArgs(argv) {
  const separator = argv.indexOf('--');
  const ownArgs = separator === -1 ? argv : argv.slice(0, separator);
  const eslintArgs = separator === -1 ? [] : argv.slice(separator + 1);
  let cwd = '.';
  const allowedPaths = [];

  for (let index = 0; index < ownArgs.length; index += 1) {
    const arg = ownArgs[index];
    if (arg === '--cwd') {
      cwd = ownArgs[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--allow') {
      allowedPaths.push(ownArgs[index + 1]);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return {
    cwd,
    eslintArgs: eslintArgs.length > 0 ? eslintArgs : ['.', '--fix-dry-run', '--format', 'json'],
    allowedPaths,
  };
}

async function main() {
  const { cwd, eslintArgs, allowedPaths } = parseArgs(process.argv.slice(2));
  const resolvedCwd = path.resolve(process.cwd(), cwd);
  const resolvedAllowedPaths = allowedPaths.length > 0
    ? allowedPaths.map((allowedPath) => path.resolve(process.cwd(), allowedPath))
    : [resolvedCwd];

  const client = new Client({ name: 'codex-atomic-eslint-fix', version: '1.0.0' });
  const transport = new StdioClientTransport({
    command: 'bash',
    args: [path.join(REPO_ROOT, 'scripts', 'mcp', 'atomic-edit-mcp-launcher.sh')],
  });

  await client.connect(transport);
  try {
    const result = await client.callTool({
      name: 'atomic_apply_eslint_dry_run_fixes',
      arguments: {
        cwd: resolvedCwd,
        args: eslintArgs,
        allowedPaths: resolvedAllowedPaths,
        preview: false,
      },
    });

    const output = result.content?.map((part) => part.text || '').join('\n') || '';
    if (output) {
      console.log(output);
    }
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
