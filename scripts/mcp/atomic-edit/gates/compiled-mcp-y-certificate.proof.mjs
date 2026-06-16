#!/usr/bin/env node
import * as childProcess from 'node:child_process';
import * as fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const jsonMode = process.argv.includes('--json');
const sourceDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(sourceDir, '..', '..', '..');
const launcher = path.resolve(sourceDir, '..', 'atomic-edit-mcp-launcher.sh');
const brokerScript = path.join(sourceDir, 'atomic-exec-broker.mjs');

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

function parseToolJson(result) {
  const text = result.content?.at(-1)?.text ?? '{}';
  return JSON.parse(text);
}

function parseJson(stdout) {
  try {
    return JSON.parse(stdout || '{}');
  } catch (error) {
    return { parseError: error instanceof Error ? error.message : String(error), stdout };
  }
}

function runBuild(timeout = 90000) {
  const result = childProcess.spawnSync(process.execPath, [path.join(sourceDir, 'build.mjs')], {
    cwd: sourceDir,
    encoding: 'utf8',
    timeout,
    maxBuffer: 64 * 1024 * 1024,
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function runProof(name, timeout = 90000) {
  const result = childProcess.spawnSync(process.execPath, [path.join(sourceDir, 'gates', name), '--json'], {
    cwd: sourceDir,
    encoding: 'utf8',
    timeout,
    maxBuffer: 64 * 1024 * 1024,
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, parsed: parseJson(result.stdout) };
}

function runAtomicityAudit(timeout = 90000) {
  const result = childProcess.spawnSync(
    process.execPath,
    [path.join(sourceDir, 'audit-atomicity.mjs'), '--strict-ratio', '--strict-current-topology', '--json'],
    {
      cwd: sourceDir,
      encoding: 'utf8',
      timeout,
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, parsed: parseJson(result.stdout) };
}

function domain(cert, name) {
  return Array.isArray(cert?.domains) ? cert.domains.find((entry) => entry.domain === name) : undefined;
}

function mandatoryDomainReport(cert, overrides = {}) {
  const statuses = Object.fromEntries(
    mandatoryDomains.map((name) => [name, overrides[name] ?? domain(cert, name)?.status ?? 'MISSING']),
  );
  return {
    ok: mandatoryDomains.every((name) => statuses[name] === 'GREEN'),
    statuses,
  };
}

function compactDetail(value, depth = 0) {
  if (typeof value === 'string') return value.length > 1000 ? value.slice(0, 1000) + '...<truncated>' : value;
  if (!value || typeof value !== 'object') return value;
  if (depth >= 3) return '[depth-limit]';
  if (Array.isArray(value)) return value.slice(0, 4).map((entry) => compactDetail(entry, depth + 1));
  const out = {};
  for (const [key, entry] of Object.entries(value)) {
    if (['detail', 'results'].includes(key) && depth > 0) continue;
    out[key] = compactDetail(entry, depth + 1);
  }
  return out;
}

function nonGreenDomainDetails(cert) {
  return (Array.isArray(cert?.domains) ? cert.domains : [])
    .filter((entry) => entry?.status !== 'GREEN')
    .map((entry) => ({
      domain: entry.domain,
      status: entry.status,
      evidence: compactDetail(entry.evidence),
      detail: compactDetail(entry.detail),
    }));
}

function writeJsonAtomic(file, obj) {
  const tmp = file + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj), { mode: 0o600 });
  fs.renameSync(tmp, file);
}

function brokerFileDir() {
  const requested = process.env.TMPDIR ? path.resolve(process.env.TMPDIR) : sourceDir;
  const base = requested.startsWith(sourceDir) ? requested : sourceDir;
  return path.join(base, `atomic-exec-broker-file-${process.pid}-${Date.now()}`);
}
function liveBrokerEndpoint(value) {
  const endpoint = typeof value === 'string' ? value.trim() : '';
  if (!endpoint) return null;
  if (endpoint.startsWith('file://')) {
    try {
      return fs.existsSync(path.join(fileURLToPath(endpoint), 'requests')) ? endpoint : null;
    } catch {
      return null;
    }
  }
  try {
    return fs.statSync(endpoint).isSocket() ? endpoint : null;
  } catch {
    return null;
  }
}

function stateBrokerEndpoint() {
  const candidates = new Set();
  for (const value of [process.env.ATOMIC_HOST_WRITE_ROOT, process.env.CODEX_PROJECT_DIR, repoRoot]) {
    if (value) candidates.add(path.resolve(value));
  }
  for (const root of candidates) {
    const statePath = path.join(root, '.atomic', 'codex-broker-current.json');
    try {
      const payload = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      if (payload?.agent === 'codex') {
        const endpoint = liveBrokerEndpoint(payload.socket);
        if (endpoint) return endpoint;
      }
    } catch {
      // Broker state is optional outside inherited host sessions.
    }
  }
  return null;
}

function inheritedBrokerEndpoint() {
  const endpoint = liveBrokerEndpoint(process.env.ATOMIC_EXEC_BROKER_SOCKET) ?? stateBrokerEndpoint();
  if (!endpoint) return null;
  if (
    process.env.ATOMIC_HOST_SANDBOX === 'macos-sandbox-exec' ||
    process.env.ATOMIC_HOST_ATOMIC_ONLY === '1' ||
    stateBrokerEndpoint()
  ) {
    return endpoint;
  }
  return null;
}

function brokerStateHostRoot(endpoint) {
  const candidates = new Set();
  for (const value of [process.env.ATOMIC_HOST_WRITE_ROOT, process.env.CODEX_PROJECT_DIR, repoRoot]) {
    if (value) candidates.add(path.resolve(value));
  }
  if (endpoint) {
    const marker = `${path.sep}.atomic${path.sep}`;
    const index = endpoint.indexOf(marker);
    if (index > 0) candidates.add(endpoint.slice(0, index));
  }
  for (const root of candidates) {
    const statePath = path.join(root, '.atomic', 'codex-broker-current.json');
    try {
      const payload = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      if (payload?.agent === 'codex' && typeof payload.repoRoot === 'string') {
        if (!endpoint || typeof payload.socket !== 'string' || path.resolve(payload.socket) === path.resolve(endpoint)) {
          return path.resolve(payload.repoRoot);
        }
      }
    } catch {
      // Broker state is optional outside inherited host sessions.
    }
  }
  return process.env.ATOMIC_HOST_WRITE_ROOT ? path.resolve(process.env.ATOMIC_HOST_WRITE_ROOT) : repoRoot;
}


function startBroker() {
  const brokerDir = brokerFileDir();
  const endpoint = pathToFileURL(brokerDir).href;
  const proc = childProcess.spawn(process.execPath, [brokerScript, endpoint], {
    cwd: repoRoot,
    env: { ...process.env, ATOMIC_EXEC_BROKER_ROOT: repoRoot, TMPDIR: sourceDir, TMP: sourceDir, TEMP: sourceDir },
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
      try {
        proc.kill('SIGTERM');
      } catch {
        // best effort
      }
      reject(new Error(`broker did not become ready: stdout=${stdout} stderr=${stderr}`));
    }, 5000);
    proc.on('exit', (code) => {
      clearTimeout(deadline);
      if (!stdout.includes('ATOMIC_BROKER_READY')) {
        reject(new Error(`broker exited before ready: code=${code} stdout=${stdout} stderr=${stderr}`));
      }
    });
    const poll = setInterval(() => {
      if (stdout.includes('ATOMIC_BROKER_READY') && fs.existsSync(path.join(brokerDir, 'requests'))) {
        clearTimeout(deadline);
        clearInterval(poll);
        resolve({ proc, endpoint, brokerDir, stdout, stderr });
      }
    }, 25);
  });
}

async function stopBroker(broker) {
  if (!broker?.brokerDir) return;
  const requests = path.join(broker.brokerDir, 'requests');
  const responses = path.join(broker.brokerDir, 'responses');
  if (!fs.existsSync(requests)) return;
  const id = `shutdown-${process.pid}-${Date.now()}.json`;
  const requestFile = path.join(requests, id);
  const responseFile = path.join(responses, id);
  try {
    fs.mkdirSync(requests, { recursive: true, mode: 0o700 });
    fs.mkdirSync(responses, { recursive: true, mode: 0o700 });
    writeJsonAtomic(requestFile, { atomicBrokerShutdown: true });
  } catch {
    return;
  }
  const deadline = Date.now() + 1000;
  await new Promise((resolve) => {
    const poll = () => {
      if (fs.existsSync(responseFile) || Date.now() > deadline) {
        try {
          fs.rmSync(responseFile, { force: true });
        } catch {
          // best effort
        }
        resolve();
        return;
      }
      setTimeout(poll, 25);
    };
    poll();
  });
}

function finish(payload) {
  const stream = jsonMode || payload.ok ? process.stdout : process.stderr;
  stream.write(JSON.stringify(payload, null, 2) + '\n', () => {
    process.exit(payload.ok ? 0 : 1);
  });
}

async function main() {
  let freshness = runProof('dist-freshness.proof.mjs');
  let distFreshnessGreen = freshness.status === 0 && freshness.parsed?.ok === true;
  let build = {
    status: 0,
    stdout: '',
    stderr: '',
    skipped: true,
    reason: 'dist already fresh before compiled certificate proof',
  };
  let buildGreen = true;
  if (!distFreshnessGreen) {
    build = runBuild();
    buildGreen = build.status === 0;
    if (!buildGreen) {
      return { ok: false, build, freshness, assertion: { buildGreen, distFreshnessGreen } };
    }
    freshness = runProof('dist-freshness.proof.mjs');
    distFreshnessGreen = freshness.status === 0 && freshness.parsed?.ok === true;
  }
  if (!distFreshnessGreen) {
    return { ok: false, build, freshness, assertion: { buildGreen, distFreshnessGreen } };
  }

  const entrypoint = runProof('codex-entrypoint-contract.proof.mjs');
  const entrypointGreen = entrypoint.status === 0 && entrypoint.parsed?.ok === true;
  if (!entrypointGreen) {
    return { ok: false, entrypoint, assertion: { entrypointGreen } };
  }

  const atomicityAudit = runAtomicityAudit();
  const atomicityAuditGreen =
    atomicityAudit.status === 0 &&
    atomicityAudit.parsed?.enforcementPass === true &&
    atomicityAudit.parsed?.ratioPass === true &&
    atomicityAudit.parsed?.currentTopologyPass === true &&
    atomicityAudit.parsed?.fallback_rate === 0;
  if (!atomicityAuditGreen) {
    return { ok: false, entrypoint, atomicityAudit, assertion: { entrypointGreen, atomicityAuditGreen } };
  }

  const inheritedEndpoint = inheritedBrokerEndpoint();
  const spawnedBroker = inheritedEndpoint ? null : await startBroker();
  const brokerEndpoint = inheritedEndpoint ?? spawnedBroker.endpoint;
  const hostRoot = brokerStateHostRoot(brokerEndpoint);
  const transport = new StdioClientTransport({
    command: launcher,
    args: [],
    cwd: hostRoot,
    stderr: 'pipe',
    env: {
      ...process.env,
      ATOMIC_HOST_SANDBOX: process.env.ATOMIC_HOST_SANDBOX || 'macos-sandbox-exec',
      ATOMIC_HOST_ATOMIC_ONLY: process.env.ATOMIC_HOST_ATOMIC_ONLY || '1',
      ATOMIC_HOST_WRITE_ROOT: process.env.ATOMIC_HOST_WRITE_ROOT || hostRoot,
      ATOMIC_EXEC_BROKER_SOCKET: brokerEndpoint,
      ATOMIC_EXEC_BROKER_ROOT: '',
      ATOMIC_ALLOW_NESTED_PROOF_BROKER: '1',
      CODEX_PROJECT_DIR: hostRoot,
      TMPDIR: hostRoot,
      TMP: hostRoot,
      TEMP: hostRoot,
      ATOMIC_SINGLE_TOOL_CALL: '',
      ATOMIC_SINGLE_TOOL_NAME: '',
      ATOMIC_SINGLE_TOOL_ARGS_JSON: '',
    },
  });
  const client = new Client({ name: 'compiled-mcp-y-certificate-proof', version: '1.0.0' });
  try {
    await client.connect(transport);
    const cert = parseToolJson(await client.callTool({ name: 'atomic_y_certificate', arguments: { scope: 'mcp-controlled', includeAudits: false } }, undefined, { timeout: 300000 }));
    const bypass = domain(cert, 'bypassLedger');
    const staticPolicy = domain(cert, 'codexNoBypassStaticPolicy');
    const entrypointDomain = domain(cert, 'codexEntrypointContract');
    const childAtomicityAudit = domain(cert, 'atomicityAudit');
    const mandatory = mandatoryDomainReport(cert, { atomicityAudit: atomicityAuditGreen ? 'GREEN' : 'RED' });
    const bypassReportStatus = String(bypass?.detail?.status ?? 'missing');
    const blockerDomains = Array.isArray(cert?.blockers) ? cert.blockers.map((entry) => entry.domain).sort() : [];
    const effectiveBlockerDomains = blockerDomains.filter((entry) => !(entry === 'atomicityAudit' && atomicityAuditGreen));
    const bypassIsHonestBlock = bypass?.status === 'UNJUDGED' && bypassReportStatus !== 'observed-clean' && effectiveBlockerDomains.includes('bypassLedger');
    const onlyBypassLedgerBlocks = effectiveBlockerDomains.length === 1 && effectiveBlockerDomains[0] === 'bypassLedger';
    const certificateEntrypointGreen = entrypointDomain?.status === 'GREEN';
    const parentAuditCompletesCertificate =
      cert?.ok === true &&
      cert?.verdict === 'Y_BLOCKED' &&
      childAtomicityAudit?.status === 'UNJUDGED' &&
      blockerDomains.includes('atomicityAudit') &&
      effectiveBlockerDomains.length === 0 &&
      atomicityAuditGreen;
    const completeState =
      cert?.ok === true &&
      effectiveBlockerDomains.length === 0 &&
      bypass?.status === 'GREEN' &&
      staticPolicy?.status === 'GREEN' &&
      certificateEntrypointGreen &&
      mandatory.ok &&
      (cert?.yComplete === true || parentAuditCompletesCertificate);
    const honestBlockedState = cert?.ok === true && cert?.yComplete === false && cert?.verdict === 'Y_BLOCKED' && bypassIsHonestBlock && onlyBypassLedgerBlocks && certificateEntrypointGreen && mandatory.ok;
    return { ok: entrypointGreen && atomicityAuditGreen && (completeState || honestBlockedState), entrypoint, atomicityAudit, certificate: cert, assertion: { entrypointGreen, atomicityAuditGreen, childAtomicityAuditStatus: childAtomicityAudit?.status, certificateEntrypointGreen, mandatoryDomainsGreen: mandatory.ok, mandatoryDomainStatuses: mandatory.statuses, nonGreenDomainDetails: nonGreenDomainDetails(cert), bypassStatus: bypass?.status, bypassReportStatus, staticPolicyStatus: staticPolicy?.status, entrypointDomainStatus: entrypointDomain?.status, bypassIsHonestBlock, blockerDomains, effectiveBlockerDomains, onlyBypassLedgerBlocks, parentAuditCompletesCertificate, completeState, honestBlockedState } };
  } finally {
    try { await client.close(); } catch { /* best effort */ }
    if (spawnedBroker) await stopBroker(spawnedBroker);
  }
}
main()
  .then(finish)
  .catch((error) => {
    finish({ ok: false, error: error instanceof Error ? error.message : String(error) });
  });
