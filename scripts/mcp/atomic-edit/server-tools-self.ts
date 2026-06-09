import * as childProcess from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { resolveSafeTarget, REPO_ROOT } from './guard.js';
import { guardSha, atomicWrite, readUtf8, sha256, targetDetails } from './server-helpers-io.js';
import { withSelfExpansionAdmission, isAtomicSelfExpansionPath } from './server-helpers-self-expansion.js';
import { ok, fail } from './server-helpers-result.js';
import { captureEffectSnapshot, diffEffect, rollbackEffectStrict, type FileEffect } from './server-helpers-effect.js';
import { requireNegativeActionProof, requireNegativeProofForRemovedBytes, type NegativeActionProof } from './server-helpers-negative-proof.js';
import { registerToolsDispatch } from './server-tools-dispatch.js';

interface SelfFileOp {
  op: 'create' | 'replace' | 'delete' | 'replace_text';
  file: string;
  content?: string;
  oldText?: string;
  newText?: string;
  occurrence?: number;
  expectedSha256?: string;
  proofOfIncorrectness?: string;
}

interface SelfExpansionValidator {
  phase: string;
  command: string;
}

const MANDATORY_SELF_EXPANSION_VALIDATORS: readonly SelfExpansionValidator[] = [
  { phase: 'build', command: 'node build.mjs' },
  { phase: 'runtime-integrity', command: 'node gates/dist-live-integrity.proof.mjs --json' },
  { phase: 'runtime-freshness', command: 'node gates/dist-freshness.proof.mjs --json' },
  { phase: 'type', command: 'node gates/type-soundness-gate.proof.mjs --json' },
  { phase: 'semantic', command: 'node gates/structural-lint-gate.proof.mjs --json' },
  { phase: 'semantic-impact', command: 'node gates/algebra.proof.mjs' },
  { phase: 'semantic-impact', command: 'node gates/closure-universal.proof.mjs' },
  { phase: 'semantic-impact', command: 'node gates/merge.proof.mjs' },
  { phase: 'reachability', command: 'node dist/gates/reachability-gate.proof.js' },
  { phase: 'binding', command: 'node dist/gates/binding-gate.proof.js' },
  { phase: 'convergence', command: 'node gates/converge-operator.proof.mjs' },
  { phase: 'runtime-probe', command: 'node dist/gates/probe-convergence-gate.proof.js' },
  { phase: 'formal', command: 'node dist/gates/formal-gate.proof.js' },
  { phase: 'property', command: 'node dist/gates/property-gate.proof.js' },
  { phase: 'findings-delta', command: 'node dist/gates/findings-delta-gate.proof.js' },
  { phase: 'contract-edge', command: 'node dist/gates/contract-edge-gate.proof.js' },
  { phase: 'public-contract', command: 'node gates/public-contract-gate.proof.mjs --json' },
  { phase: 'behavior', command: 'node gates/behavior-contract-gate.proof.mjs --json' },
  { phase: 'coordination', command: 'node gates/atomic-product-locks.proof.mjs --json' },
  { phase: 'security', command: 'node gates/security-gate.proof.mjs --json' },
  { phase: 'security', command: 'node gates/chrome-devtools-bridge.proof.mjs --json' },
  { phase: 'monotonicity', command: 'node gates/security-monotonicity.proof.mjs --json' },
  { phase: 'self-lattice', command: 'node gates/self-expansion-validator-lattice.proof.mjs --json' },
  { phase: 'self-evolution', command: 'node gates/self-evolution-harness.proof.mjs --json' },
  { phase: 'self-evolution-tool', command: 'node gates/self-evolution-mcp-tool.proof.mjs --json' },
  { phase: 'benchmark', command: 'node gates/atomic-agent-bench.proof.mjs' },
  { phase: 'test', command: 'node gates/test-execution-gate.proof.mjs --json' },
  { phase: 'ledger', command: 'node proof-chain.proof.mjs --json' },
  { phase: 'certificate', command: 'node gates/y-certificate-mandatory-domains.proof.mjs --json' },
  { phase: 'runtime', command: 'node gates/codex-entrypoint-contract.proof.mjs --json' },
  { phase: 'agent-runtime', command: 'node gates/agent-hook-runtime-boundary.proof.mjs --json' },
  { phase: 'runtime', command: 'node gates/compiled-mcp-y-certificate.proof.mjs --json' },
  { phase: 'usability', command: 'node gates/atomic-exec-readonly-usability.proof.mjs --json' },
  { phase: 'effect-metadata', command: 'node gates/effect-metadata-mode.proof.mjs --json' },
  { phase: 'effect-admission', command: 'node gates/atomic-exec-prove-effect-required.proof.mjs --json' },
  { phase: 'no-bypass', command: 'node gates/atomic-exec-indirection-denial.proof.mjs --json' },
  { phase: 'effect-scope', command: 'node gates/self-expansion-unexpected-effects.proof.mjs --json' },
  { phase: 'no-bypass', command: 'node codex-atomic-only-hook.proof.mjs --json' },
];

function parseFileOps(raw: unknown[]): SelfFileOp[] {
  return raw.map((entry) => {
    const e = entry as Record<string, unknown>;
    return {
      op: e.op === 'replace' || e.op === 'delete' || e.op === 'replace_text' ? e.op : 'create',
      file: String(e.file ?? ''),
      content: typeof e.content === 'string' ? e.content : undefined,
      oldText: typeof e.oldText === 'string' ? e.oldText : undefined,
      newText: typeof e.newText === 'string' ? e.newText : undefined,
      occurrence: typeof e.occurrence === 'number' && Number.isInteger(e.occurrence) && e.occurrence > 0 ? e.occurrence : undefined,
      expectedSha256: typeof e.expectedSha256 === 'string' ? e.expectedSha256 : undefined,
      proofOfIncorrectness: typeof e.proofOfIncorrectness === 'string' ? e.proofOfIncorrectness : undefined,
    };
  });
}

function allowedProofCommand(command: string): boolean {
  const c = command.trim();
  return (
    c === 'node build.mjs' ||
    c === 'node dist/smoke.js' ||
    /^node [A-Za-z0-9_.-]+\.proof\.mjs(?: --json)?$/.test(c) ||
    /^node gates\/[A-Za-z0-9_.-]+\.proof\.mjs(?: --json)?$/.test(c) ||
    /^node dist\/gates\/[A-Za-z0-9_.-]+\.proof\.js$/.test(c) ||
    /^npx tsx gates\/[A-Za-z0-9_.-]+\.proof\.ts$/.test(c)
  );
}

function normalizeSelfExpansionProofCommands(raw: readonly string[] | undefined): string[] {
  const merged = new Map<string, string>();
  for (const validator of MANDATORY_SELF_EXPANSION_VALIDATORS) merged.set(validator.command, validator.command);
  for (const command of raw ?? []) {
    const trimmed = command.trim();
    if (trimmed.length > 0) merged.set(trimmed, trimmed);
  }
  return [...merged.values()];
}

function proofTimeoutMs(command: string): number {
  if (command === 'node dist/smoke.js') return 240000;
  if (
    command.includes('compiled-mcp-y-certificate') ||
    command.includes('codex-entrypoint-contract') ||
    command.includes('type-soundness-gate') ||
    command.includes('algebra.proof.mjs') ||
    command.includes('contract-edge-gate') ||
    command.includes('self-evolution-mcp-tool')
  ) {
    return 90000;
  }
  return 60000;
}

function selfExpansionBrokerSocketPath(): string | null {
  const value = process.env.ATOMIC_EXEC_BROKER_SOCKET?.trim();
  if (!value) return null;
  return fs.existsSync(value) ? value : null;
}

function shellPath(value: string): string {
  return JSON.stringify(String(value));
}

type ProofCommandResult = { command: string; ok: boolean; stdout: string; stderr: string };

const SELF_EXPANSION_PROOF_CONCURRENCY = 8;
const SELF_EXPANSION_PROOF_GLOBAL_BUDGET_MS = 105000;
const SELF_EXPANSION_PROOF_DEADLINE_SAFETY_MS = 3000;
const PROOF_OUTPUT_MAX_BYTES = 32 * 1024 * 1024;

function appendProofOutput(current: string, chunk: Buffer | string, maxBytes = PROOF_OUTPUT_MAX_BYTES): string {
  if (current.length >= maxBytes) return current;
  const next = current + String(chunk);
  if (next.length <= maxBytes) return next;
  return next.slice(0, maxBytes) + '\n[atomic proof output truncated]';
}

function proofCommandConcurrency(): number {
  const raw = Number(process.env.ATOMIC_SELF_EXPANSION_PROOF_CONCURRENCY ?? '');
  if (Number.isFinite(raw) && raw > 0) return Math.max(1, Math.min(16, Math.floor(raw)));
  return SELF_EXPANSION_PROOF_CONCURRENCY;
}

function proofGlobalBudgetMs(): number {
  const raw = Number(process.env.ATOMIC_SELF_EXPANSION_PROOF_GLOBAL_BUDGET_MS ?? '');
  if (Number.isFinite(raw) && raw > 0) {
    return Math.max(30000, Math.min(115000, Math.floor(raw)));
  }
  return SELF_EXPANSION_PROOF_GLOBAL_BUDGET_MS;
}

function remainingProofBudgetMs(deadlineMs: number): number {
  return Math.max(1000, deadlineMs - Date.now() - SELF_EXPANSION_PROOF_DEADLINE_SAFETY_MS);
}

function proofTimeoutForDeadline(command: string, deadlineMs: number): number {
  return Math.min(proofTimeoutMs(command), remainingProofBudgetMs(deadlineMs));
}

function proofCommandPriority(command: string): number {
  const priorities: Array<[string, number]> = [
    ['compiled-mcp-y-certificate', 0],
    ['type-soundness-gate', 1],
    ['algebra.proof.mjs', 2],
    ['contract-edge-gate', 3],
    ['self-evolution-mcp-tool', 4],
    ['codex-entrypoint-contract', 5],
    ['atomic-exec-readonly-usability', 6],
    ['property-gate', 7],
    ['formal-gate', 8],
  ];
  return priorities.find(([needle]) => command.includes(needle))?.[1] ?? 100;
}

function runProofCommandDirect(
  command: string,
  cwd: string,
  timeoutMs: number,
  env: NodeJS.ProcessEnv = process.env,
): Promise<ProofCommandResult> {
  return new Promise((resolve) => {
    const child = childProcess.spawn('/bin/bash', ['-c', command], {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    let timer: NodeJS.Timeout | undefined;
    const finish = (result: ProofCommandResult) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(result);
    };
    const forceKill = () => {
      try {
        child.kill('SIGKILL');
      } catch {
        /* best-effort */
      }
    };
    timer = setTimeout(() => {
      stderr = appendProofOutput(stderr, '\n[atomic proof timed out after ' + timeoutMs + 'ms]');
      try {
        child.kill('SIGTERM');
      } catch {
        /* best-effort */
      }
      setTimeout(forceKill, 1000).unref();
      finish({ command, ok: false, stdout, stderr });
    }, timeoutMs);
    child.stdout?.on('data', (chunk) => {
      stdout = appendProofOutput(stdout, chunk);
    });
    child.stderr?.on('data', (chunk) => {
      stderr = appendProofOutput(stderr, chunk);
    });
    child.on('error', (error) => {
      finish({ command, ok: false, stdout, stderr: appendProofOutput(stderr, error.message) });
    });
    child.on('close', (code) => {
      finish({ command, ok: code === 0, stdout, stderr });
    });
  });
}

function runProofCommandViaBroker(command: string, cwd: string, timeoutMs: number): Promise<ProofCommandResult | null> {
  const socket = selfExpansionBrokerSocketPath();
  if (!socket) return Promise.resolve(null);
  const brokerRoot = process.env.ATOMIC_HOST_WRITE_ROOT ?? REPO_ROOT;
  const codexHome = process.env.CODEX_HOME ?? path.join(brokerRoot, '.codex');
  const client = path.join(brokerRoot, 'scripts/mcp/atomic-edit/atomic-exec-broker-client.mjs');
  const req = {
    command,
    cwd,
    effectRoot: cwd,
    timeoutMs,
    env: {
      ATOMIC_BUILD_BROKER: '1',
      ATOMIC_HOST_ATOMIC_ONLY: process.env.ATOMIC_HOST_ATOMIC_ONLY ?? '1',
      ATOMIC_HOST_SANDBOX: process.env.ATOMIC_HOST_SANDBOX ?? 'macos-sandbox-exec',
      ATOMIC_HOST_WRITE_ROOT: brokerRoot,
      ATOMIC_EXEC_BROKER_SOCKET: socket,
      CODEX_HOME: codexHome,
      CODEX_PROJECT_DIR: brokerRoot,
      TMPDIR: brokerRoot,
      TMP: brokerRoot,
      TEMP: brokerRoot,
    },
  };
  return new Promise((resolve) => {
    const child = childProcess.spawn(process.execPath, [client, socket], {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    let timer: NodeJS.Timeout | undefined;
    const finish = (result: ProofCommandResult | null) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(result);
    };
    const forceKill = () => {
      try {
        child.kill('SIGKILL');
      } catch {
        /* best-effort */
      }
    };
    timer = setTimeout(() => {
      stderr = appendProofOutput(stderr, '\n[atomic proof broker timed out after ' + (timeoutMs + 5000) + 'ms]');
      try {
        child.kill('SIGTERM');
      } catch {
        /* best-effort */
      }
      setTimeout(forceKill, 1000).unref();
      finish({ command, ok: false, stdout, stderr });
    }, timeoutMs + 5000);
    child.stdout?.on('data', (chunk) => {
      stdout = appendProofOutput(stdout, chunk, 64 * 1024 * 1024);
    });
    child.stderr?.on('data', (chunk) => {
      stderr = appendProofOutput(stderr, chunk, 64 * 1024 * 1024);
    });
    child.on('error', (error) => {
      finish({ command, ok: false, stdout, stderr: appendProofOutput(stderr, error.message) });
    });
    child.on('close', () => {
      let reply: Record<string, unknown>;
      try {
        reply = JSON.parse(stdout || '{}') as Record<string, unknown>;
      } catch {
        finish({ command, ok: false, stdout, stderr: 'proof broker returned unparseable output: ' + String(stdout).slice(0, 300) });
        return;
      }
      finish({
        command,
        ok: reply.ok === true && reply.exitCode === 0,
        stdout: String(reply.stdout ?? ''),
        stderr: String(reply.stderr ?? reply.error ?? stderr ?? ''),
      });
    });
    child.stdin?.end(JSON.stringify(req));
  });
}

function selfExpansionProofRoot(): string {
  const socket = selfExpansionBrokerSocketPath();
  const candidates = new Set<string>();
  for (const value of [REPO_ROOT, process.env.ATOMIC_HOST_WRITE_ROOT, process.env.CODEX_PROJECT_DIR]) {
    if (value) candidates.add(path.resolve(value));
  }
  if (socket) {
    const marker = `${path.sep}.atomic${path.sep}`;
    const index = socket.indexOf(marker);
    if (index > 0) candidates.add(socket.slice(0, index));
  }
  const explicitHostRoot = process.env.ATOMIC_HOST_WRITE_ROOT ? path.resolve(process.env.ATOMIC_HOST_WRITE_ROOT) : '';
  if (explicitHostRoot) return explicitHostRoot;
  for (const root of candidates) {
    const statePath = path.join(root, '.atomic', 'codex-broker-current.json');
    try {
      const payload = JSON.parse(fs.readFileSync(statePath, 'utf8')) as { agent?: unknown; repoRoot?: unknown; socket?: unknown };
      if (payload.agent === 'codex' && typeof payload.repoRoot === 'string') {
        if (!socket || typeof payload.socket !== 'string' || path.resolve(payload.socket) === path.resolve(socket)) {
          return path.resolve(payload.repoRoot);
        }
      }
    } catch {
      // Keep searching; broker state may be absent in non-hosted contexts.
    }
  }
  if (socket) {
    const marker = `${path.sep}.atomic${path.sep}`;
    const index = socket.indexOf(marker);
    if (index > 0) return socket.slice(0, index);
  }
  return process.env.ATOMIC_HOST_WRITE_ROOT ?? REPO_ROOT;
}

function selfExpansionProofTempRoot(hostRoot: string): string {
  const requested = process.env.TMPDIR ? path.resolve(process.env.TMPDIR) : '';
  const selfRoot = path.join(REPO_ROOT, 'scripts/mcp/atomic-edit');
  if (requested === selfRoot || requested.startsWith(selfRoot + path.sep)) return requested;
  return hostRoot;
}

function selfExpansionHostProofEnv(socket: string, cwd: string): NodeJS.ProcessEnv {
  const hostRoot = selfExpansionProofRoot();
  const tempRoot = selfExpansionProofTempRoot(hostRoot);
  return {
    ...process.env,
    ATOMIC_BUILD_BROKER: '1',
    ATOMIC_HOST_ATOMIC_ONLY: process.env.ATOMIC_HOST_ATOMIC_ONLY ?? '1',
    ATOMIC_HOST_SANDBOX: process.env.ATOMIC_HOST_SANDBOX ?? 'macos-sandbox-exec',
    ATOMIC_HOST_WRITE_ROOT: hostRoot,
    ATOMIC_EXEC_BROKER_SOCKET: socket,
    ATOMIC_EXEC_BROKER_ROOT: hostRoot,
    CODEX_HOME: process.env.CODEX_HOME ?? path.join(hostRoot, '.codex'),
    CODEX_PROJECT_DIR: hostRoot,
    TMPDIR: tempRoot,
    TMP: tempRoot,
    TEMP: tempRoot,
  };
}

function selfExpansionProofCwd(): string {
  return path.join(selfExpansionProofRoot(), 'scripts/mcp/atomic-edit');
}

function selfExpansionProofMustRunHostDirect(command: string): boolean {
  return [
    'build.mjs',
    'atomic-exec-readonly-usability.proof.mjs',
    'atomic-exec-sandbox.proof.mjs',
    'external-runtime-denial.proof.mjs',
    'mcp-launcher-host-boundary.proof.mjs',
    'codex-entrypoint-contract.proof.mjs',
    'compiled-mcp-y-certificate.proof.mjs',
    'whole-host-sandbox-launcher.proof.mjs',
    'whole-host-y-certificate.proof.mjs',
  ].some((name) => command.includes(name));
}

async function runSingleProofCommand(command: string, cwd: string, deadlineMs: number): Promise<ProofCommandResult> {
  if (Date.now() >= deadlineMs - SELF_EXPANSION_PROOF_DEADLINE_SAFETY_MS) {
    return { command, ok: false, stdout: '', stderr: 'skipped: self-expansion proof global budget exhausted before start' };
  }
  const timeout = proofTimeoutForDeadline(command, deadlineMs);
  const socket = selfExpansionBrokerSocketPath();
  if (socket && selfExpansionProofMustRunHostDirect(command)) {
    return runProofCommandDirect(command, cwd, timeout, selfExpansionHostProofEnv(socket, cwd));
  }
  return (await runProofCommandViaBroker(command, cwd, timeout)) ?? runProofCommandDirect(command, cwd, timeout);
}

async function runProofCommands(commands: string[]): Promise<ProofCommandResult[]> {
  const cwd = selfExpansionProofCwd();
  const deadlineMs = Date.now() + proofGlobalBudgetMs();
  const results = new Array<ProofCommandResult>(commands.length);
  let startIndex = 0;
  if (commands[0] === 'node build.mjs') {
    results[0] = await runSingleProofCommand(commands[0], cwd, deadlineMs);
    startIndex = 1;
    if (!results[0].ok) {
      for (let index = startIndex; index < commands.length; index += 1) {
        results[index] = { command: commands[index], ok: false, stdout: '', stderr: 'skipped after node build.mjs failed' };
      }
      return results;
    }
  }
  const queue = commands.slice(startIndex).map((command, offset) => ({
    command,
    index: startIndex + offset,
    priority: proofCommandPriority(command),
  }));
  queue.sort((left, right) => left.priority - right.priority || left.index - right.index);
  let nextIndex = 0;
  const workerCount = Math.min(proofCommandConcurrency(), queue.length);
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (true) {
        const item = queue[nextIndex];
        nextIndex += 1;
        if (!item) return;
        results[item.index] = await runSingleProofCommand(item.command, cwd, deadlineMs);
      }
    }),
  );
  for (let index = 0; index < commands.length; index += 1) {
    if (!results[index]) {
      results[index] = { command: commands[index], ok: false, stdout: '', stderr: 'skipped: self-expansion proof global budget exhausted' };
    }
  }
  return results;
}
function proofFailureSnippet(value: string, maxBytes = 1200): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return trimmed.length > maxBytes ? trimmed.slice(0, maxBytes) + '...<truncated>' : trimmed;
}

function proofFailureStdoutSummary(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  try {
    const parsed = JSON.parse(trimmed) as {
      ok?: unknown;
      error?: unknown;
      assertion?: unknown;
      certificate?: {
        blockers?: unknown;
        domains?: { domain?: unknown; status?: unknown; evidence?: unknown; requiredChange?: unknown; detail?: unknown }[];
      };
    };
    const nonGreen = Array.isArray(parsed.certificate?.domains)
      ? parsed.certificate.domains
          .filter((domain) => domain.status !== 'GREEN')
          .map((domain) => ({
            domain: domain.domain,
            status: domain.status,
            evidence: proofFailureSnippet(String(domain.evidence ?? ''), 4000),
            requiredChange: proofFailureSnippet(String(domain.requiredChange ?? ''), 300),
            detail: proofFailureSnippet(JSON.stringify(domain.detail ?? null), 500),
          }))
      : undefined;
    return JSON.stringify({
      ok: parsed.ok,
      error: parsed.error,
      assertion: parsed.assertion,
      blockers: parsed.certificate?.blockers,
      nonGreen,
    });
  } catch {
    return trimmed;
  }
}

function formatFailedProofs(failed: { command: string; stdout: string; stderr: string }[]): string {
  return failed
    .map((proof) => {
      const parts = [proof.command];
      const stderr = proofFailureSnippet(proof.stderr);
      const stdout = proofFailureSnippet(proofFailureStdoutSummary(proof.stdout), 8000);
      if (stderr) parts.push('stderr=' + JSON.stringify(stderr));
      if (stdout) parts.push('stdout=' + JSON.stringify(stdout));
      return parts.join(' ');
    })
    .join('; ');
}

/**
 * Proof #5 - capability monotonicity, enforced. Runs security-invariants.mjs in
 * --enforce mode: it measures the engine's own security surface (write-gate count,
 * exec FORBIDDEN laws, native-edit bans, sync byte-floor gates, byte-floor guards)
 * and refuses (exit 1) if any fell below its ratcheting high-water baseline.
 * Mandatory and non-skippable - it is both a pre-proof refusal and an explicit
 * validator-lattice phase. A regression throws here and the expand_self catch
 * rolls back byte-exact. With { ratchet: true } it additionally persists the new
 * max() baseline (used only AFTER all proofs pass, so a validated strengthening
 * locks immediately).
 */
function enforceSecurityMonotonicity(options: { ratchet?: boolean } = {}): void {
  const args = options.ratchet ? ['security-invariants.mjs', '--enforce', '--ratchet'] : ['security-invariants.mjs', '--enforce'];
  const res = childProcess.spawnSync(process.execPath, args, {
    cwd: path.join(REPO_ROOT, 'scripts/mcp/atomic-edit'),
    encoding: 'utf8',
    timeout: 30000,
  });
  if (res.status !== 0) {
    throw new Error(
      `security monotonicity refused this expansion: ${(res.stderr || res.stdout || 'unknown').toString().trim()}`,
    );
  }
}

function isEphemeralSelfExpansionEffect(file: string): boolean {
  const rel = file.replaceAll('\\', '/');
  return rel.startsWith('.proof-') || rel.startsWith('.atomic-exec-sandbox-') || rel.startsWith('.external-runtime-denial-');
}

function selfRootRelativeEffectPath(file: string): string {
  const rel = file.replaceAll('\\', '/');
  const prefix = 'scripts/mcp/atomic-edit/';
  return rel.startsWith(prefix) ? rel.slice(prefix.length) : rel;
}

function assertNoUnexpectedSelfExpansionEffects(effects: FileEffect[], applied: { file: string }[]): void {
  const requested = new Set(applied.map((entry) => selfRootRelativeEffectPath(entry.file)));
  const unexpected = effects.filter((effect) => {
    const rel = selfRootRelativeEffectPath(effect.file);
    return !requested.has(rel) && !isEphemeralSelfExpansionEffect(rel);
  });
  if (unexpected.length > 0) {
    throw new Error(
      `self-expansion produced unrequested non-fixture effect(s): ${unexpected.map((effect) => effect.file).join(', ')}`,
    );
  }
}

function ensureSelfTarget(absPath: string, relPath: string): void {
  if (!isAtomicSelfExpansionPath(REPO_ROOT, absPath)) {
    throw new Error(
      `atomic_expand_self only admits files inside scripts/mcp/atomic-edit/**; got ${relPath}. ` +
        `Use product-level atomic tools for product code, not self-expansion.`,
    );
  }
}

function applySelfFileOp(entry: SelfFileOp, guardedRelPaths?: Set<string>): { file: string; op: SelfFileOp['op']; beforeSha256: string | null; afterSha256: string | null; negativeActionProof?: NegativeActionProof } {
  const { absPath, relPath } = resolveSafeTarget(entry.file);
  ensureSelfTarget(absPath, relPath);
  const exists = fs.existsSync(absPath);
  const before = exists && fs.statSync(absPath).isFile() ? readUtf8(absPath) : null;
  const firstTouch = !guardedRelPaths?.has(relPath);
  if (firstTouch && before !== null) guardSha(before, entry.expectedSha256);
  if (firstTouch) guardedRelPaths?.add(relPath);
  if (entry.op === 'create') {
    if (before !== null && before.length > 0) throw new Error(`refused: ${relPath} already exists; use op=replace with sha proof.`);
    atomicWrite(absPath, entry.content ?? '');
    return { file: relPath, op: entry.op, beforeSha256: before === null ? null : sha256(before), afterSha256: sha256(entry.content ?? '') };
  }
  if (entry.op === 'replace') {
    if (before === null) throw new Error(`refused: ${relPath} does not exist; use op=create.`);
    if (entry.content === undefined) throw new Error(`refused: ${relPath} replace requires content.`);
    const negativeActionProof = requireNegativeProofForRemovedBytes({
      action: 'atomic_expand_self:replace',
      target: relPath,
      targetUnit: 'self-file',
      before,
      after: entry.content,
      proofOfIncorrectness: entry.proofOfIncorrectness,
    });
    atomicWrite(absPath, entry.content);
    return {
      file: relPath,
      op: entry.op,
      beforeSha256: sha256(before),
      afterSha256: sha256(entry.content),
      ...(negativeActionProof ? { negativeActionProof } : {}),
    };
  }
  if (entry.op === 'replace_text') {
    if (before === null) throw new Error(`refused: ${relPath} does not exist; replace_text requires an existing self file.`);
    if (entry.oldText === undefined || entry.oldText.length === 0) {
      throw new Error(`refused: ${relPath} replace_text requires non-empty oldText.`);
    }
    if (entry.newText === undefined) throw new Error(`refused: ${relPath} replace_text requires newText.`);
    const matches: number[] = [];
    let index = before.indexOf(entry.oldText);
    while (index !== -1) {
      matches.push(index);
      index = before.indexOf(entry.oldText, index + entry.oldText.length);
    }
    if (matches.length === 0) throw new Error(`refused: ${relPath} replace_text oldText matched 0 ranges.`);
    if (entry.occurrence === undefined && matches.length !== 1) {
      throw new Error(`refused: ${relPath} replace_text matched ${matches.length} ranges; pass occurrence.`);
    }
    const matchIndex = entry.occurrence === undefined ? 0 : entry.occurrence - 1;
    if (matchIndex < 0 || matchIndex >= matches.length) {
      throw new Error(`refused: ${relPath} replace_text occurrence ${entry.occurrence} outside ${matches.length} match(es).`);
    }
    const start = matches[matchIndex];
    const after = before.slice(0, start) + entry.newText + before.slice(start + entry.oldText.length);
    const negativeActionProof = requireNegativeProofForRemovedBytes({
      action: 'atomic_expand_self:replace_text',
      target: relPath,
      targetUnit: 'self-text-range',
      before,
      after,
      proofOfIncorrectness: entry.proofOfIncorrectness,
    });
    atomicWrite(absPath, after);
    return {
      file: relPath,
      op: entry.op,
      beforeSha256: sha256(before),
      afterSha256: sha256(after),
      ...(negativeActionProof ? { negativeActionProof } : {}),
    };
  }
  if (before === null) return { file: relPath, op: entry.op, beforeSha256: null, afterSha256: null };
  const negativeActionProof = requireNegativeActionProof({
    action: 'atomic_expand_self:delete',
    target: relPath,
    targetUnit: 'self-file',
    removedByteCount: Buffer.byteLength(before, 'utf8'),
    proofOfIncorrectness: entry.proofOfIncorrectness,
  });
  fs.unlinkSync(absPath);
  return { file: relPath, op: entry.op, beforeSha256: sha256(before), afterSha256: null, negativeActionProof };
}

export function registerToolsSelf(server: McpServer): void {
  server.registerTool(
    'atomic_expand_self',
    {
      title: 'Expand atomic-edit itself under self-expansion admission + proof',
      description:
        'The only legal way to modify scripts/mcp/atomic-edit/** after the self-expansion guard is active. ' +
        'It applies atomic byte writes/deletes inside a scoped admission window, enforces capability monotonicity, ' +
        'runs a mandatory multi-domain validator lattice (build, runtime-freshness, type, semantic, semantic-impact, reachability, ' +
        'binding, convergence, runtime-probe, formal, property, findings-delta, contract-edge, public-contract, behavior, security, monotonicity, test, ledger, ' +
        'certificate, runtime, usability, no-bypass), then runs any additional allowed caller proof commands. If ' +
        'application, monotonicity, mandatory validation, or proof fails, the filesystem effect is rolled back ' +
        'byte-exact from the pre-expansion snapshot. On success, the receipt includes the full byte-effect diff.',
      inputSchema: {
        files: z
          .array(
            z.object({
              op: z.enum(['create', 'replace', 'delete', 'replace_text']),
              file: z.string(),
              content: z.string().optional(),
              oldText: z.string().optional(),
              newText: z.string().optional(),
              occurrence: z.number().int().positive().optional(),
              expectedSha256: z.string().optional(),
              proofOfIncorrectness: z.string().optional(),
            }),
          )
          .min(1),
        proofCommands: z
          .array(z.string())
          .min(1)
          .optional()
          .describe('additional allowed proof commands; mandatory validator lattice always runs first'),
        intent: z.string().optional(),
      },
    },
    async (a) => {
      const proofCommands = normalizeSelfExpansionProofCommands(a.proofCommands);
      try {
        const rejected = proofCommands.find((command) => !allowedProofCommand(command));
        if (rejected) {
          return fail(
            `refused: proof command is outside the self-expansion proof allowlist: ${rejected}. ` +
              `Allowed examples: node build.mjs, node dist/smoke.js, node *.proof.mjs --json, node dist/gates/*.proof.js, npx tsx gates/*.proof.ts.`,
          );
        }
        const ops = parseFileOps(a.files as unknown[]);
        const selfRoot = path.join(REPO_ROOT, 'scripts/mcp/atomic-edit');
        const snap = captureEffectSnapshot(selfRoot);
        try {
          const guardedSelfPaths = new Set<string>();
          const applied = withSelfExpansionAdmission(() => ops.map((op) => applySelfFileOp(op, guardedSelfPaths)));
          // Proof #5 - capability monotonicity: AFTER the bytes land, BEFORE proofs,
          // refuse (and roll back) any expansion that reduced the engine's own
          // security surface. Mandatory and non-skippable (not a caller proofCommand).
          enforceSecurityMonotonicity();
          const proofs = await runProofCommands(proofCommands);
          const failed = proofs.filter((p) => !p.ok);
          if (failed.length > 0) {
            const effects = diffEffect(snap);
            const restored = rollbackEffectStrict(snap, effects, 'atomic_expand_self');
            return fail(
              `atomic_expand_self rolled back ${restored} file effect(s): proof failed: ` + formatFailedProofs(failed),
            );
          }
          const effectsBeforeRatchet = diffEffect(snap);
          assertNoUnexpectedSelfExpansionEffects(effectsBeforeRatchet, applied);
          // All proofs passed - the expansion is fully validated. RATCHET the
          // security baseline so any strengthening of the engine's own surface
          // immediately becomes the locked minimum (closes the persistence window
          // where a raised surface was not yet the baseline). Best-effort: a ratchet
          // failure never fails an already-proven-green expansion.
          try {
            enforceSecurityMonotonicity({ ratchet: true });
          } catch {
            /* baseline persistence is best-effort; the check already passed */
          }
          const effects = diffEffect(snap);
          assertNoUnexpectedSelfExpansionEffects(effects, applied);
          return ok({
            ok: true,
            changed: true,
            intent: a.intent ?? null,
            files: applied,
            validatorLattice: MANDATORY_SELF_EXPANSION_VALIDATORS.map((validator) => ({
              phase: validator.phase,
              command: validator.command,
            })),
            proofs: proofs.map((p) => ({ command: p.command, ok: p.ok })),
            effect: {
              changedFiles: effects.length,
              limitReached: snap.limitReached,
              files: effects,
            },
            target: targetDetails(path.join(REPO_ROOT, 'scripts/mcp/atomic-edit'), 'scripts/mcp/atomic-edit'),
            admission: 'self-expansion-validator-lattice-green',
          });
        } catch (e) {
          const effects = diffEffect(snap);
          const restored = rollbackEffectStrict(snap, effects, 'atomic_expand_self');
          const message = e instanceof Error ? e.message : String(e);
          return fail(`atomic_expand_self rolled back ${restored} file effect(s): ${message}`);
        }
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e));
      }
    },
  );

  registerToolsDispatch(server);
}
