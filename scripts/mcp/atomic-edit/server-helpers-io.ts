import * as childProcess from "node:child_process";
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { resolveAllowedRootForAbsolutePath, REPO_ROOT } from './guard.js';
import { checkConnectionByteFloor, checkSupplyChainByteFloor, pendingWriteCount } from './connection-gate.js';
// Full-gate byte floor. The async WRITE_GATES (contract-edge, render-conformance,
// binding, telemetry-emission, findings-delta, supply-chain) pull the tree-sitter
// engine and are enforced ahead of every write in convergeStatic. To keep this
// leaf module engine-free AND keep atomicWrite synchronous (its sync contract is
// load-bearing across every write helper), the floor runs the SYNC WRITE_GATES
// in-process: type-soundness (a NEW tsc error — incl. an unresolved reference
// TS2304/TS2305/TS2552, the dead-wire fact), iac-reference (a dangling infra
// reference), and security (a NEW hardcoded secret). Each is pure in-process
// (typescript / fs+path / regex+entropy) — no engine, no spawn.
import typeSoundnessGate from './gates/type-soundness-gate.js';
import iacReferenceGate from './gates/iac-reference-gate.js';
import securityGate from './gates/security-gate.js';
import { makeContext, type GateModule } from './gates/contract.js';
import { assertSelfExpansionAdmission } from './server-helpers-self-expansion.js';
// ── self-improving Gate Lattice (GAP #2) — the ADMITTED registry gates, run additively at the byte floor ──
// The frozen SYNC_WRITE_GATES above are atomic's BUILT-IN floor. The lattice lets
// the system self-extend that floor: a gate detected from the "all-gates-passed vs
// prod-broke" delta, proven monotonic against the known-good corpus, lands in
// .atomic/gates/registry.json and is consulted HERE — so an admitted gate actually
// BLOCKS a violating write, not merely advises. Loaded synchronously (vm-isolated)
// to honour atomicWrite's sync contract; an empty/absent registry is a no-op.
import { runRegistryGatesOverEditSync } from './engine-gate-registry.js';

export const sha256 = (s: string): string => crypto.createHash('sha256').update(s).digest('hex');

/** Optimistic-concurrency guard: refuse if the file changed since the agent
 * read it (defends against the concurrent-agent collisions this repo is known
 * for). Opt-in via expectedSha256. Never leaks file content. */
export function guardSha(before: string, expected: string | undefined): void {
  if (expected && sha256(before) !== expected) {
    throw new Error(
      `sha256 mismatch: file changed since you read it (expected ${expected.slice(0, 12)}…, ` +
        `got ${sha256(before).slice(0, 12)}…). Re-read and retry — NOT written.`,
    );
  }
}

export const log = (...a: unknown[]): void => {
  process.stderr.write(`[atomic-edit] ${a.map(String).join(' ')}\n`);
};

/** The SYNC subset of WRITE_GATES safe to run at the byte floor (no engine, no spawn). */
const SYNC_WRITE_GATES: GateModule[] = [typeSoundnessGate, iacReferenceGate, securityGate];

/**
 * Run the sync WRITE_GATES over a single-file overlay at the byte floor and return
 * each gate's RED loci (gate+locus+fact), never throwing on its behalf. Honesty
 * doctrine, mirrored from runGates: a gate whose `run` returns a thenable (an async
 * gate) is NOT awaited here — it is carried as UNJUDGED unless the caller is in a
 * multi-file write set that will be judged by convergeStatic. A concrete sync RED
 * blocks, and UNJUDGED also blocks at this strict byte floor because it is not
 * green approval.
 */
function runSyncWriteGatesAt(relPath: string, content: string): {
  reds: { gate: string; locus: string; fact: string }[];
  unjudged: { gate: string; fact: string }[];
} {
  const overlay = new Map<string, string>([[relPath, content]]);
  const ctx = makeContext(REPO_ROOT, overlay, [relPath]);
  const reds: { gate: string; locus: string; fact: string }[] = [];
  const unjudged: { gate: string; fact: string }[] = [];
  for (const g of SYNC_WRITE_GATES) {
    if (!g.appliesTo(relPath)) continue;
    let res: ReturnType<typeof g.run>;
    try {
      res = g.run(ctx);
    } catch (e) {
      unjudged.push({ gate: g.name, fact: `threw: ${e instanceof Error ? e.message : String(e)}` });
      continue;
    }
    // An async gate returns a Promise: it cannot be judged synchronously here.
    // In strict byte-floor admission that is not approval, so it blocks unless
    // the caller has registered a multi-file set that will be judged as a whole.
    if (res instanceof Promise || typeof (res as { then?: unknown }).then === 'function') {
      unjudged.push({ gate: g.name, fact: 'async gate cannot be judged at the sync byte floor' });
      continue;
    }
    if (res.unjudged) {
      unjudged.push({ gate: res.gate, fact: res.note ?? 'gate could not decide from the available bytes' });
      continue;
    }
    for (const r of res.reds) reds.push({ gate: res.gate, locus: r.locus ?? r.file, fact: r.fact });
  }
  return { reds, unjudged };
}

/** Atomic durable write: temp file in same dir, fsync, rename. */
function brokerSocketPath(): string | null {
  return process.env.ATOMIC_EXEC_BROKER_SOCKET || null;
}

function canUseBrokerAtomicWrite(error: unknown): boolean {
  const code = typeof error === "object" && error !== null && "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
  return Boolean(brokerSocketPath()) && (code === "EPERM" || code === "EACCES");
}

function writeAtomicBytesDirect(absPath: string, tmp: string, content: string, mode: number | undefined): void {
  const fd = fs.openSync(tmp, "w");
  try {
    fs.writeSync(fd, content);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  if (mode !== undefined) fs.chmodSync(tmp, mode);
  fs.renameSync(tmp, absPath);
}

function writeAtomicBytesViaBroker(absPath: string, tmp: string, content: string, mode: number | undefined): void {
  const socket = brokerSocketPath();
  if (!socket) throw new Error("atomicWrite broker fallback unavailable: ATOMIC_EXEC_BROKER_SOCKET is unset");
  const helper = path.join(REPO_ROOT, "scripts/mcp/atomic-edit/atomic-write-broker.mjs");
  const req = {
    command: `${shellPath(process.execPath)} ${shellPath(helper)}`,
    cwd: path.dirname(absPath),
    effectRoot: path.dirname(absPath),
    timeoutMs: 120000,
    env: {
      ATOMIC_WRITE_TARGET: absPath,
      ATOMIC_WRITE_TMP: tmp,
      ...(mode === undefined ? {} : { ATOMIC_WRITE_MODE: String(mode) }),
    },
    stdin: content,
  };
  const client = path.join(REPO_ROOT, "scripts/mcp/atomic-edit/atomic-exec-broker-client.mjs");
  const res = childProcess.spawnSync(process.execPath, [client, socket], {
    cwd: path.dirname(absPath),
    encoding: "utf8",
    input: JSON.stringify(req),
    maxBuffer: 32 * 1024 * 1024,
    timeout: 125000,
  });
  if (res.error) throw res.error;
  let reply: Record<string, unknown>;
  try {
    reply = JSON.parse(res.stdout || "{}") as Record<string, unknown>;
  } catch {
    throw new Error(`atomicWrite broker fallback returned unparseable output: ${String(res.stdout).slice(0, 300)}`);
  }
  if (reply.ok !== true) {
    throw new Error(`atomicWrite broker fallback failed: ${String(reply.error ?? reply.stderr ?? res.stderr ?? "unknown broker failure")}`);
  }
}

export function atomicWrite(absPath: string, content: string): void {
  // ── Inescapable convergence, at the byte floor — immutable by architecture ──
  // EVERY write, through EVERY tool, funnels through here. A source file that
  // would INTRODUCE a dangling relative import, a dangling dependency, a NEW tsc
  // error / unresolved reference, a dangling infra reference, or a NEW hardcoded
  // secret never reaches disk. There is no env, no flag, no toggle, and no code
  // path that writes around this — that is the point: the agent can only persist a
  // connected, type-sound, secret-free tree.
  // (The async edge/render/binding/telemetry/findings gates run ahead of every
  // write in convergeStatic; the sync rungs of that same WRITE_GATES set run HERE.)
  const conn = checkConnectionByteFloor(absPath, content);
  if (!conn.green) {
    throw new Error(
      `refused (convergence): this write would introduce dangling relative import(s) — ` +
        `${conn.reds.slice(0, 5).join(', ')}. A wire that resolves to nothing is not a change. ` +
        `Create the target first, or commit the set together (atomic_converge / a transaction). NOT written.`,
    );
  }
  // Dependency twin of the connection gate, also at the byte floor: a NEW bare
  // import to a package absent from the installed tree is a dangling wire too.
  // supply-chain is sync (fs walk); if it ever returns async, skip here (atomic_converge
  // still covers it) rather than block on a half-resolved promise.
  const sc = checkSupplyChainByteFloor(absPath, content);
  if (!sc.green) {
    throw new Error(
      `refused (convergence): this write would introduce a dangling dependency — ` +
        `${sc.reds.slice(0, 5).join(', ')}. Install the package or fix the import. NOT written.`,
    );
  }
  // ── full-gate byte floor: the SYNC WRITE_GATES, in-process, before the byte lands ──
  // Connection + supply-chain (above) prove every wire RESOLVES. These prove the write
  // is TYPE-SOUND, its infra references RESOLVE, and it introduces NO hardcoded secret —
  // so atomic_edit / atomic_rename_symbol / atomic_replace_text (which reach disk through
  // here, NOT through convergeStatic) can no longer land a NEW tsc error / unresolved
  // reference / dangling IaC ref / committed credential. The async edge/render/binding
  // gates are enforced in convergeStatic ahead of every write; here we add the sync rungs
  // that close the per-edit gap without the engine and without breaking the sync contract.
  //
  // Multi-file pending set: a per-file in-memory compile cannot see the sibling candidates
  // of an A→B set (it would falsely red A's import of a not-yet-written B). When a set is in
  // flight (pendingWriteCount > 1) type-soundness is honestly deferred to convergeStatic,
  // which type-checks the full overlay. Single-file writes (count ≤ 1) run all sync gates.
  const relPath = path.relative(REPO_ROOT, absPath);
  assertSelfExpansionAdmission(REPO_ROOT, absPath, content);
  const multiFileInFlight = pendingWriteCount() > 1;
  const syncVerdict = runSyncWriteGatesAt(relPath, content);
  for (const r of syncVerdict.reds) {
    if (multiFileInFlight && r.gate === 'type-soundness') continue; // sibling-blind → defer to converge
    throw new Error(
      `refused (convergence): this write would introduce a ${r.gate} red — ` +
        `${relPath}${r.locus ? `:${r.locus}` : ''} — ${r.fact}. ` +
        `A write that does not converge green is not a change. NOT written.`,
    );
  }
  for (const r of syncVerdict.unjudged) {
    if (multiFileInFlight && r.gate === 'type-soundness') continue; // sibling-blind → defer to converge
    throw new Error(
      `refused (convergence): ${r.gate} was UNJUDGED for ${relPath} — ${r.fact}. ` +
        `Unjudged is not green approval under Y admission. NOT written.`,
    );
  }

  // ── self-improving Gate Lattice (GAP #2): consult the ADMITTED registry gates ──
  // After the frozen built-in floor (above) passes, run the gates the lattice has
  // SELF-ADMITTED into .atomic/gates/registry.json. Each was proven monotonic
  // against the known-good corpus at admission (engine-gate-registry.admitGateModule
  // → verifyMonotonicAdmission), so it cannot retroactively red a previously-green
  // edit — but it DOES block a NEW write that violates the fact it learned from a
  // green-but-broken incident. NEW-only delta: a registry gate sees the file's prior
  // disk bytes as `before`, so it judges only the wire/scheme/contract THIS write
  // introduces. Additive: an empty/absent registry runs zero gates (a transparent
  // no-op); a red here is a real BLOCK, identical in force to the built-in floor.
  let priorBytes = '';
  try {
    priorBytes = fs.existsSync(absPath) && fs.statSync(absPath).isFile() ? fs.readFileSync(absPath, 'utf8') : '';
  } catch {
    priorBytes = ''; // unreadable prior → treat as new file (every fact is this write's claim)
  }
  const registryVerdict = runRegistryGatesOverEditSync({
    file: relPath,
    before: priorBytes,
    after: content,
    repoRoot: REPO_ROOT,
  });
  for (const r of registryVerdict.reds) {
    throw new Error(
      `refused (convergence — admitted lattice gate "${r.id}"): ` +
        `${relPath}${r.locus && r.locus !== relPath ? `:${r.locus}` : ''} — ${r.fact}. ` +
        `This gate was self-admitted from a green-but-broken incident and proven monotonic ` +
        `against the known-good corpus, so it blocks the defect class the built-in floor missed. NOT written.`,
    );
  }

  const dir = path.dirname(absPath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `.atomic-edit.${process.pid}.${Date.now()}.tmp`);
  // Preserve the original file's mode: a temp-file + rename replaces the inode,
  // so without this an existing executable file (e.g. 755) silently drops to the
  // umask default (644) on the next atomic write. Capture it before writing.
  let mode: number | undefined;
  try {
    mode = fs.statSync(absPath).mode & 0o777;
  } catch {
    /* new file (ENOENT) or unstatable: no prior mode to preserve — umask applies */
  }
  try {
    writeAtomicBytesDirect(absPath, tmp, content, mode);
  } catch (e) {
    // On ANY direct write failure (ENOSPC on write, EPERM on chmod, EXDEV/ENOENT on rename)
    // never leave the temp beside the source. If the current host process is
    // read-only but has an atomic_exec broker, retry the same byte write inside
    // the per-command broker sandbox after all convergence gates have passed.
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* best-effort cleanup */
    }
    if (canUseBrokerAtomicWrite(e)) {
      writeAtomicBytesViaBroker(absPath, tmp, content, mode);
      return;
    }
    throw e;
  }
}

export function readUtf8(absPath: string): string {
  if (!fs.existsSync(absPath)) throw new Error(`file does not exist: ${absPath}`);
  const st = fs.statSync(absPath);
  if (!st.isFile()) throw new Error(`not a regular file: ${absPath}`);
  return fs.readFileSync(absPath, 'utf8');
}

export function normalizeRepoRelPath(value: string): string {
  const normalized = value.replaceAll(path.sep, '/').replace(/^\.\//, '').replace(/\/+$/, '');
  return normalized === '.' ? '' : normalized;
}

export function normalizeAllowedPath(value: string, repoRoot: string): string {
  if (!path.isAbsolute(value)) {
    return normalizeRepoRelPath(value);
  }
  const rel = path.relative(repoRoot, path.resolve(value));
  if (rel === '') {
    return '';
  }
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    return normalizeRepoRelPath(value);
  }
  return normalizeRepoRelPath(rel);
}

export function relPathAllowed(relPath: string, allowedPaths: string[]): boolean {
  const rel = normalizeRepoRelPath(relPath);
  return allowedPaths.some((allowed) => {
    const normalized = normalizeRepoRelPath(allowed);
    return normalized === '' || rel === normalized || rel.startsWith(`${normalized}/`);
  });
}

export function changedSpanMetrics(
  before: string,
  after: string,
): {
  changedChars: number;
  lineSurfaceChars: number;
  expansionFactor: number;
  oldSample: string;
  newSample: string;
  preservedPrefixHash: string;
  preservedSuffixHash: string;
} {
  let prefix = 0;
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) {
    prefix++;
  }
  let beforeEnd = before.length;
  let afterEnd = after.length;
  while (beforeEnd > prefix && afterEnd > prefix && before[beforeEnd - 1] === after[afterEnd - 1]) {
    beforeEnd--;
    afterEnd--;
  }
  const oldChanged = before.slice(prefix, beforeEnd);
  const newChanged = after.slice(prefix, afterEnd);
  const changedChars = Math.max(oldChanged.length, newChanged.length);
  const lineStartCandidate = before.lastIndexOf('\n', Math.max(prefix - 1, 0));
  const lineStart = lineStartCandidate === -1 ? 0 : lineStartCandidate + 1;
  const lineEndCandidate = before.indexOf('\n', beforeEnd);
  const lineEnd = lineEndCandidate === -1 ? before.length : lineEndCandidate;
  const lineSurfaceChars = changedChars === 0 ? 0 : Math.max(lineEnd - lineStart, changedChars);
  const sample = (text: string): string => (text.length <= 240 ? text : `${text.slice(0, 237)}...`);
  return {
    changedChars,
    lineSurfaceChars,
    expansionFactor: Number((lineSurfaceChars / Math.max(changedChars, 1)).toFixed(2)),
    oldSample: sample(oldChanged),
    newSample: sample(newChanged),
    preservedPrefixHash: sha256(before.slice(0, prefix)),
    preservedSuffixHash: sha256(before.slice(beforeEnd)),
  };
}

export interface EslintDryRunResult {
  filePath: string;
  output?: string;
  messages?: { ruleId?: string | null; message?: string; line?: number; column?: number }[];
  errorCount?: number;
  warningCount?: number;
  fixableErrorCount?: number;
  fixableWarningCount?: number;
}

export function hasArg(args: string[], bare: string): boolean {
  return args.some(
    (arg, index) => arg === bare || arg.startsWith(`${bare}=`) || args[index - 1] === bare,
  );
}

export function normalizeEslintDryRunArgs(args: string[]): string[] {
  if (args[0] === 'npx' && args[1] === 'eslint') return args.slice(2);
  if (args[0] === 'eslint') return args.slice(1);
  return args;
}

export function requireEslintDryRunArgs(args: string[]): void {
  if (args.includes('--fix')) throw new Error('refused: use --fix-dry-run, not --fix');
  if (!args.includes('--fix-dry-run'))
    throw new Error('refused: eslint args must include --fix-dry-run');
  const formatJson =
    args.includes('--format=json') ||
    args.includes('-f=json') ||
    args.some((arg, index) => (arg === '--format' || arg === '-f') && args[index + 1] === 'json');
  if (!formatJson) throw new Error('refused: eslint args must include --format json');
  if (hasArg(args, '--output-file') || hasArg(args, '-o')) {
    throw new Error('refused: analyzer output must stay on stdout, not --output-file');
  }
}

export function parseEslintJson(stdout: string): EslintDryRunResult[] {
  const trimmed = stdout.trim();
  if (!trimmed.startsWith('[')) throw new Error('eslint did not emit JSON array on stdout');
  const parsed = JSON.parse(trimmed) as unknown;
  if (!Array.isArray(parsed)) throw new Error('eslint JSON output was not an array');
  return parsed as EslintDryRunResult[];
}

export function targetDetails(absPath: string, relPath: string): Record<string, unknown> {
  const repoRoot = resolveAllowedRootForAbsolutePath(absPath) ?? REPO_ROOT;
  return {
    target: {
      repoRoot,
      file: relPath,
      absPath,
    },
  };
}

export function shellPath(value: string): string {
  return /^[A-Za-z0-9_./-]+$/.test(value) ? value : JSON.stringify(value);
}

export function nearestPackageRelPath(repoRoot: string, relPath: string): string | null {
  const normalized = normalizeRepoRelPath(relPath);
  const parts = normalized === '.' ? [] : normalized.split('/').filter(Boolean);
  for (let depth = parts.length; depth >= 0; depth--) {
    const packageRelPath = parts.slice(0, depth).join('/') || '.';
    const packageJsonPath = path.join(
      repoRoot,
      packageRelPath === '.' ? '' : packageRelPath,
      'package.json',
    );
    if (fs.existsSync(packageJsonPath)) return packageRelPath;
  }
  return null;
}
