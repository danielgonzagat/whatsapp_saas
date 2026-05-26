#!/usr/bin/env node
// extractors/diagnostics.mjs — L7 live diagnostics overlay
//
// Roda tsc --noEmit + eslint --format json em backend/frontend/worker e anota
// cada arquivo (e cada node carregando esse arquivo) com:
//   meta.diagnostics = { errors: [...], warnings: [...] }
//
// Determinístico. Sem LLM. Pull-based (não LSP push real ainda) — mas re-roda
// em ~30-90s no monorepo completo, com caching incremental por mtime.
//
// Args:
//   --tsc-only / --eslint-only          rodar só uma ferramenta
//   --workspaces=backend,frontend,worker

import { argv } from 'node:process';
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeShard, addNode, addEdge, writeShard, nid } from '../lib/graph.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = process.cwd();
const OUT = `${ROOT}/graphify-out/shards/diagnostics.json`;
const CACHE = `${ROOT}/graphify-out/cache/diagnostics-cache.json`;

const args = argv.slice(2);
const ONLY_TSC = args.includes('--tsc-only');
const ONLY_ESLINT = args.includes('--eslint-only');
const WORKSPACES = (args.find((a) => a.startsWith('--workspaces='))?.split('=')[1] || 'backend,frontend,worker').split(',');

async function main() {
  const shard = makeShard();
  const cache = await loadCache();
  const fresh = { ts: Date.now(), files: {} };

  for (const ws of WORKSPACES) {
    const wsRoot = join(ROOT, ws);
    try {
      await stat(wsRoot);
    } catch {
      console.log(`[diagnostics] skip ${ws} (not present)`);
      continue;
    }

    if (!ONLY_ESLINT) {
      const tscDiag = await runTsc(ws);
      mergeIntoShard(shard, fresh, tscDiag, 'tsc');
    }
    if (!ONLY_TSC) {
      const eslintDiag = await runEslint(ws);
      mergeIntoShard(shard, fresh, eslintDiag, 'eslint');
    }
  }

  shard.stats['stats:errors'] = shard.edges.filter((e) => e.kind === 'has-diagnostic' && e.meta?.severity === 'error').length;
  shard.stats['stats:warnings'] = shard.edges.filter((e) => e.kind === 'has-diagnostic' && e.meta?.severity === 'warning').length;
  shard.stats['stats:files-with-issues'] = shard.nodes.filter((n) => n.type === 'file-diagnostic').length;

  await mkdir(dirname(CACHE), { recursive: true });
  await writeFile(CACHE, JSON.stringify(fresh));
  await writeShard(shard, OUT);
  console.log(`[diagnostics] wrote ${OUT} — ${shard.nodes.length} nodes, ${shard.edges.length} edges`);
  console.log(`[diagnostics] stats: ${JSON.stringify(shard.stats)}`);
}

async function loadCache() {
  try {
    return JSON.parse(await readFile(CACHE, 'utf8'));
  } catch {
    return { ts: 0, files: {} };
  }
}

function mergeIntoShard(shard, fresh, diag, source) {
  // diag is a map: file → [{ severity, line, col, message, code }]
  for (const [file, issues] of Object.entries(diag)) {
    const fileRel = file.startsWith(ROOT) ? relative(ROOT, file).split(sep).join('/') : file;
    const fileId = nid('file-diagnostic', fileRel);
    if (!shard.nodes.find((n) => n.id === fileId)) {
      addNode(shard, {
        id: fileId,
        label: `${fileRel} (diagnostics)`,
        type: 'file-diagnostic',
        file: fileRel,
        line: 1,
        meta: { diagnostics: [] },
      });
    }
    const node = shard.nodes.find((n) => n.id === fileId);
    for (const issue of issues) {
      node.meta.diagnostics.push({ source, ...issue });
      addEdge(shard, fileId, nid('file', fileRel), 'has-diagnostic', {
        source,
        severity: issue.severity,
        line: issue.line,
      });
    }
    fresh.files[fileRel] = (fresh.files[fileRel] || 0) + issues.length;
  }
}

async function runTsc(ws) {
  const tsconfig = join(ROOT, ws, 'tsconfig.json');
  try {
    await stat(tsconfig);
  } catch {
    return {};
  }
  console.log(`[diagnostics:tsc] ${ws}`);
  const output = await runCmd(['npx', 'tsc', '--noEmit', '-p', tsconfig], { cwd: join(ROOT, ws), timeoutMs: 240_000 });
  return parseTscOutput(output);
}

async function runEslint(ws) {
  const eslintConfig = join(ROOT, ws, 'eslint.config.mjs');
  try {
    await stat(eslintConfig);
  } catch {
    return {};
  }
  console.log(`[diagnostics:eslint] ${ws}`);
  // --format json emits structured output even on fail
  const output = await runCmd(['npx', 'eslint', '.', '--ext', '.ts,.tsx,.mts,.cts,.js,.mjs,.cjs,.jsx', '--format', 'json'], {
    cwd: join(ROOT, ws),
    timeoutMs: 240_000,
    swallowExit: true,
  });
  return parseEslintOutput(output, join(ROOT, ws));
}

function parseTscOutput(output) {
  // tsc emits: path/file.ts(line,col): error TSxxxx: message
  const out = {};
  const re = /^(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+(TS\d+):\s+(.+)$/gm;
  for (const m of output.matchAll(re)) {
    const [, file, line, col, severity, code, message] = m;
    out[file] ||= [];
    out[file].push({ severity, line: Number(line), col: Number(col), code, message });
  }
  return out;
}

function parseEslintOutput(output, wsRoot) {
  const out = {};
  let parsed;
  try {
    // ESLint --format json may pre-print a few lines; find the JSON start.
    const i = output.indexOf('[');
    parsed = JSON.parse(output.slice(i));
  } catch (e) {
    console.warn(`[diagnostics:eslint] parse failed: ${e.message}`);
    return {};
  }
  for (const result of parsed) {
    if (!result.messages?.length) continue;
    const file = relative(ROOT, result.filePath).split(sep).join('/');
    out[file] = result.messages.map((msg) => ({
      severity: msg.severity === 2 ? 'error' : 'warning',
      line: msg.line,
      col: msg.column,
      code: msg.ruleId || 'unknown',
      message: msg.message,
    }));
  }
  return out;
}

function runCmd(argv, { cwd, timeoutMs, swallowExit = false }) {
  return new Promise((resolve, reject) => {
    let output = '';
    const child = spawn(argv[0], argv.slice(1), { cwd, env: process.env });
    child.stdout.on('data', (d) => (output += d.toString()));
    child.stderr.on('data', (d) => (output += d.toString()));
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      console.warn(`[diagnostics] timeout: ${argv.join(' ')}`);
      resolve(output);
    }, timeoutMs);
    child.on('exit', (code) => {
      clearTimeout(timer);
      if (code === 0 || swallowExit) return resolve(output);
      // Non-zero from tsc/eslint with output is normal (errors found).
      resolve(output);
    });
    child.on('error', reject);
  });
}

await main();
