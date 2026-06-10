#!/usr/bin/env node
import * as childProcess from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const jsonMode = process.argv.includes('--json');
const sourceDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(sourceDir, '..', '..', '..');
const launcher = path.join(sourceDir, 'codex-atomic-host-launcher.mjs');
const compiledServer = path.join(sourceDir, 'dist', 'server.js');
const mandatoryDomains = [
  'distFreshness',
  'byteFloorWriteAdmission',
  'strictGateAdmission',
  'filesystemEffectProof',
  'knownExternalShellEffects',
  'codexNoBypassStaticPolicy',
  'bypassObserverDenyIntegration',
  'atomicityAudit',
  'selfExpansionValidatorLattice',
  'selfEvolutionAdmission',
  'capabilityMonotonicity',
  'atomicExecReadOnlyUsability',
  'codexAtomicOnlyProtocol',
  'codexEntrypointContract',
  'agentHookRuntimeBoundary',
  'codexHostWiring',
  'mcpLauncherHostBoundary',
  'universalStructuralEngine',
  'arbitraryInterpreterSandbox',
  'externalRuntimeState',
];

function parseToolResult(result) {
  const text = result.content?.at(-1)?.text ?? '{}';
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('invalid JSON tool result: ' + text.slice(0, 2000));
  }
}
function record(results, name, ok, detail) {
  results.push({ name, ok: Boolean(ok), detail });
}
function runProof(name) {
  const result = childProcess.spawnSync(process.execPath, [path.join(sourceDir, 'gates', name), '--json'], {
    cwd: sourceDir,
    encoding: 'utf8',
    timeout: 120000,
  });
  let parsed = null;
  try {
    parsed = JSON.parse(result.stdout || '{}');
  } catch (error) {
    parsed = { parseError: error instanceof Error ? error.message : String(error), stdout: result.stdout };
  }
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, parsed };
}
function domain(cert, name) {
  return Array.isArray(cert?.domains) ? cert.domains.find((entry) => entry.domain === name) : undefined;
}
function mandatoryDomainReport(cert) {
  const statuses = Object.fromEntries(mandatoryDomains.map((name) => [name, domain(cert, name)?.status ?? 'MISSING']));
  return {
    ok: mandatoryDomains.every((name) => domain(cert, name)?.status === 'GREEN'),
    statuses,
  };
}
async function main() {
  const results = [];
  record(results, 'compiled server exists before host Y proof', fs.existsSync(compiledServer), { compiledServer });
  if (!fs.existsSync(compiledServer)) return { ok: false, results };

  const entrypoint = runProof('codex-entrypoint-contract.proof.mjs');
  record(
    results,
    'Codex entrypoint contract is proven before whole-host certificate acceptance',
    entrypoint.status === 0 && entrypoint.parsed?.ok === true,
    entrypoint,
  );

  const stopAudit = runProof('trace-coverage-host-boundary.proof.mjs');
  record(
    results,
    'Stop-hook trace audit surfaces active host-boundary state and strict host-boundary failure mode',
    stopAudit.status === 0 && stopAudit.parsed?.ok === true,
    stopAudit,
  );

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [launcher, '--', process.execPath, compiledServer],
    cwd: repoRoot,
    stderr: 'pipe',
  });
  const client = new Client({ name: 'whole-host-y-certificate-proof', version: '1.0.0' });
  try {
    await client.connect(transport);
    const result = await client.callTool(
      { name: 'atomic_y_certificate', arguments: { scope: 'whole-host', includeAudits: true } },
      undefined,
      { timeout: 180000 },
    );
    const payload = parseToolResult(result);
    const domains = Array.isArray(payload.domains) ? payload.domains : [];
    const blockers = Array.isArray(payload.blockers) ? payload.blockers : [];
    const wholeHost = domains.find((entry) => entry.domain === 'wholeHostActionSpace');
    const bypass = domains.find((entry) => entry.domain === 'bypassLedger');
    const entrypointDomain = domains.find((entry) => entry.domain === 'codexEntrypointContract');
    const mandatory = mandatoryDomainReport(payload);
    const blockerDomains = blockers.map((entry) => entry.domain).sort();
    const onlyBypassLedgerBlocks = blockerDomains.length === 1 && blockerDomains[0] === 'bypassLedger';
    const certificateEntrypointGreen = entrypointDomain?.status === 'GREEN';
    const completeState =
      payload.ok === true &&
      payload.yComplete === true &&
      payload.verdict === 'Y_COMPLETE' &&
      blockerDomains.length === 0 &&
      wholeHost?.status === 'GREEN' &&
      certificateEntrypointGreen &&
      mandatory.ok;
    const honestBlockedState =
      payload.ok === true &&
      payload.yComplete === false &&
      payload.verdict === 'Y_BLOCKED' &&
      wholeHost?.status === 'GREEN' &&
      bypass?.status === 'UNJUDGED' &&
      onlyBypassLedgerBlocks &&
      certificateEntrypointGreen &&
      mandatory.ok;
    record(
      results,
      'host-launched MCP certifies whole-host boundary without hiding blockers and exposes mandatory domains',
      completeState || honestBlockedState,
      {
        yComplete: payload.yComplete,
        verdict: payload.verdict,
        blockerDomains,
        onlyBypassLedgerBlocks,
        certificateEntrypointGreen,
        mandatoryDomainsGreen: mandatory.ok,
        mandatoryDomainStatuses: mandatory.statuses,
        entrypointDomain,
        wholeHost,
        bypass,
      },
    );
  } finally {
    try { await client.close(); } catch {}
  }
  return { ok: results.every((entry) => entry.ok), results };
}
main().then((payload) => {
  if (jsonMode) console.log(JSON.stringify(payload, null, 2));
  else if (!payload.ok) console.error(JSON.stringify(payload, null, 2));
  process.exit(payload.ok ? 0 : 1);
}).catch((error) => {
  const payload = { ok: false, error: error instanceof Error ? error.message : String(error) };
  if (jsonMode) console.log(JSON.stringify(payload, null, 2));
  else console.error(payload.error);
  process.exit(1);
});
