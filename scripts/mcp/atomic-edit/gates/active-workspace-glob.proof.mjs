#!/usr/bin/env node
/**
 * Proof for active-workspace glob semantics: glob must resolve relative paths
 * against the bound workspace and match patterns against the full workspace-
 * relative path, not only the basename. This covers the worker class where a
 * nested test-file glob returned zero even though the file existed.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const jsonMode = process.argv.includes('--json');
const sourceDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(sourceDir, '..', '..', '..');
const compiledServer = path.join(sourceDir, 'dist', 'server.js');

function record(results, name, ok, detail = {}) {
  results.push({ name, ok: Boolean(ok), detail });
}

function read(rel) {
  return fs.readFileSync(path.join(repoRoot, rel), 'utf8');
}

function parseToolResult(result) {
  const text = result.content?.at(-1)?.text ?? '{}';
  try {
    return JSON.parse(text);
  } catch {
    return { parseError: text.slice(0, 1000) };
  }
}

function sourceAssertions() {
  const nativeBridge = read('scripts/mcp/atomic-edit/native-bridge.ts');
  const nativeIo = read('scripts/mcp/atomic-edit/server-tools-native-io.ts');
  return {
    nativeBridgeMatchesRelativePathAndBasename:
      nativeBridge.includes('function globMatches(re: RegExp | null, relPath: string): boolean') &&
      nativeBridge.includes('re.test(rel) || re.test(path.basename(rel))'),
    nativeBridgeSupportsTypedGlobEntries:
      nativeBridge.includes("export type GlobFileType = 'file' | 'dir' | 'symlink'") &&
      nativeBridge.includes('function listEntries(') &&
      nativeBridge.includes('fileType: opts.fileType as GlobFileType | undefined'),
    nativeIoRootsAtActiveWorkspace:
      nativeIo.includes('activeWorkspaceRoot()') &&
      nativeIo.includes("assertInsideActiveWorkspace(abs, 'native io path')") &&
      nativeIo.includes('path.resolve(baseRoot, p)'),
    nativeIoReturnsWorkspaceRelativePaths:
      nativeIo.includes('function displayPath(absPath: string): string') &&
      nativeIo.includes('path: displayPath(match.path)'),
  };
}

async function callAtomicGlob(proofRoot, workspace, args) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [compiledServer],
    cwd: repoRoot,
    stderr: 'pipe',
    env: {
      ...process.env,
      ATOMIC_EDIT_MCP_SELF_HOSTED: '1',
      ATOMIC_EDIT_ALLOW_SELF_HOSTED: '1',
      ATOMIC_EDIT_REPO_ROOT: proofRoot,
      ATOMIC_WORKSPACE_ROOT: workspace,
      ATOMIC_EDIT_ALLOWED_ROOTS: '',
    },
  });
  const client = new Client({ name: 'active-workspace-glob-proof', version: '1.0.0' });
  try {
    await client.connect(transport);
    const result = await client.callTool({ name: 'atomic_glob', arguments: args }, undefined, { timeout: 30000 });
    return { ok: true, body: parseToolResult(result) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  } finally {
    try { await client.close(); } catch {}
  }
}

function paths(body) {
  return Array.isArray(body?.matches) ? body.matches.map((match) => match.path).sort() : [];
}

async function dynamicGlobProof() {
  const proofRoot = path.join(repoRoot, '.atomic', 'active-workspace-glob-proof-' + process.pid + '-' + Date.now());
  const workspace = path.join(proofRoot, 'worker');
  const sibling = path.join(proofRoot, 'sibling');
  fs.mkdirSync(path.join(workspace, 'src', '__tests__'), { recursive: true });
  fs.mkdirSync(path.join(workspace, 'src', 'serializer'), { recursive: true });
  fs.mkdirSync(path.join(workspace, '.hidden'), { recursive: true });
  fs.mkdirSync(path.join(sibling, 'src', '__tests__'), { recursive: true });
  fs.writeFileSync(path.join(workspace, 'src', '__tests__', 'serializer.test.ts'), 'export const nested = true;\n');
  fs.writeFileSync(path.join(workspace, 'src', 'serializer', 'binary.ts'), 'export const binary = true;\n');
  fs.writeFileSync(path.join(workspace, 'root.test.ts'), 'export const root = true;\n');
  fs.writeFileSync(path.join(workspace, '.hidden', 'hidden.test.ts'), 'export const hidden = true;\n');
  fs.writeFileSync(path.join(sibling, 'src', '__tests__', 'outside.test.ts'), 'export const outside = true;\n');

  try {
    const nested = await callAtomicGlob(proofRoot, workspace, {
      pattern: 'src/__tests__/**/*.ts',
      fileType: 'file',
    });
    const allTests = await callAtomicGlob(proofRoot, workspace, {
      pattern: '**/*.test.ts',
      fileType: 'file',
    });
    const srcScoped = await callAtomicGlob(proofRoot, workspace, {
      path: 'src',
      pattern: '**/*.test.ts',
      fileType: 'file',
    });
    const dirs = await callAtomicGlob(proofRoot, workspace, {
      pattern: 'src/**',
      fileType: 'dir',
    });

    const nestedPaths = paths(nested.body);
    const allTestPaths = paths(allTests.body);
    const srcScopedPaths = paths(srcScoped.body);
    const dirPaths = paths(dirs.body);
    return {
      ok:
        nested.ok === true &&
        nestedPaths.length === 1 &&
        nestedPaths[0] === 'src/__tests__/serializer.test.ts' &&
        allTests.ok === true &&
        allTestPaths.includes('root.test.ts') &&
        allTestPaths.includes('src/__tests__/serializer.test.ts') &&
        !allTestPaths.some((entry) => entry.includes('outside') || entry.includes('.hidden')) &&
        srcScoped.ok === true &&
        srcScopedPaths.length === 1 &&
        srcScopedPaths[0] === 'src/__tests__/serializer.test.ts' &&
        dirs.ok === true &&
        dirPaths.includes('src/__tests__') &&
        dirPaths.includes('src/serializer') &&
        !dirPaths.some((entry) => entry.includes('sibling')),
      nested,
      allTests,
      srcScoped,
      dirs,
      nestedPaths,
      allTestPaths,
      srcScopedPaths,
      dirPaths,
    };
  } finally {
    fs.rmSync(proofRoot, { recursive: true, force: true });
  }
}

async function main() {
  const results = [];
  const source = sourceAssertions();
  for (const [name, ok] of Object.entries(source)) record(results, name, ok, { ok });
  if (!fs.existsSync(compiledServer)) {
    record(results, 'dynamic MCP proof has built dist/server.js', false, { missing: compiledServer });
  } else {
    const dynamic = await dynamicGlobProof();
    record(results, 'atomic_glob is active-workspace-rooted and matches full relative paths', dynamic.ok, dynamic);
  }
  return { ok: results.every((entry) => entry.ok), results };
}

const result = await main();
if (jsonMode) process.stdout.write(JSON.stringify(result) + '\n');
else for (const entry of result.results) process.stdout.write((entry.ok ? 'PASS ' : 'FAIL ') + entry.name + '\n');
process.exit(result.ok ? 0 : 1);
