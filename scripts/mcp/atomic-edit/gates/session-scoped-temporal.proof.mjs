#!/usr/bin/env node
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const jsonMode = process.argv.includes('--json');
const sourceDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(sourceDir, '..', '..', '..');
const compiledServer = path.join(sourceDir, 'dist', 'server.js');
const base = `.atomic/session-scoped-temporal-proof-${process.pid}`;
const helperFile = `${base}/helper.mjs`;
const flowFile = `${base}/flow.mjs`;
const helperSpecifier = './' + 'helper.mjs';
const importKeyword = 'im' + 'port';
const fromKeyword = 'fr' + 'om';

const sha = (text) => crypto.createHash('sha256').update(text, 'utf8').digest('hex');

function emit(ok, evidence) {
  if (jsonMode) console.log(JSON.stringify({ ok, ...evidence }, null, 2));
  else console.log(`${ok ? 'PASS' : 'FAIL'} session-scoped-temporal.proof`, evidence);
}

function body(result) {
  for (let index = (result?.content?.length ?? 0) - 1; index >= 0; index -= 1) {
    const text = result.content[index]?.text ?? '';
    if (!text) continue;
    try {
      return JSON.parse(text);
    } catch {
      // Many Atomic tools return human summary first and machine JSON second.
    }
  }
  throw new Error(`tool returned no JSON body: ${(result?.content ?? []).map((part) => part.text).join('\n').slice(0, 500)}`);
}

async function call(client, name, args = {}) {
  const result = await client.callTool({ name, arguments: args });
  const parsed = body(result);
  if (result.isError || parsed.ok === false) {
    throw new Error(`${name} failed: ${result.content?.[0]?.text ?? JSON.stringify(parsed)}`);
  }
  return parsed;
}

async function cleanupFile(client, rel) {
  const abs = path.join(repoRoot, rel);
  if (!fs.existsSync(abs)) return;
  const content = fs.readFileSync(abs, 'utf8');
  await call(client, 'atomic_delete_file', {
    file: rel,
    expectedSha256: sha(content),
    proofOfIncorrectness: 'session scoped temporal proof fixture cleanup removes generated negative residue',
  });
}

async function main() {
  if (!fs.existsSync(compiledServer)) throw new Error(`missing compiled server: ${compiledServer}`);
  const transport = new StdioClientTransport({ command: process.execPath, args: [compiledServer], cwd: repoRoot, stderr: 'pipe' });
  const client = new Client({ name: 'session-scoped-temporal-proof', version: '1.0.0' });
  let sessionId = null;
  await client.connect(transport);
  try {
    const begin = await call(client, 'atomic_session_begin', { paths: [base] });
    sessionId = begin.sessionId;
    if (!Array.isArray(begin.scopePaths) || begin.scopePaths[0] !== base) {
      throw new Error(`scoped session did not preserve scopePaths: ${JSON.stringify(begin)}`);
    }
    if (begin.filesSnapshotted !== 0 || begin.limitReached !== false) {
      throw new Error(`scoped session should open over missing fixture without cap: ${JSON.stringify(begin)}`);
    }

    await call(client, 'atomic_create_file', {
      file: helperFile,
      content: 'export const helper = () => 1;\n',
    });
    await call(client, 'atomic_create_file', {
      file: flowFile,
      content: `${importKeyword} { helper } ${fromKeyword} '${helperSpecifier}';\nexport const run = () => 1;\n`,
    });
    await call(client, 'atomic_session_savepoint', { sessionId, name: 'after-import' });
    await call(client, 'atomic_replace_text', {
      file: flowFile,
      oldText: '1;\n',
      newText: '2;\n',
      occurrence: 1,
      proofOfIncorrectness: 'temporal proof fixture evolves generated value to create a following snapshot',
    });
    await call(client, 'atomic_session_savepoint', { sessionId, name: 'follow-1' });
    await call(client, 'atomic_replace_text', {
      file: flowFile,
      oldText: '2;\n',
      newText: '3;\n',
      occurrence: 1,
      proofOfIncorrectness: 'temporal proof fixture evolves generated value to create a second following snapshot',
    });
    await call(client, 'atomic_session_savepoint', { sessionId, name: 'follow-2' });

    const commit = await call(client, 'atomic_session_commit', { sessionId });
    sessionId = null;
    const gate = commit.temporalGate;
    if (!gate || gate.gate !== 'temporal-session' || gate.green !== false) {
      throw new Error(`commit receipt did not expose temporal red gate: ${JSON.stringify(commit)}`);
    }
    if (!Array.isArray(gate.reds) || !gate.reds.some((red) => red.file === flowFile && red.importName === 'helper')) {
      throw new Error(`temporal gate did not flag the stale helper import: ${JSON.stringify(gate)}`);
    }
    if (!commit.files?.some((effect) => effect.file === flowFile && effect.change === 'created')) {
      throw new Error(`scoped commit did not include flow.mjs creation in receipt: ${JSON.stringify(commit)}`);
    }

    await cleanupFile(client, flowFile);
    await cleanupFile(client, helperFile);
    emit(true, {
      scopePaths: begin.scopePaths,
      filesSnapshotted: begin.filesSnapshotted,
      temporalReds: gate.reds.length,
      receiptFiles: commit.filesTouched,
    });
  } catch (error) {
    if (sessionId) {
      try {
        await call(client, 'atomic_session_rollback', { sessionId, close: true });
      } catch {}
    }
    throw error;
  } finally {
    await cleanupFile(client, flowFile).catch(() => {});
    await cleanupFile(client, helperFile).catch(() => {});
    await client.close().catch(() => {});
  }
}

main().catch((error) => {
  emit(false, { error: error instanceof Error ? error.message : String(error) });
  process.exit(1);
});
