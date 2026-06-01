#!/usr/bin/env node
import * as childProcess from 'node:child_process';
import * as fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const jsonMode = process.argv.includes('--json');
const sourceDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(sourceDir, '..', '..', '..');
const launcher = path.resolve(sourceDir, '..', 'atomic-edit-mcp-launcher.sh');
const brokerScript = path.join(sourceDir, 'atomic-exec-broker.mjs');

function parseToolJson(result) {
  const text = result.content?.at(-1)?.text ?? '{}';
  return JSON.parse(text);
}

function domain(cert, name) {
  return Array.isArray(cert?.domains) ? cert.domains.find((entry) => entry.domain === name) : undefined;
}

function startBroker() {
  const socketPath = path.join('/tmp', `ay-${process.pid}-${Date.now()}.sock`);
  const proc = childProcess.spawn(process.execPath, [brokerScript, socketPath], {
    cwd: repoRoot,
    env: { ...process.env, ATOMIC_EXEC_BROKER_ROOT: repoRoot },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  proc.stdout.on('data', (chunk) => {
    stdout += String(chunk);
  });
  proc.stderr.on('data', (chunk) => {
    stderr += String(chunk);
  });
  return new Promise((resolve, reject) => {
    const deadline = setTimeout(() => {
      proc.kill('SIGTERM');
      reject(new Error(`broker did not become ready: stdout=${stdout} stderr=${stderr}`));
    }, 5000);
    proc.on('exit', (code) => {
      clearTimeout(deadline);
      if (!stdout.includes('ATOMIC_BROKER_READY')) {
        reject(new Error(`broker exited before ready: code=${code} stdout=${stdout} stderr=${stderr}`));
      }
    });
    const poll = setInterval(() => {
      if (stdout.includes('ATOMIC_BROKER_READY') && fs.existsSync(socketPath)) {
        clearTimeout(deadline);
        clearInterval(poll);
        resolve({ proc, socketPath, stdout, stderr });
      }
    }, 25);
  });
}

async function main() {
  let broker;
  try {
    broker = await startBroker();
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
        ATOMIC_EXEC_BROKER_SOCKET: broker.socketPath,
        CODEX_PROJECT_DIR: repoRoot,
        TMPDIR: repoRoot,
        TMP: repoRoot,
        TEMP: repoRoot,
      },
    });
    const client = new Client({ name: 'compiled-mcp-y-certificate-proof', version: '1.0.0' });
    try {
      await client.connect(transport);
      const cert = parseToolJson(await client.callTool({ name: 'atomic_y_certificate', arguments: { scope: 'mcp-controlled', includeAudits: true } }));
      const bypass = domain(cert, 'bypassLedger');
      const staticPolicy = domain(cert, 'codexNoBypassStaticPolicy');
      const bypassReportStatus = String(bypass?.detail?.status ?? 'missing');
      const blockerDomains = Array.isArray(cert?.blockers)
        ? cert.blockers.map((entry) => entry.domain).sort()
        : [];
      const bypassIsHonestBlock =
        bypass?.status === 'UNJUDGED' &&
        bypassReportStatus !== 'observed-clean' &&
        blockerDomains.includes('bypassLedger');
      const onlyBypassLedgerBlocks = blockerDomains.length === 1 && blockerDomains[0] === 'bypassLedger';
      const completeState =
        cert?.ok === true &&
        cert?.yComplete === true &&
        cert?.verdict === 'Y_COMPLETE' &&
        blockerDomains.length === 0 &&
        bypass?.status === 'GREEN' &&
        staticPolicy?.status === 'GREEN';
      const honestBlockedState =
        cert?.ok === true &&
        cert?.yComplete === false &&
        cert?.verdict === 'Y_BLOCKED' &&
        bypassIsHonestBlock &&
        onlyBypassLedgerBlocks;
      return {
        ok: completeState || honestBlockedState,
        certificate: cert,
        assertion: {
          bypassStatus: bypass?.status,
          bypassReportStatus,
          staticPolicyStatus: staticPolicy?.status,
          bypassIsHonestBlock,
          blockerDomains,
          onlyBypassLedgerBlocks,
          completeState,
          honestBlockedState,
        },
      };
    } finally {
      try {
        await client.close();
      } catch {
        // best effort
      }
    }
  } finally {
    if (broker?.proc) broker.proc.kill('SIGTERM');
    if (broker?.socketPath) fs.rmSync(broker.socketPath, { force: true });
  }
}

main()
  .then((payload) => {
    if (jsonMode) console.log(JSON.stringify(payload, null, 2));
    else if (!payload.ok) console.error(JSON.stringify(payload, null, 2));
    process.exit(payload.ok ? 0 : 1);
  })
  .catch((error) => {
    const payload = { ok: false, error: error instanceof Error ? error.message : String(error) };
    if (jsonMode) console.log(JSON.stringify(payload, null, 2));
    else console.error(payload.error);
    process.exit(1);
  });
