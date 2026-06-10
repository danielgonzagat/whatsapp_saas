import * as childProcess from 'node:child_process';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { applyEdits } from './engine.js';
import { REPO_ROOT, resolveSafeTarget } from './guard.js';
import {
  atomicWrite,
  guardSha,
  nearestPackageRelPath,
  parseEslintJson,
  readUtf8,
  sha256,
} from './server-helpers-io.js';
import {
  requireNegativeProofForRemovedBytes,
  type NegativeActionProof,
} from './server-helpers-negative-proof.js';
import { ok, fail, commit } from './server-helpers-result.js';
import { canonicalJSON } from './trace.js';

type VerifyMode = 'typecheck' | 'lint';

interface PositiveByteChunk {
  index: number;
  sha256: string;
  bytes: number;
}

interface PositiveByteSession {
  schemaVersion: 1;
  sessionId: string;
  file: string;
  relPath: string;
  absPath: string;
  intent: string;
  expectedContentSha256?: string;
  expectedSha256?: string;
  overwrite: boolean;
  preview: boolean;
  verify?: VerifyMode;
  lock: boolean;
  proofOfIncorrectness?: string;
  chunks: PositiveByteChunk[];
  bytes: number;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
}

interface PositiveBytePreDiskVerify {
  kind: VerifyMode;
  command: string;
  replayCwd: string;
  replayArgv: string[];
  targetRelPath: string;
  passed: boolean;
  preDisk: true;
  strategy: 'shadow-tsconfig' | 'eslint-stdin' | 'uncovered';
  summary: string;
}

const POSITIVE_BYTE_SESSION_TTL_MS = 30 * 60 * 1000;
const SESSION_ID_RE = /^positive-bytes-\d+-[0-9a-f]+$/;

function nowMs(): number {
  return Date.now();
}

function newSessionId(): string {
  return `positive-bytes-${nowMs()}-${crypto.randomBytes(8).toString('hex')}`;
}

function stagingRoot(): string {
  return path.join(REPO_ROOT, 'scripts/mcp/atomic-edit/.positive-byte-sessions');
}

function assertSessionId(sessionId: string): void {
  if (!SESSION_ID_RE.test(sessionId)) throw new Error(`invalid positive-byte session id: ${sessionId}`);
}

function sessionDir(sessionId: string): string {
  assertSessionId(sessionId);
  return path.join(stagingRoot(), sessionId);
}

function sessionManifestPath(sessionId: string): string {
  return path.join(sessionDir(sessionId), 'session.json');
}

function chunkPath(sessionId: string, index: number): string {
  return path.join(sessionDir(sessionId), `${String(index).padStart(8, '0')}.chunk`);
}

function writeSession(session: PositiveByteSession): void {
  fs.mkdirSync(sessionDir(session.sessionId), { recursive: true });
  atomicWrite(sessionManifestPath(session.sessionId), JSON.stringify(session, null, 2) + '\n');
}

function removeSession(sessionId: string): void {
  fs.rmSync(sessionDir(sessionId), { recursive: true, force: true });
}

function readSession(sessionId: string): PositiveByteSession {
  pruneExpiredSessions();
  assertSessionId(sessionId);
  const manifest = sessionManifestPath(sessionId);
  if (!fs.existsSync(manifest)) throw new Error(`unknown positive-byte session: ${sessionId}`);
  const parsed = JSON.parse(fs.readFileSync(manifest, 'utf8')) as PositiveByteSession;
  if (parsed.schemaVersion !== 1 || parsed.sessionId !== sessionId) {
    throw new Error(`invalid positive-byte session manifest: ${sessionId}`);
  }
  const target = resolveSafeTarget(parsed.file);
  parsed.relPath = target.relPath;
  parsed.absPath = target.absPath;
  refreshSession(parsed);
  return parsed;
}

function refreshSession(session: PositiveByteSession): void {
  const now = nowMs();
  session.updatedAt = now;
  session.expiresAt = now + POSITIVE_BYTE_SESSION_TTL_MS;
  writeSession(session);
}

function pruneExpiredSessions(): void {
  const root = stagingRoot();
  if (!fs.existsSync(root)) return;
  const now = nowMs();
  for (const name of fs.readdirSync(root)) {
    if (!SESSION_ID_RE.test(name)) continue;
    const manifest = sessionManifestPath(name);
    try {
      const parsed = JSON.parse(fs.readFileSync(manifest, 'utf8')) as { expiresAt?: unknown };
      if (typeof parsed.expiresAt !== 'number' || parsed.expiresAt <= now) removeSession(name);
    } catch {
      removeSession(name);
    }
  }
}

function merkleRoot(chunkHashes: string[]): string {
  if (chunkHashes.length === 0) return sha256('');
  let level = chunkHashes.map((hash) => sha256(`leaf:${hash}`));
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = level[i + 1] ?? left;
      next.push(sha256(`node:${left}:${right}`));
    }
    level = next;
  }
  return level[0];
}

function wholeFileEdit(before: string, content: string): {
  start: { line: number; column: number };
  end: { line: number; column: number };
  newText: string;
} {
  if (before === '') {
    return { start: { line: 1, column: 1 }, end: { line: 1, column: 1 }, newText: content };
  }
  const lines = before.split('\n');
  return {
    start: { line: 1, column: 1 },
    end: { line: lines.length, column: lines[lines.length - 1].length + 1 },
    newText: content,
  };
}

function findNearestTsconfig(absPath: string, repoRoot: string): string | null {
  let dir = path.dirname(absPath);
  const stop = path.resolve(repoRoot);
  for (;;) {
    const candidate = path.join(dir, 'tsconfig.json');
    if (fs.existsSync(candidate)) return candidate;
    if (path.resolve(dir) === stop) return null;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function findNearestNodeModules(startDir: string): string | null {
  let dir = path.resolve(startDir);
  const stop = path.resolve(REPO_ROOT);
  for (;;) {
    const candidate = path.join(dir, 'node_modules');
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) return candidate;
    if (dir === stop) break;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  const rootCandidate = path.join(REPO_ROOT, 'node_modules');
  return fs.existsSync(rootCandidate) && fs.statSync(rootCandidate).isDirectory() ? rootCandidate : null;
}

function resolveLocalBin(startDir: string, binary: string): string {
  let dir = path.resolve(startDir);
  const stop = path.resolve(REPO_ROOT);
  for (;;) {
    const candidate = path.join(dir, 'node_modules', '.bin', binary);
    if (fs.existsSync(candidate)) return candidate;
    if (dir === stop) break;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  const rootCandidate = path.join(REPO_ROOT, 'node_modules', '.bin', binary);
  return fs.existsSync(rootCandidate) ? rootCandidate : binary;
}

function skipPreDiskVerifyShadowEntry(name: string): boolean {
  return (
    name === 'node_modules' ||
    name === 'dist' ||
    name === '.git' ||
    name === '.atomic' ||
    name === '.positive-byte-sessions' ||
    name.startsWith('.atomic-exec-sandbox') ||
    name.startsWith('atomic-exec-broker-file-') ||
    name.startsWith('atomic-universal-') ||
    name.startsWith('.smoke-positive-byte-proof-') ||
    name.startsWith('.smoke-positive-byte-red')
  );
}

function copyProjectForPreDiskVerify(sourceRoot: string, destRoot: string): void {
  fs.mkdirSync(destRoot, { recursive: true });
  for (const name of fs.readdirSync(sourceRoot)) {
    if (skipPreDiskVerifyShadowEntry(name)) continue;
    const source = path.join(sourceRoot, name);
    const dest = path.join(destRoot, name);
    const stat = fs.lstatSync(source);
    if (stat.isDirectory()) {
      copyProjectForPreDiskVerify(source, dest);
      continue;
    }
    if (stat.isSymbolicLink()) {
      fs.symlinkSync(fs.readlinkSync(source), dest);
      continue;
    }
    if (!stat.isFile()) continue;
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(source, dest);
    fs.chmodSync(dest, stat.mode & 0o777);
  }
}

function compactVerifyOutput(value: unknown): string {
  const text = String(value ?? '').trim();
  return text.length > 0 ? text.slice(0, 500) : 'verification command produced no diagnostic output';
}

function runPreDiskTypecheck(
  session: PositiveByteSession,
  content: string,
): PositiveBytePreDiskVerify {
  const pkg = nearestPackageRelPath(REPO_ROOT, session.relPath);
  const tsconfig = findNearestTsconfig(session.absPath, REPO_ROOT);
  if (!pkg || !tsconfig) {
    return {
      kind: 'typecheck',
      command: 'typecheck',
      replayCwd: REPO_ROOT,
      replayArgv: [],
      targetRelPath: session.relPath,
      passed: false,
      preDisk: true,
      strategy: 'uncovered',
      summary: !pkg
        ? `uncovered: no package.json covers ${session.relPath}; declared typecheck cannot be proven pre-disk`
        : `uncovered: no tsconfig.json covers ${session.relPath}; declared typecheck cannot be proven pre-disk`,
    };
  }

  const projectRoot = path.dirname(tsconfig);
  const tsconfigRelToProject = path.relative(projectRoot, tsconfig);
  const replayArgv = ['--noEmit', '-p', tsconfigRelToProject];
  const shadowRoot = path.join(sessionDir(session.sessionId), 'verify-shadow');
  const shadowProjectRoot = path.join(shadowRoot, 'project');
  fs.rmSync(shadowRoot, { recursive: true, force: true });
  try {
    copyProjectForPreDiskVerify(projectRoot, shadowProjectRoot);
    const nodeModules = findNearestNodeModules(projectRoot);
    const shadowNodeModules = path.join(shadowProjectRoot, 'node_modules');
    if (nodeModules && !fs.existsSync(shadowNodeModules)) {
      fs.symlinkSync(nodeModules, shadowNodeModules, 'dir');
    }
    const targetRelToProject = path.relative(projectRoot, session.absPath);
    const shadowTarget = path.join(shadowProjectRoot, targetRelToProject);
    fs.mkdirSync(path.dirname(shadowTarget), { recursive: true });
    atomicWrite(shadowTarget, content);
    const tscBin = resolveLocalBin(projectRoot, 'tsc');
    childProcess.execFileSync(tscBin, replayArgv, {
      cwd: shadowProjectRoot,
      timeout: 60000,
      encoding: 'utf8',
      stdio: 'pipe',
    });
    return {
      kind: 'typecheck',
      command: `tsc --noEmit -p ${path.relative(REPO_ROOT, tsconfig)}`,
      replayCwd: projectRoot,
      replayArgv,
      targetRelPath: session.relPath,
      passed: true,
      preDisk: true,
      strategy: 'shadow-tsconfig',
      summary: 'TypeScript typecheck passed in pre-disk shadow workspace',
    };
  } catch (e: unknown) {
    const err = e as { stderr?: Buffer | string; stdout?: Buffer | string; message?: string };
    return {
      kind: 'typecheck',
      command: `tsc --noEmit -p ${path.relative(REPO_ROOT, tsconfig)}`,
      replayCwd: projectRoot,
      replayArgv,
      targetRelPath: session.relPath,
      passed: false,
      preDisk: true,
      strategy: 'shadow-tsconfig',
      summary: compactVerifyOutput(err.stderr ?? err.stdout ?? err.message),
    };
  } finally {
    fs.rmSync(shadowRoot, { recursive: true, force: true });
  }
}

function runPreDiskLint(
  session: PositiveByteSession,
  content: string,
): PositiveBytePreDiskVerify {
  const pkg = nearestPackageRelPath(REPO_ROOT, session.relPath);
  if (!pkg) {
    return {
      kind: 'lint',
      command: 'lint',
      replayCwd: REPO_ROOT,
      replayArgv: [],
      targetRelPath: session.relPath,
      passed: false,
      preDisk: true,
      strategy: 'uncovered',
      summary: `uncovered: no package.json covers ${session.relPath}; declared lint cannot be proven pre-disk`,
    };
  }
  const packageRoot = path.join(REPO_ROOT, pkg);
  const eslintBin = resolveLocalBin(packageRoot, 'eslint');
  const command = `eslint --stdin --stdin-filename ${session.relPath}`;
  const replayArgv = ['--stdin', '--stdin-filename', session.absPath, '--format', 'json'];
  try {
    const stdout = childProcess.execFileSync(
      eslintBin,
      replayArgv,
      {
        cwd: packageRoot,
        input: content,
        timeout: 30000,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    );
    const issues = parseEslintJson(stdout);
    const errorCount = issues.reduce((sum, file) => sum + (file.errorCount ?? 0), 0);
    const warningCount = issues.reduce((sum, file) => sum + (file.warningCount ?? 0), 0);
    return {
      kind: 'lint',
      command,
      replayCwd: packageRoot,
      replayArgv,
      targetRelPath: session.relPath,
      passed: errorCount === 0,
      preDisk: true,
      strategy: 'eslint-stdin',
      summary: `${errorCount} errors, ${warningCount} warnings`,
    };
  } catch (e: unknown) {
    const err = e as { stderr?: Buffer | string; stdout?: Buffer | string; message?: string };
    const stdout = String(err.stdout ?? '');
    try {
      const issues = parseEslintJson(stdout);
      const errorCount = issues.reduce((sum, file) => sum + (file.errorCount ?? 0), 0);
      const warningCount = issues.reduce((sum, file) => sum + (file.warningCount ?? 0), 0);
      return {
        kind: 'lint',
        command,
        replayCwd: packageRoot,
        replayArgv,
        targetRelPath: session.relPath,
        passed: false,
        preDisk: true,
        strategy: 'eslint-stdin',
        summary: `${errorCount} errors, ${warningCount} warnings`,
      };
    } catch {
      return {
        kind: 'lint',
        command,
        replayCwd: packageRoot,
        replayArgv,
        targetRelPath: session.relPath,
        passed: false,
        preDisk: true,
        strategy: 'eslint-stdin',
        summary: compactVerifyOutput(err.stderr ?? err.stdout ?? err.message),
      };
    }
  }
}

function runPositiveBytePreDiskVerify(
  session: PositiveByteSession,
  content: string,
): PositiveBytePreDiskVerify | null {
  if (session.verify === 'typecheck') return runPreDiskTypecheck(session, content);
  if (session.verify === 'lint') return runPreDiskLint(session, content);
  return null;
}

function sessionContent(session: PositiveByteSession): string {
  const parts: string[] = [];
  let verifiedBytes = 0;

  for (let expectedIndex = 0; expectedIndex < session.chunks.length; expectedIndex += 1) {
    const chunk = session.chunks[expectedIndex];
    if (!chunk || chunk.index !== expectedIndex) {
      throw new Error(
        `refused: positive-byte chunk manifest index mismatch for ${session.relPath}; ` +
          `expected ${expectedIndex}, got ${chunk?.index ?? 'missing'}`,
      );
    }

    const stagedPath = chunkPath(session.sessionId, chunk.index);
    if (!fs.existsSync(stagedPath)) {
      throw new Error(`refused: positive-byte chunk ${chunk.index} is missing for ${session.relPath}`);
    }

    const text = fs.readFileSync(stagedPath, 'utf8');
    const actualSha256 = sha256(text);
    const actualBytes = Buffer.byteLength(text, 'utf8');
    if (actualSha256 !== chunk.sha256) {
      throw new Error(
        `refused: positive-byte chunk ${chunk.index} sha256 mismatch for ${session.relPath}; ` +
          `expected ${chunk.sha256}, got ${actualSha256}`,
      );
    }
    if (actualBytes !== chunk.bytes) {
      throw new Error(
        `refused: positive-byte chunk ${chunk.index} byte-count mismatch for ${session.relPath}; ` +
          `expected ${chunk.bytes}, got ${actualBytes}`,
      );
    }

    verifiedBytes += actualBytes;
    parts.push(text);
  }

  if (verifiedBytes !== session.bytes) {
    throw new Error(
      `refused: positive-byte staged byte total mismatch for ${session.relPath}; ` +
        `expected ${session.bytes}, got ${verifiedBytes}`,
    );
  }

  return parts.join('');
}

function buildPositiveByteRejectionReceipt(args: {
  session: PositiveByteSession;
  message: string;
  failedGate: string;
  chunkCount: number;
  stagedBytes: number;
  targetWrite: 'not-attempted' | 'unknown';
  cleanup: 'session-dropped' | 'session-drop-failed';
  cleanupError?: string;
  failedGateFacts?: Record<string, unknown>;
}): Record<string, unknown> {
  const gateBody = {
    kind: 'positive-byte-gate-decision-tree',
    schemaVersion: 1,
    decision: 'rejected',
    proofScope: 'positive-byte-materialization',
    gates: [
      {
        id: 'session.lookup',
        status: 'passed',
        facts: {
          sessionId: args.session.sessionId,
          file: args.session.relPath,
          chunkCount: args.chunkCount,
          stagedBytes: args.stagedBytes,
        },
      },
      {
        id: args.failedGate,
        status: 'failed',
        facts: {
          ...(args.failedGateFacts ?? {}),
          error: args.message,
          targetWrite: args.targetWrite,
        },
      },
      {
        id: 'session.cleanup',
        status: args.cleanup === 'session-dropped' ? 'passed' : 'failed',
        facts: {
          cleanup: args.cleanup,
          ...(args.cleanupError ? { cleanupError: args.cleanupError } : {}),
        },
      },
    ],
    proofLimits: [
      'Rejection receipt proves the Atomic gate that refused materialization and the cleanup outcome.',
      'If targetWrite is unknown, the receipt requires an external target hash check before retrying.',
    ],
  };
  const gateDecisionTree = { ...gateBody, gateRunId: sha256(canonicalJSON(gateBody)) };
  const body = {
    kind: 'positive-byte-materialization-rejection-receipt',
    schemaVersion: 1,
    sessionId: args.session.sessionId,
    file: args.session.relPath,
    absPath: args.session.absPath,
    intent: args.session.intent,
    failedGate: args.failedGate,
    error: args.message,
    chunkCount: args.chunkCount,
    stagedBytes: args.stagedBytes,
    targetWrite: args.targetWrite,
    targetMaterialized: args.targetWrite === 'unknown' ? 'unknown' : false,
    cleanup: args.cleanup,
    gateDecisionTree,
  };
  return { ...body, receiptSha256: positiveByteReceiptHash(body) };
}

function failCommitAndDropSession(
  session: PositiveByteSession,
  message: string,
  options: {
    targetWrite?: 'not-attempted' | 'unknown';
    failedGate?: string;
    failedGateFacts?: Record<string, unknown>;
  } = {},
): ReturnType<typeof fail> {
  const chunkCount = session.chunks.length;
  const stagedBytes = session.bytes;
  const targetWrite = options.targetWrite ?? 'not-attempted';
  const targetState =
    targetWrite === 'unknown'
      ? 'target materialization state is unknown after the exception; verify the target by sha256 before retrying.'
      : 'no target bytes were materialized.';
  let cleanup: 'session-dropped' | 'session-drop-failed' = 'session-dropped';
  let cleanupError: string | undefined;
  try {
    removeSession(session.sessionId);
  } catch (e) {
    cleanup = 'session-drop-failed';
    cleanupError = e instanceof Error ? e.message : String(e);
  }
  const fullMessage =
    `${message} Staged positive-byte session ${session.sessionId} was dropped ` +
    `(${chunkCount} chunk(s), ${stagedBytes} byte(s)); ${targetState}` +
    (cleanupError ? ` Additionally failed to drop positive-byte session: ${cleanupError}.` : '');
  const rejectionReceipt = buildPositiveByteRejectionReceipt({
    session,
    message,
    failedGate: options.failedGate ?? (targetWrite === 'unknown' ? 'target.materialization' : 'commit.admission'),
    chunkCount,
    stagedBytes,
    targetWrite,
    cleanup,
    ...(cleanupError ? { cleanupError } : {}),
    ...(options.failedGateFacts ? { failedGateFacts: options.failedGateFacts } : {}),
  });
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({ ok: false, error: fullMessage, rejectionReceipt }, null, 2),
      },
    ],
    isError: true,
  };
}

function negativeProofForCommit(
  session: PositiveByteSession,
  before: string,
  after: string,
): NegativeActionProof | undefined {
  return requireNegativeProofForRemovedBytes({
    action: 'atomic_positive_bytes_commit',
    target: session.relPath,
    targetUnit: 'positive-byte-file',
    before,
    after,
    preview: session.preview,
    proofOfIncorrectness: session.proofOfIncorrectness,
  });
}

function buildPositiveByteGateDecisionTree(args: {
  session: PositiveByteSession;
  before: string;
  content: string;
  result: ReturnType<typeof applyEdits>;
  contentSha256: string;
  materialization: Record<string, unknown>;
  finalTargetState: 'not-written-preview' | 'written';
  targetExisted: boolean;
}): Record<string, unknown> {
  const beforeSha256 = sha256(args.before);
  const chunkHashes = args.session.chunks.map((chunk) => chunk.sha256);
  const declaredMerkleRoot = merkleRoot(chunkHashes);
  const expectedSha256Declared = typeof args.session.expectedSha256 === 'string' && args.session.expectedSha256.length > 0;
  const expectedContentSha256Declared =
    typeof args.session.expectedContentSha256 === 'string' && args.session.expectedContentSha256.length > 0;
  const verifyDeclared = typeof args.session.verify === 'string' && args.session.verify.length > 0;
  const materializationPreDiskVerify = args.materialization.preDiskVerify;
  const preDiskVerify = isRecord(materializationPreDiskVerify) ? materializationPreDiskVerify : null;
  if (verifyDeclared && (!preDiskVerify || preDiskVerify.kind !== args.session.verify || preDiskVerify.passed !== true)) {
    throw new Error('positive-byte receipt cannot be accepted without a passed pre-disk declared verify gate');
  }
  const declaredVerifyFacts = verifyDeclared
    ? {
        requestedVerify: args.session.verify,
        kind: preDiskVerify?.kind,
        command: preDiskVerify?.command,
        replayCwd: preDiskVerify?.replayCwd,
        replayArgv: preDiskVerify?.replayArgv,
        targetRelPath: preDiskVerify?.targetRelPath,
        passed: preDiskVerify?.passed,
        preDisk: preDiskVerify?.preDisk,
        strategy: preDiskVerify?.strategy,
        summary: preDiskVerify?.summary,
      }
    : { requestedVerify: null, preDisk: true };
  const gates = [
    {
      id: 'target.resolve',
      status: 'passed',
      facts: {
        file: args.session.relPath,
        targetExisted: args.targetExisted,
        created: !args.targetExisted,
        overwrite: args.session.overwrite,
        finalTargetState: args.finalTargetState,
      },
    },
    {
      id: 'target.concurrency',
      status: expectedSha256Declared ? 'passed' : 'unjudged',
      facts: {
        expectedSha256Declared,
        expectedSha256: args.session.expectedSha256 ?? null,
        beforeSha256,
      },
    },
    {
      id: 'chunk.sequence',
      status: 'passed',
      facts: {
        chunkCount: args.session.chunks.length,
        indexes: args.session.chunks.map((chunk) => chunk.index),
      },
    },
    {
      id: 'chunk.integrity',
      status: 'passed',
      facts: {
        chunkCount: args.session.chunks.length,
        stagedBytes: args.session.bytes,
        merkleRoot: declaredMerkleRoot,
      },
    },
    {
      id: 'content.integrity',
      status: 'passed',
      facts: {
        expectedContentSha256Declared,
        contentSha256: args.contentSha256,
        contentBytes: Buffer.byteLength(args.content, 'utf8'),
        contentChars: args.content.length,
      },
    },
    {
      id: 'syntax.pre_disk',
      status: 'passed',
      facts: {
        language: args.result.validation.language,
        syntaxErrorsBefore: args.result.validation.before,
        syntaxErrorsAfter: args.result.validation.after,
      },
    },
    {
      id: 'declared.verify.pre_disk',
      status: verifyDeclared ? 'passed' : 'unjudged',
      facts: declaredVerifyFacts,
    },
    {
      id: 'target.materialization',
      status: 'passed',
      facts: {
        finalTargetState: args.finalTargetState,
        preview: args.session.preview,
      },
    },
    {
      id: 'trace.independence',
      status: 'passed',
      facts: {
        receiptReturnedInBand: true,
      },
    },
  ];
  const body = {
    kind: 'positive-byte-gate-decision-tree',
    schemaVersion: 1,
    decision: 'accepted',
    proofScope: 'positive-byte-materialization',
    gates,
    proofLimits: [
      'Gate tree records the declared Atomic validation battery for this materialization.',
      'Unjudged means no fact was declared for that gate, not an implicit pass.',
    ],
  };
  return { ...body, gateRunId: sha256(canonicalJSON(body)) };
}

function buildPositiveByteProofReceipt(args: {
  session: PositiveByteSession;
  before: string;
  content: string;
  result: ReturnType<typeof applyEdits>;
  contentSha256: string;
  materialization: Record<string, unknown>;
  finalTargetState: 'not-written-preview' | 'written';
  targetExisted: boolean;
}): Record<string, unknown> {
  const preDiskVerify = isRecord(args.materialization.preDiskVerify)
    ? args.materialization.preDiskVerify
    : null;
  const body = {
    kind: 'positive-byte-materialization-receipt',
    schemaVersion: 1,
    sessionId: args.session.sessionId,
    file: args.session.relPath,
    absPath: args.session.absPath,
    intent: args.session.intent,
    preview: args.session.preview,
    targetExisted: args.targetExisted,
    created: !args.targetExisted,
    overwrite: args.session.overwrite,
    verify: args.session.verify ?? null,
    preDiskVerify,
    expectedSha256: args.session.expectedSha256 ?? null,
    expectedContentSha256: args.session.expectedContentSha256 ?? null,
    beforeSha256: sha256(args.before),
    contentSha256: args.contentSha256,
    contentBytes: Buffer.byteLength(args.content, 'utf8'),
    contentChars: args.content.length,
    finalTargetState: args.finalTargetState,
    chunks: args.session.chunks.map((chunk) => ({
      index: chunk.index,
      sha256: chunk.sha256,
      bytes: chunk.bytes,
    })),
    chunkCount: args.session.chunks.length,
    stagedBytes: args.session.bytes,
    merkleRoot: merkleRoot(args.session.chunks.map((chunk) => chunk.sha256)),
    validation: {
      language: args.result.validation.language,
      syntaxErrorsBefore: args.result.validation.before,
      syntaxErrorsAfter: args.result.validation.after,
      preDisk: true,
    },
    materialization: args.materialization,
    gateDecisionTree: buildPositiveByteGateDecisionTree(args),
    positiveByteProof: {
      chunkSequence: 'contiguous-zero-based-indexes',
      chunkIntegrity: 'sha256-and-byte-count-reverified-before-target-materialization',
      contentIntegrity: 'joined-content-sha256-verified-before-target-materialization',
      targetGuard: args.session.expectedSha256 ? 'expectedSha256-checked-before-target-materialization' : 'no-expectedSha256-declared',
      syntax: 'syntax-regression-checked-before-target-materialization',
      declaredVerify: preDiskVerify
        ? `${String(preDiskVerify.kind)}-passed-before-target-materialization`
        : 'no-declared-verify',
      traceIndependence: 'receipt-returned-in-band-even-when-external-trace-persistence-is-unavailable',
    },
    proofLimits: [
      'Receipt proves chunk integrity, target hash assumptions, syntax non-regression, declared pre-disk verify when requested, and exact generated content hash.',
      'Receipt does not prove runtime/product behavior beyond the declared validation battery.',
    ],
  };
  return { ...body, receiptSha256: positiveByteReceiptHash(body) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireReceiptString(receipt: Record<string, unknown>, key: string): string {
  const value = receipt[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`invalid positive-byte receipt: ${key} must be a non-empty string`);
  }
  return value;
}

function requireReceiptStringArray(value: unknown, key: string): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string' || entry.length === 0)) {
    throw new Error(`invalid positive-byte receipt: ${key} must be an array of non-empty strings`);
  }
  return value;
}

function sameStringArray(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((entry, index) => entry === b[index]);
}

function isSameOrDescendantPath(base: string, target: string): boolean {
  const relative = path.relative(path.resolve(base), path.resolve(target));
  return relative === '' || (relative.length > 0 && !relative.startsWith('..') && !path.isAbsolute(relative));
}

function validatePreDiskVerifyReplayFacts(args: {
  facts: Record<string, unknown>;
  file: string;
  absPath: string;
  requestedVerify: VerifyMode;
  expectedPassed: boolean;
  context: string;
}): void {
  const { facts, file, absPath, requestedVerify, expectedPassed, context } = args;
  const command = facts.command;
  const replayCwd = facts.replayCwd;
  const targetRelPath = facts.targetRelPath;
  const strategy = facts.strategy;
  if (facts.kind !== requestedVerify) {
    throw new Error(`invalid positive-byte receipt: ${context} replay kind must match requested verify`);
  }
  if (typeof command !== 'string' || command.length === 0) {
    throw new Error(`invalid positive-byte receipt: ${context} replay command must be a non-empty string`);
  }
  if (typeof replayCwd !== 'string' || replayCwd.length === 0) {
    throw new Error(`invalid positive-byte receipt: ${context} replayCwd must be a non-empty string`);
  }
  if (!path.isAbsolute(replayCwd)) {
    throw new Error(`invalid positive-byte receipt: ${context} replayCwd must be absolute`);
  }
  if (typeof targetRelPath !== 'string' || targetRelPath.length === 0) {
    throw new Error(`invalid positive-byte receipt: ${context} replay targetRelPath must be a non-empty string`);
  }
  if (targetRelPath !== file) {
    throw new Error(`invalid positive-byte receipt: ${context} replay targetRelPath must match receipt file`);
  }
  if (facts.passed !== expectedPassed) {
    throw new Error(`invalid positive-byte receipt: ${context} replay passed value is invalid`);
  }
  if (facts.preDisk !== true) {
    throw new Error(`invalid positive-byte receipt: ${context} replay must be pre-disk`);
  }
  if (typeof strategy !== 'string' || strategy.length === 0) {
    throw new Error(`invalid positive-byte receipt: ${context} replay strategy must be a non-empty string`);
  }

  const replayArgv = requireReceiptStringArray(facts.replayArgv, `${context}.replayArgv`);
  const repoRoot = path.resolve(REPO_ROOT);
  const replayCwdResolved = path.resolve(replayCwd);
  const absPathResolved = path.resolve(absPath);
  if (!isSameOrDescendantPath(repoRoot, replayCwdResolved)) {
    throw new Error(`invalid positive-byte receipt: ${context} replayCwd must stay inside repo`);
  }

  if (strategy === 'uncovered') {
    if (expectedPassed !== false) {
      throw new Error(`invalid positive-byte receipt: ${context} replay uncovered strategy cannot be accepted`);
    }
    if (replayCwdResolved !== repoRoot || replayArgv.length !== 0 || command !== requestedVerify) {
      throw new Error(`invalid positive-byte receipt: ${context} replay uncovered facts mismatch`);
    }
    return;
  }

  if (!isSameOrDescendantPath(replayCwdResolved, absPathResolved)) {
    throw new Error(`invalid positive-byte receipt: ${context} replayCwd must cover target absPath`);
  }

  if (strategy === 'shadow-tsconfig') {
    if (requestedVerify !== 'typecheck') {
      throw new Error(`invalid positive-byte receipt: ${context} replay shadow-tsconfig requires typecheck`);
    }
    if (replayArgv.length !== 3 || replayArgv[0] !== '--noEmit' || replayArgv[1] !== '-p') {
      throw new Error(`invalid positive-byte receipt: ${context} replay typecheck argv mismatch`);
    }
    const tsconfigArg = replayArgv[2];
    if (path.isAbsolute(tsconfigArg)) {
      throw new Error(`invalid positive-byte receipt: ${context} replay tsconfig argv must be relative`);
    }
    const tsconfigAbs = path.resolve(replayCwdResolved, tsconfigArg);
    if (!isSameOrDescendantPath(replayCwdResolved, tsconfigAbs)) {
      throw new Error(`invalid positive-byte receipt: ${context} replay tsconfig must stay inside replayCwd`);
    }
    const expectedCommand = `tsc --noEmit -p ${path.relative(REPO_ROOT, tsconfigAbs)}`;
    if (command !== expectedCommand) {
      throw new Error(`invalid positive-byte receipt: ${context} replay typecheck command mismatch`);
    }
    return;
  }

  if (strategy === 'eslint-stdin') {
    if (requestedVerify !== 'lint') {
      throw new Error(`invalid positive-byte receipt: ${context} replay eslint-stdin requires lint`);
    }
    if (
      replayArgv.length !== 5 ||
      replayArgv[0] !== '--stdin' ||
      replayArgv[1] !== '--stdin-filename' ||
      replayArgv[2] !== absPath ||
      replayArgv[3] !== '--format' ||
      replayArgv[4] !== 'json'
    ) {
      throw new Error(`invalid positive-byte receipt: ${context} replay lint argv mismatch`);
    }
    const expectedCommand = `eslint --stdin --stdin-filename ${file}`;
    if (command !== expectedCommand) {
      throw new Error(`invalid positive-byte receipt: ${context} replay lint command mismatch`);
    }
    return;
  }

  throw new Error(`invalid positive-byte receipt: ${context} replay strategy is unsupported`);
}

function positiveByteReceiptHash(receiptBody: Record<string, unknown>): string {
  const { receiptSha256: _receiptSha256, ...body } = receiptBody;
  return sha256(canonicalJSON(body));
}

function receiptChunks(receipt: Record<string, unknown>): PositiveByteChunk[] {
  const chunks = receipt.chunks;
  if (!Array.isArray(chunks)) throw new Error('invalid positive-byte receipt: chunks must be an array');
  return chunks.map((chunk, index) => {
    if (!isRecord(chunk)) throw new Error(`invalid positive-byte receipt: chunk ${index} must be an object`);
    if (chunk.index !== index) throw new Error(`invalid positive-byte receipt: chunk ${index} index is not contiguous`);
    if (typeof chunk.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(chunk.sha256)) {
      throw new Error(`invalid positive-byte receipt: chunk ${index} sha256 is invalid`);
    }
    if (typeof chunk.bytes !== 'number' || !Number.isSafeInteger(chunk.bytes) || chunk.bytes < 0) {
      throw new Error(`invalid positive-byte receipt: chunk ${index} byte count is invalid`);
    }
    return { index, sha256: chunk.sha256, bytes: chunk.bytes };
  });
}

function requireReceiptSafeInteger(receipt: Record<string, unknown>, key: string): number {
  const value = receipt[key];
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`invalid positive-byte receipt: ${key} must be a non-negative safe integer`);
  }
  return value;
}

function validatePositiveByteReceiptDomainInvariants(
  receipt: Record<string, unknown>,
  chunks: PositiveByteChunk[],
  declaredMerkleRoot: string,
  contentSha256: string,
): { stagedBytes: number } {
  if (receipt.schemaVersion !== 1) throw new Error('invalid positive-byte receipt: schemaVersion must be 1');
  if (!/^[0-9a-f]{64}$/.test(contentSha256)) {
    throw new Error('invalid positive-byte receipt: contentSha256 must be a sha256 hex digest');
  }
  const file = requireReceiptString(receipt, 'file');
  const absPath = requireReceiptString(receipt, 'absPath');
  const resolvedTarget = resolveSafeTarget(file);
  if (absPath !== resolvedTarget.absPath) {
    throw new Error('invalid positive-byte receipt: absPath must match resolved receipt file');
  }

  const declaredChunkCount = requireReceiptSafeInteger(receipt, 'chunkCount');
  if (declaredChunkCount !== chunks.length) {
    throw new Error(`invalid positive-byte receipt: chunkCount ${declaredChunkCount} does not match ${chunks.length} chunks`);
  }

  const stagedBytes = chunks.reduce((sum, chunk) => sum + chunk.bytes, 0);
  const declaredStagedBytes = requireReceiptSafeInteger(receipt, 'stagedBytes');
  if (declaredStagedBytes !== stagedBytes) {
    throw new Error(`invalid positive-byte receipt: stagedBytes ${declaredStagedBytes} does not match chunk bytes ${stagedBytes}`);
  }

  const beforeSha256 = requireReceiptString(receipt, 'beforeSha256');

  const expectedContentSha256 = receipt.expectedContentSha256;
  if (expectedContentSha256 !== null && expectedContentSha256 !== undefined) {
    if (typeof expectedContentSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(expectedContentSha256)) {
      throw new Error('invalid positive-byte receipt: expectedContentSha256 must be null or a sha256 hex digest');
    }
    if (expectedContentSha256 !== contentSha256) {
      throw new Error(
        `invalid positive-byte receipt: expectedContentSha256 ${expectedContentSha256} does not match contentSha256 ${contentSha256}`,
      );
    }
  }

  if (typeof receipt.preview !== 'boolean') throw new Error('invalid positive-byte receipt: preview must be a boolean');
  const finalTargetState = requireReceiptString(receipt, 'finalTargetState');
  const expectedFinalTargetState = receipt.preview ? 'not-written-preview' : 'written';
  if (finalTargetState !== expectedFinalTargetState) {
    throw new Error(
      `invalid positive-byte receipt: finalTargetState ${finalTargetState} contradicts preview ${receipt.preview}`,
    );
  }
  const targetExisted = receipt.targetExisted;
  const created = receipt.created;
  const overwrite = receipt.overwrite;
  if (typeof targetExisted !== 'boolean') {
    throw new Error('invalid positive-byte receipt: targetExisted must be a boolean');
  }
  if (typeof created !== 'boolean') throw new Error('invalid positive-byte receipt: created must be a boolean');
  if (typeof overwrite !== 'boolean') throw new Error('invalid positive-byte receipt: overwrite must be a boolean');
  if (created !== !targetExisted) {
    throw new Error(
      `invalid positive-byte receipt: created ${created} contradicts targetExisted ${targetExisted}`,
    );
  }

  const materialization = receipt.materialization;
  if (!isRecord(materialization)) throw new Error('invalid positive-byte receipt: materialization must be an object');
  if (materialization.kind !== 'chunked-positive-byte-materialization') {
    throw new Error('invalid positive-byte receipt: materialization kind is invalid');
  }
  if (materialization.chunkCount !== chunks.length) {
    throw new Error(`invalid positive-byte receipt: materialization chunkCount does not match ${chunks.length} chunks`);
  }
  if (materialization.stagedBytes !== stagedBytes) {
    throw new Error(`invalid positive-byte receipt: materialization stagedBytes does not match chunk bytes ${stagedBytes}`);
  }
  if (materialization.contentSha256 !== contentSha256) {
    throw new Error('invalid positive-byte receipt: materialization contentSha256 does not match receipt contentSha256');
  }
  if (materialization.merkleRoot !== declaredMerkleRoot) {
    throw new Error('invalid positive-byte receipt: materialization merkleRoot does not match receipt merkleRoot');
  }

  const requestedVerify = receipt.verify;
  if (
    requestedVerify !== null &&
    requestedVerify !== undefined &&
    requestedVerify !== 'typecheck' &&
    requestedVerify !== 'lint'
  ) {
    throw new Error('invalid positive-byte receipt: verify must be null, typecheck, or lint');
  }
  const preDiskVerify = receipt.preDiskVerify;
  let preDiskVerifyRecord: Record<string, unknown> | null = null;
  if (requestedVerify === null || requestedVerify === undefined) {
    if (preDiskVerify !== null && preDiskVerify !== undefined) {
      throw new Error('invalid positive-byte receipt: preDiskVerify must be null when verify is not requested');
    }
  } else {
    if (!isRecord(preDiskVerify)) throw new Error('invalid positive-byte receipt: preDiskVerify must be an object');
    if (preDiskVerify.kind !== requestedVerify) {
      throw new Error('invalid positive-byte receipt: preDiskVerify kind must match requested verify');
    }
    if (preDiskVerify.passed !== true) {
      throw new Error('invalid positive-byte receipt: preDiskVerify must record a passed gate');
    }
    if (preDiskVerify.preDisk !== true) {
      throw new Error('invalid positive-byte receipt: preDiskVerify.preDisk must be true');
    }
    for (const key of ['command', 'strategy', 'summary', 'replayCwd', 'targetRelPath']) {
      if (typeof preDiskVerify[key] !== 'string' || String(preDiskVerify[key]).length === 0) {
        throw new Error(`invalid positive-byte receipt: preDiskVerify.${key} must be a non-empty string`);
      }
    }
    requireReceiptStringArray(preDiskVerify.replayArgv, 'preDiskVerify.replayArgv');
    validatePreDiskVerifyReplayFacts({
      facts: preDiskVerify,
      file,
      absPath,
      requestedVerify,
      expectedPassed: true,
      context: 'preDiskVerify',
    });
    preDiskVerifyRecord = preDiskVerify;
  }
  const materializationPreDiskVerify = materialization.preDiskVerify;
  if (preDiskVerifyRecord === null) {
    if (materializationPreDiskVerify !== null && materializationPreDiskVerify !== undefined) {
      throw new Error('invalid positive-byte receipt: materialization preDiskVerify must be null when verify is not requested');
    }
  } else {
    if (!isRecord(materializationPreDiskVerify)) {
      throw new Error('invalid positive-byte receipt: materialization preDiskVerify must be an object');
    }
    for (const key of ['kind', 'command', 'passed', 'preDisk', 'strategy', 'summary', 'replayCwd', 'targetRelPath']) {
      if (materializationPreDiskVerify[key] !== preDiskVerifyRecord[key]) {
        throw new Error('invalid positive-byte receipt: materialization preDiskVerify facts mismatch');
      }
    }
    if (
      !sameStringArray(
        requireReceiptStringArray(materializationPreDiskVerify.replayArgv, 'materialization.preDiskVerify.replayArgv'),
        requireReceiptStringArray(preDiskVerifyRecord.replayArgv, 'preDiskVerify.replayArgv'),
      )
    ) {
      throw new Error('invalid positive-byte receipt: materialization preDiskVerify facts mismatch');
    }
  }

  const validation = receipt.validation;
  if (!isRecord(validation)) throw new Error('invalid positive-byte receipt: validation must be an object');
  if (validation.preDisk !== true) throw new Error('invalid positive-byte receipt: validation.preDisk must be true');
  const before = validation.syntaxErrorsBefore;
  const after = validation.syntaxErrorsAfter;
  if (typeof before !== 'number' || !Number.isSafeInteger(before) || before < 0) {
    throw new Error('invalid positive-byte receipt: validation.syntaxErrorsBefore must be a non-negative safe integer');
  }
  if (typeof after !== 'number' || !Number.isSafeInteger(after) || after < 0) {
    throw new Error('invalid positive-byte receipt: validation.syntaxErrorsAfter must be a non-negative safe integer');
  }
  if (after > before) throw new Error('invalid positive-byte receipt: validation records a syntax regression');

  const gateDecisionTree = receipt.gateDecisionTree;
  if (!isRecord(gateDecisionTree)) {
    throw new Error('invalid positive-byte receipt: gateDecisionTree must be an object');
  }
  if (gateDecisionTree.kind !== 'positive-byte-gate-decision-tree') {
    throw new Error('invalid positive-byte receipt: gateDecisionTree kind is invalid');
  }
  if (gateDecisionTree.schemaVersion !== 1) {
    throw new Error('invalid positive-byte receipt: gateDecisionTree schemaVersion must be 1');
  }
  if (gateDecisionTree.decision !== 'accepted') {
    throw new Error('invalid positive-byte receipt: gateDecisionTree decision must be accepted');
  }
  const declaredGateRunId = requireReceiptString(gateDecisionTree, 'gateRunId');
  if (!/^[0-9a-f]{64}$/.test(declaredGateRunId)) {
    throw new Error('invalid positive-byte receipt: gateDecisionTree gateRunId must be a sha256 hex digest');
  }
  const { gateRunId: _gateRunId, ...gateDecisionTreeBody } = gateDecisionTree;
  const recomputedGateRunId = sha256(canonicalJSON(gateDecisionTreeBody));
  if (declaredGateRunId !== recomputedGateRunId) {
    throw new Error(
      `invalid positive-byte receipt: gateDecisionTree gateRunId mismatch; declared ${declaredGateRunId}, recomputed ${recomputedGateRunId}`,
    );
  }
  const gates = gateDecisionTree.gates;
  if (!Array.isArray(gates)) {
    throw new Error('invalid positive-byte receipt: gateDecisionTree.gates must be an array');
  }
  const gatesById = new Map<string, Record<string, unknown>>();
  for (const gate of gates) {
    if (!isRecord(gate)) throw new Error('invalid positive-byte receipt: every gateDecisionTree gate must be an object');
    const id = gate.id;
    const status = gate.status;
    if (typeof id !== 'string' || id.length === 0) {
      throw new Error('invalid positive-byte receipt: gateDecisionTree gate id must be a non-empty string');
    }
    if (status !== 'passed' && status !== 'unjudged') {
      throw new Error(`invalid positive-byte receipt: gateDecisionTree gate ${id} has invalid status ${String(status)}`);
    }
    if (gatesById.has(id)) {
      throw new Error(`invalid positive-byte receipt: gateDecisionTree gate ${id} is duplicated`);
    }
    gatesById.set(id, gate);
  }

  function requireGate(id: string, status: 'passed' | 'unjudged'): Record<string, unknown> {
    const gate = gatesById.get(id);
    if (!gate) throw new Error(`invalid positive-byte receipt: gateDecisionTree is missing ${id}`);
    if (gate.status !== status) {
      throw new Error(`invalid positive-byte receipt: gateDecisionTree ${id} status must be ${status}`);
    }
    return gate;
  }

  function requireGateFacts(id: string): Record<string, unknown> {
    const gate = gatesById.get(id);
    if (!gate) throw new Error(`invalid positive-byte receipt: gateDecisionTree is missing ${id}`);
    if (!isRecord(gate.facts)) {
      throw new Error(`invalid positive-byte receipt: gateDecisionTree ${id} facts must be an object`);
    }
    return gate.facts;
  }

  requireGate('target.resolve', 'passed');
  const expectedSha256 = receipt.expectedSha256;
  if (expectedSha256 !== null && expectedSha256 !== undefined) {
    if (typeof expectedSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(expectedSha256)) {
      throw new Error('invalid positive-byte receipt: expectedSha256 must be null or a sha256 hex digest');
    }
    if (expectedSha256 !== beforeSha256) {
      throw new Error(
        `invalid positive-byte receipt: expectedSha256 ${expectedSha256} does not match beforeSha256 ${beforeSha256}`,
      );
    }
  }
  requireGate(
    'target.concurrency',
    typeof expectedSha256 === 'string' && expectedSha256.length > 0 ? 'passed' : 'unjudged',
  );
  requireGate('chunk.sequence', 'passed');
  requireGate('chunk.integrity', 'passed');
  requireGate('content.integrity', 'passed');
  requireGate('syntax.pre_disk', 'passed');
  requireGate('declared.verify.pre_disk', preDiskVerifyRecord ? 'passed' : 'unjudged');
  requireGate('target.materialization', 'passed');
  requireGate('trace.independence', 'passed');

  const resolveFacts = requireGateFacts('target.resolve');
  if (
    resolveFacts.file !== receipt.file ||
    resolveFacts.targetExisted !== targetExisted ||
    resolveFacts.created !== created ||
    resolveFacts.overwrite !== overwrite ||
    resolveFacts.finalTargetState !== finalTargetState
  ) {
    throw new Error('invalid positive-byte receipt: gateDecisionTree target.resolve facts mismatch');
  }
  const concurrencyFacts = requireGateFacts('target.concurrency');
  const expectedShaDeclared = typeof expectedSha256 === 'string' && expectedSha256.length > 0;
  const expectedShaFact = expectedShaDeclared ? expectedSha256 : null;
  if (
    concurrencyFacts.expectedSha256Declared !== expectedShaDeclared ||
    concurrencyFacts.expectedSha256 !== expectedShaFact ||
    concurrencyFacts.beforeSha256 !== beforeSha256
  ) {
    throw new Error('invalid positive-byte receipt: gateDecisionTree target.concurrency facts mismatch');
  }
  const chunkSequenceFacts = requireGateFacts('chunk.sequence');
  const indexes = chunkSequenceFacts.indexes;
  if (
    chunkSequenceFacts.chunkCount !== chunks.length ||
    !Array.isArray(indexes) ||
    indexes.length !== chunks.length ||
    indexes.some((index, position) => index !== position)
  ) {
    throw new Error('invalid positive-byte receipt: gateDecisionTree chunk.sequence facts mismatch');
  }
  const chunkIntegrityFacts = requireGateFacts('chunk.integrity');
  if (chunkIntegrityFacts.stagedBytes !== stagedBytes || chunkIntegrityFacts.merkleRoot !== declaredMerkleRoot) {
    throw new Error('invalid positive-byte receipt: gateDecisionTree chunk.integrity facts mismatch');
  }
  const contentIntegrityFacts = requireGateFacts('content.integrity');
  const expectedContentDeclared = typeof expectedContentSha256 === 'string' && expectedContentSha256.length > 0;
  if (
    contentIntegrityFacts.contentSha256 !== contentSha256 ||
    contentIntegrityFacts.contentBytes !== receipt.contentBytes ||
    contentIntegrityFacts.contentChars !== receipt.contentChars ||
    contentIntegrityFacts.expectedContentSha256Declared !== expectedContentDeclared
  ) {
    throw new Error('invalid positive-byte receipt: gateDecisionTree content.integrity facts mismatch');
  }
  const syntaxFacts = requireGateFacts('syntax.pre_disk');
  if (
    syntaxFacts.language !== validation.language ||
    syntaxFacts.syntaxErrorsBefore !== before ||
    syntaxFacts.syntaxErrorsAfter !== after
  ) {
    throw new Error('invalid positive-byte receipt: gateDecisionTree syntax.pre_disk facts mismatch');
  }
  const verifyFacts = requireGateFacts('declared.verify.pre_disk');
  if (preDiskVerifyRecord) {
    if (
      verifyFacts.requestedVerify !== requestedVerify ||
      verifyFacts.kind !== preDiskVerifyRecord.kind ||
      verifyFacts.command !== preDiskVerifyRecord.command ||
      verifyFacts.replayCwd !== preDiskVerifyRecord.replayCwd ||
      !sameStringArray(
        requireReceiptStringArray(verifyFacts.replayArgv, 'gateDecisionTree declared.verify.pre_disk replayArgv'),
        requireReceiptStringArray(preDiskVerifyRecord.replayArgv, 'preDiskVerify.replayArgv'),
      ) ||
      verifyFacts.targetRelPath !== preDiskVerifyRecord.targetRelPath ||
      verifyFacts.passed !== true ||
      verifyFacts.preDisk !== true ||
      verifyFacts.strategy !== preDiskVerifyRecord.strategy ||
      verifyFacts.summary !== preDiskVerifyRecord.summary
    ) {
      throw new Error('invalid positive-byte receipt: gateDecisionTree declared.verify.pre_disk facts mismatch');
    }
  } else if (verifyFacts.requestedVerify !== null || verifyFacts.preDisk !== true) {
    throw new Error('invalid positive-byte receipt: gateDecisionTree declared.verify.pre_disk facts mismatch');
  }
  const targetFacts = requireGateFacts('target.materialization');
  if (targetFacts.finalTargetState !== finalTargetState || targetFacts.preview !== receipt.preview) {
    throw new Error('invalid positive-byte receipt: gateDecisionTree target.materialization facts mismatch');
  }

  return { stagedBytes };
}

function validatePositiveByteRejectionReceiptDomainInvariants(receipt: Record<string, unknown>): {
  failedGate: string;
  cleanup: string;
  targetWrite: string;
  chunkCount: number;
  stagedBytes: number;
  failedGateFacts: Record<string, unknown>;
} {
  if (receipt.schemaVersion !== 1) throw new Error('invalid positive-byte rejection receipt: schemaVersion must be 1');
  const sessionId = requireReceiptString(receipt, 'sessionId');
  if (!SESSION_ID_RE.test(sessionId)) {
    throw new Error('invalid positive-byte rejection receipt: sessionId is invalid');
  }
  const file = requireReceiptString(receipt, 'file');
  const absPath = requireReceiptString(receipt, 'absPath');
  const resolvedTarget = resolveSafeTarget(file);
  if (absPath !== resolvedTarget.absPath) {
    throw new Error('invalid positive-byte rejection receipt: absPath must match resolved receipt file');
  }
  requireReceiptString(receipt, 'intent');
  const failedGate = requireReceiptString(receipt, 'failedGate');
  if (failedGate.length === 0 || failedGate === 'session.lookup' || failedGate === 'session.cleanup') {
    throw new Error('invalid positive-byte rejection receipt: failedGate is invalid');
  }
  const error = requireReceiptString(receipt, 'error');
  const chunkCount = requireReceiptSafeInteger(receipt, 'chunkCount');
  const stagedBytes = requireReceiptSafeInteger(receipt, 'stagedBytes');
  const targetWrite = requireReceiptString(receipt, 'targetWrite');
  if (targetWrite !== 'not-attempted' && targetWrite !== 'unknown') {
    throw new Error('invalid positive-byte rejection receipt: targetWrite is invalid');
  }
  const expectedTargetMaterialized = targetWrite === 'unknown' ? 'unknown' : false;
  if (receipt.targetMaterialized !== expectedTargetMaterialized) {
    throw new Error('invalid positive-byte rejection receipt: targetMaterialized contradicts targetWrite');
  }
  const cleanup = requireReceiptString(receipt, 'cleanup');
  if (cleanup !== 'session-dropped' && cleanup !== 'session-drop-failed') {
    throw new Error('invalid positive-byte rejection receipt: cleanup is invalid');
  }

  const gateDecisionTree = receipt.gateDecisionTree;
  if (!isRecord(gateDecisionTree)) {
    throw new Error('invalid positive-byte rejection receipt: gateDecisionTree must be an object');
  }
  if (gateDecisionTree.kind !== 'positive-byte-gate-decision-tree') {
    throw new Error('invalid positive-byte rejection receipt: gateDecisionTree kind is invalid');
  }
  if (gateDecisionTree.schemaVersion !== 1) {
    throw new Error('invalid positive-byte rejection receipt: gateDecisionTree schemaVersion must be 1');
  }
  if (gateDecisionTree.decision !== 'rejected') {
    throw new Error('invalid positive-byte rejection receipt: gateDecisionTree decision must be rejected');
  }
  const declaredGateRunId = requireReceiptString(gateDecisionTree, 'gateRunId');
  if (!/^[0-9a-f]{64}$/.test(declaredGateRunId)) {
    throw new Error('invalid positive-byte rejection receipt: gateDecisionTree gateRunId must be a sha256 hex digest');
  }
  const { gateRunId: _gateRunId, ...gateDecisionTreeBody } = gateDecisionTree;
  const recomputedGateRunId = sha256(canonicalJSON(gateDecisionTreeBody));
  if (declaredGateRunId !== recomputedGateRunId) {
    throw new Error(
      `invalid positive-byte rejection receipt: gateDecisionTree gateRunId mismatch; declared ${declaredGateRunId}, recomputed ${recomputedGateRunId}`,
    );
  }
  const gates = gateDecisionTree.gates;
  if (!Array.isArray(gates)) {
    throw new Error('invalid positive-byte rejection receipt: gateDecisionTree.gates must be an array');
  }
  const gatesById = new Map<string, Record<string, unknown>>();
  for (const gate of gates) {
    if (!isRecord(gate)) {
      throw new Error('invalid positive-byte rejection receipt: every gateDecisionTree gate must be an object');
    }
    const id = gate.id;
    const status = gate.status;
    if (typeof id !== 'string' || id.length === 0) {
      throw new Error('invalid positive-byte rejection receipt: gateDecisionTree gate id must be a non-empty string');
    }
    if (status !== 'passed' && status !== 'failed' && status !== 'unjudged') {
      throw new Error(
        `invalid positive-byte rejection receipt: gateDecisionTree gate ${id} has invalid status ${String(status)}`,
      );
    }
    if (gatesById.has(id)) {
      throw new Error(`invalid positive-byte rejection receipt: gateDecisionTree gate ${id} is duplicated`);
    }
    gatesById.set(id, gate);
  }

  function requireGate(id: string, status: 'passed' | 'failed' | 'unjudged'): Record<string, unknown> {
    const gate = gatesById.get(id);
    if (!gate) throw new Error(`invalid positive-byte rejection receipt: gateDecisionTree is missing ${id}`);
    if (gate.status !== status) {
      throw new Error(`invalid positive-byte rejection receipt: gateDecisionTree ${id} status must be ${status}`);
    }
    return gate;
  }

  function requireGateFacts(id: string): Record<string, unknown> {
    const gate = gatesById.get(id);
    if (!gate) throw new Error(`invalid positive-byte rejection receipt: gateDecisionTree is missing ${id}`);
    if (!isRecord(gate.facts)) {
      throw new Error(`invalid positive-byte rejection receipt: gateDecisionTree ${id} facts must be an object`);
    }
    return gate.facts;
  }

  requireGate('session.lookup', 'passed');
  requireGate(failedGate, 'failed');
  requireGate('session.cleanup', cleanup === 'session-dropped' ? 'passed' : 'failed');

  const lookupFacts = requireGateFacts('session.lookup');
  if (
    lookupFacts.sessionId !== sessionId ||
    lookupFacts.file !== file ||
    lookupFacts.chunkCount !== chunkCount ||
    lookupFacts.stagedBytes !== stagedBytes
  ) {
    throw new Error('invalid positive-byte rejection receipt: gateDecisionTree session.lookup facts mismatch');
  }
  const failedFacts = requireGateFacts(failedGate);
  if (failedFacts.error !== error || failedFacts.targetWrite !== targetWrite) {
    throw new Error('invalid positive-byte rejection receipt: gateDecisionTree failed gate facts mismatch');
  }
  if (failedGate === 'declared.verify.pre_disk') {
    if (failedFacts.requestedVerify !== 'typecheck' && failedFacts.requestedVerify !== 'lint') {
      throw new Error('invalid positive-byte rejection receipt: declared verify failed gate must include requestedVerify');
    }
    if (failedFacts.kind !== failedFacts.requestedVerify) {
      throw new Error('invalid positive-byte rejection receipt: declared verify failed gate kind mismatch');
    }
    if (typeof failedFacts.command !== 'string' || failedFacts.command.length === 0) {
      throw new Error('invalid positive-byte rejection receipt: declared verify failed gate command is missing');
    }
    if (typeof failedFacts.replayCwd !== 'string' || failedFacts.replayCwd.length === 0) {
      throw new Error('invalid positive-byte rejection receipt: declared verify failed gate replayCwd is missing');
    }
    requireReceiptStringArray(failedFacts.replayArgv, 'declared verify failed gate replayArgv');
    if (typeof failedFacts.targetRelPath !== 'string' || failedFacts.targetRelPath.length === 0) {
      throw new Error('invalid positive-byte rejection receipt: declared verify failed gate targetRelPath is missing');
    }
    if (failedFacts.passed !== false) {
      throw new Error('invalid positive-byte rejection receipt: declared verify failed gate must record passed false');
    }
    if (failedFacts.preDisk !== true) {
      throw new Error('invalid positive-byte rejection receipt: declared verify failed gate must record preDisk true');
    }
    if (typeof failedFacts.strategy !== 'string' || failedFacts.strategy.length === 0) {
      throw new Error('invalid positive-byte rejection receipt: declared verify failed gate strategy is missing');
    }
    if (typeof failedFacts.summary !== 'string' || failedFacts.summary.length === 0 || !error.includes(failedFacts.summary)) {
      throw new Error('invalid positive-byte rejection receipt: declared verify failed gate summary mismatch');
    }
    validatePreDiskVerifyReplayFacts({
      facts: failedFacts,
      file,
      absPath,
      requestedVerify: failedFacts.requestedVerify as VerifyMode,
      expectedPassed: false,
      context: 'declared verify failed gate',
    });
  }
  const cleanupFacts = requireGateFacts('session.cleanup');
  if (cleanupFacts.cleanup !== cleanup) {
    throw new Error('invalid positive-byte rejection receipt: gateDecisionTree session.cleanup facts mismatch');
  }
  if (cleanup === 'session-drop-failed' && typeof cleanupFacts.cleanupError !== 'string') {
    throw new Error('invalid positive-byte rejection receipt: cleanup failure must include cleanupError');
  }

  return { failedGate, cleanup, targetWrite, chunkCount, stagedBytes, failedGateFacts: failedFacts };
}

export function registerToolsPositiveBytes(server: McpServer): void {
  server.registerTool(
    'atomic_positive_bytes_begin',
    {
      title: 'Begin a positive-byte materialization session',
      description:
        'Starts a governed Atomic-local staging session for a large generated file. Chunks are persisted with ' +
        'per-chunk hashes, then committed once as a verified all-or-nothing target write.',
      inputSchema: {
        file: z.string().describe('repo-relative target file'),
        intent: z.string().min(1).describe('semantic reason these generated bytes should exist'),
        expectedContentSha256: z.string().optional().describe('sha256 expected for the joined chunks'),
        expectedSha256: z
          .string()
          .optional()
          .describe("optimistic-concurrency guard for the target's current bytes"),
        overwrite: z.boolean().optional().describe('allow wholesale replacement of an existing non-empty file'),
        preview: z.boolean().optional().describe('validate final materialization without writing the target'),
        verify: z
          .enum(['typecheck', 'lint'])
          .optional()
          .describe('run declared validation on staged bytes before target materialization'),
        lock: z.boolean().optional(),
        proofOfIncorrectness: z
          .string()
          .optional()
          .describe('required when overwrite removes existing positive bytes'),
      },
    },
    async (a) => {
      try {
        pruneExpiredSessions();
        const { absPath, relPath } = resolveSafeTarget(a.file);
        const sessionId = newSessionId();
        const now = nowMs();
        const session: PositiveByteSession = {
          schemaVersion: 1,
          sessionId,
          file: a.file,
          relPath,
          absPath,
          intent: a.intent,
          expectedContentSha256: a.expectedContentSha256,
          expectedSha256: a.expectedSha256,
          overwrite: a.overwrite ?? false,
          preview: a.preview ?? false,
          verify: a.verify,
          lock: a.lock ?? false,
          proofOfIncorrectness: a.proofOfIncorrectness,
          chunks: [],
          bytes: 0,
          createdAt: now,
          updatedAt: now,
          expiresAt: now + POSITIVE_BYTE_SESSION_TTL_MS,
        };
        writeSession(session);
        return ok({
          ok: true,
          changed: false,
          sessionId,
          file: relPath,
          intent: a.intent,
          preview: a.preview ?? false,
          verify: a.verify ?? null,
          ttlMs: POSITIVE_BYTE_SESSION_TTL_MS,
          staging: 'scripts/mcp/atomic-edit/.positive-byte-sessions',
          materialization: 'chunked-positive-byte-staging',
          summaryForHuman: `Started positive-byte materialization session for ${relPath}`,
        });
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e));
      }
    },
  );

  server.registerTool(
    'atomic_positive_bytes_append',
    {
      title: 'Append one verified positive-byte chunk',
      description:
        'Adds exactly one chunk to an existing positive-byte session. The index must be the next sequence number, ' +
        'and an optional sha256 guard proves the chunk bytes arrived intact.',
      inputSchema: {
        sessionId: z.string(),
        index: z.number().int().min(0),
        text: z.string(),
        sha256: z.string().optional().describe('sha256 of this chunk text'),
      },
    },
    async (a) => {
      try {
        const session = readSession(a.sessionId);
        if (a.index !== session.chunks.length) {
          return fail(
            `refused: positive-byte chunk index ${a.index} is not the next expected index ${session.chunks.length}`,
          );
        }
        const chunkSha256 = sha256(a.text);
        if (a.sha256 && a.sha256 !== chunkSha256) {
          return fail(`refused: positive-byte chunk ${a.index} sha256 mismatch`);
        }
        const bytes = Buffer.byteLength(a.text, 'utf8');
        const stagedChunkPath = chunkPath(session.sessionId, a.index);
        try {
          atomicWrite(stagedChunkPath, a.text);
          session.chunks.push({ index: a.index, sha256: chunkSha256, bytes });
          session.bytes += bytes;
          refreshSession(session);
        } catch (e) {
          fs.rmSync(stagedChunkPath, { force: true });
          throw e;
        }
        return ok({
          ok: true,
          changed: false,
          sessionId: session.sessionId,
          file: session.relPath,
          index: a.index,
          chunkSha256,
          chunkBytes: bytes,
          chunks: session.chunks.length,
          stagedBytes: session.bytes,
          cumulativeMerkleRoot: merkleRoot(session.chunks.map((chunk) => chunk.sha256)),
          summaryForHuman: `Accepted positive-byte chunk ${a.index} for ${session.relPath}`,
        });
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e));
      }
    },
  );

  server.registerTool(
    'atomic_positive_bytes_commit',
    {
      title: 'Commit a staged positive-byte file transaction',
      description:
        'Joins staged chunks, verifies final sha256/Merkle receipt, runs Atomic validation, and materializes the ' +
        'target through the same mutation firewall as atomic_create_file.',
      inputSchema: {
        sessionId: z.string(),
      },
    },
    async (a) => {
      try {
        const session = readSession(a.sessionId);
        const exists = fs.existsSync(session.absPath);
        if (exists && fs.statSync(session.absPath).isDirectory()) {
          return failCommitAndDropSession(session, `refused: ${session.relPath} is a directory, not a file.`);
        }
        const before = exists ? readUtf8(session.absPath) : '';
        if (exists && before.trim() !== '' && !session.overwrite) {
          return failCommitAndDropSession(
            session,
            `refused: ${session.relPath} already exists and is non-empty. ` +
              `Start the session with overwrite:true plus proofOfIncorrectness for wholesale replacement.`,
          );
        }
        try {
          guardSha(before, session.expectedSha256);
        } catch (e) {
          return failCommitAndDropSession(session, e instanceof Error ? e.message : String(e));
        }
        let content: string;
        try {
          content = sessionContent(session);
        } catch (e) {
          return failCommitAndDropSession(session, e instanceof Error ? e.message : String(e), {
            failedGate: 'chunk.integrity',
          });
        }
        const contentSha256 = sha256(content);
        if (session.expectedContentSha256 && session.expectedContentSha256 !== contentSha256) {
          return failCommitAndDropSession(
            session,
            `refused: positive-byte content sha256 mismatch for ${session.relPath}; ` +
              `expected ${session.expectedContentSha256}, got ${contentSha256}.`,
          );
        }
        let r: ReturnType<typeof applyEdits>;
        try {
          r = applyEdits(session.relPath, before, [wholeFileEdit(before, content)]);
        } catch (e) {
          return failCommitAndDropSession(session, e instanceof Error ? e.message : String(e));
        }
        if (!r.validation.ok) {
          return failCommitAndDropSession(
            session,
            `rejected: positive-byte materialization would introduce a ${r.validation.language} syntax error ` +
              `(${r.validation.before} -> ${r.validation.after}). ${r.validation.introduced ?? ''} - file NOT modified.`,
            { failedGate: 'syntax.pre_disk' },
          );
        }
        const preDiskVerify = runPositiveBytePreDiskVerify(session, content);
        if (preDiskVerify && !preDiskVerify.passed) {
          return failCommitAndDropSession(
            session,
            `rejected: positive-byte ${preDiskVerify.kind} verification failed before target materialization. ` +
              `${preDiskVerify.summary} - file NOT modified.`,
            {
              failedGate: 'declared.verify.pre_disk',
              failedGateFacts: {
                requestedVerify: preDiskVerify.kind,
                kind: preDiskVerify.kind,
                command: preDiskVerify.command,
                replayCwd: preDiskVerify.replayCwd,
                replayArgv: preDiskVerify.replayArgv,
                targetRelPath: preDiskVerify.targetRelPath,
                passed: preDiskVerify.passed,
                preDisk: preDiskVerify.preDisk,
                strategy: preDiskVerify.strategy,
                summary: preDiskVerify.summary,
              },
            },
          );
        }
        const materialization = {
          kind: 'chunked-positive-byte-materialization',
          intent: session.intent,
          chunkCount: session.chunks.length,
          stagedBytes: session.bytes,
          contentSha256,
          merkleRoot: merkleRoot(session.chunks.map((chunk) => chunk.sha256)),
          preDiskValidation: preDiskVerify
            ? 'syntax-and-declared-verify-checked-before-target-materialization'
            : 'syntax-regression-checked-before-target-materialization',
          preDiskVerify,
          chunkReceiptValidation: 'per-chunk-sha256-and-byte-count-reverified-before-target-materialization',
          staging: 'scripts/mcp/atomic-edit/.positive-byte-sessions',
        };
        const proofReceipt = buildPositiveByteProofReceipt({
          session,
          before,
          content,
          result: r,
          contentSha256,
          materialization,
          finalTargetState: session.preview ? 'not-written-preview' : 'written',
          targetExisted: exists,
        });
        if (session.preview) {
          removeSession(session.sessionId);
          return ok({
            ok: true,
            preview: true,
            changed: false,
            file: session.relPath,
            created: !exists,
            lines: content.split('\n').length,
            contentSha256,
            validation: {
              language: r.validation.language,
              syntaxErrorsBefore: r.validation.before,
              syntaxErrorsAfter: r.validation.after,
            },
            ...(preDiskVerify ? { verify: preDiskVerify } : {}),
            materialization,
            proofReceipt,
            summaryForHuman:
              `Previewed positive-byte materialization for ${session.relPath} ` +
              `(${session.chunks.length} chunks, ${session.bytes} bytes). Target was not written.`,
          });
        }
        fs.mkdirSync(path.dirname(session.absPath), { recursive: true });
        let negativeActionProof: NegativeActionProof | undefined;
        try {
          negativeActionProof = negativeProofForCommit(session, before, content);
        } catch (e) {
          return failCommitAndDropSession(session, e instanceof Error ? e.message : String(e));
        }
        let result: ReturnType<typeof commit>;
        try {
          result = commit(
            session.relPath,
            session.absPath,
            before,
            r,
            {
              op: 'atomic_positive_bytes_commit',
              created: !exists,
              contentSha256,
              materialization,
              proofReceipt,
              ...(preDiskVerify ? { verify: preDiskVerify } : {}),
              ...(negativeActionProof ? { negativeActionProof } : {}),
            },
            false,
            undefined,
            session.lock,
          );
        } catch (e) {
          return failCommitAndDropSession(
            session,
            `positive-byte commit failed during target materialization for ${session.relPath}: ` +
              (e instanceof Error ? e.message : String(e)),
            { targetWrite: 'unknown' },
          );
        }
        removeSession(session.sessionId);
        return result;
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e));
      }
    },
  );

  server.registerTool(
    'atomic_positive_bytes_verify_receipt',
    {
      title: 'Verify a positive-byte proof or rejection receipt',
      description:
        'Recomputes the receipt body hash, validates accepted materialization receipts, and independently validates rejection receipts.',
      inputSchema: {
        receipt: z
          .record(z.string(), z.unknown())
          .describe('proofReceipt or rejectionReceipt returned by atomic_positive_bytes_commit'),
        requireCurrentTarget: z.boolean().optional().describe('also require the current target file sha256 to match accepted written receipts'),
      },
    },
    async (a) => {
      try {
        const receipt = a.receipt;
        if (!isRecord(receipt)) return fail('invalid positive-byte receipt: receipt must be an object');
        const kind = receipt.kind;
        if (
          kind !== 'positive-byte-materialization-receipt' &&
          kind !== 'positive-byte-materialization-rejection-receipt'
        ) {
          return fail(
            'invalid positive-byte receipt: kind must be positive-byte-materialization-receipt or positive-byte-materialization-rejection-receipt',
          );
        }
        const declaredReceiptSha256 = requireReceiptString(receipt, 'receiptSha256');
        const recomputedReceiptSha256 = positiveByteReceiptHash(receipt);
        if (declaredReceiptSha256 !== recomputedReceiptSha256) {
          return fail(
            `refused: positive-byte receipt sha256 mismatch; ` +
              `declared ${declaredReceiptSha256}, recomputed ${recomputedReceiptSha256}`,
          );
        }
        if (kind === 'positive-byte-materialization-rejection-receipt') {
          const rejection = validatePositiveByteRejectionReceiptDomainInvariants(receipt);
          if (a.requireCurrentTarget) {
            return fail('refused: current target verification is only supported for accepted written positive-byte receipts');
          }
          return ok({
            ok: true,
            changed: false,
            rejected: true,
            receiptHashValid: true,
            receiptSha256: declaredReceiptSha256,
            failedGate: rejection.failedGate,
            failedGateFacts: rejection.failedGateFacts,
            failedGateFactsSha256: sha256(canonicalJSON(rejection.failedGateFacts)),
            targetWrite: rejection.targetWrite,
            targetMaterialized: receipt.targetMaterialized,
            cleanup: rejection.cleanup,
            chunkCount: rejection.chunkCount,
            stagedBytes: rejection.stagedBytes,
            file: receipt.file,
            summaryForHuman: 'Verified positive-byte rejection receipt hash, gate decision tree, failed gate facts, and cleanup facts.',
          });
        }
        const chunks = receiptChunks(receipt);
        const declaredMerkleRoot = requireReceiptString(receipt, 'merkleRoot');
        const recomputedMerkleRoot = merkleRoot(chunks.map((chunk) => chunk.sha256));
        if (declaredMerkleRoot !== recomputedMerkleRoot) {
          return fail(
            `refused: positive-byte receipt Merkle root mismatch; ` +
              `declared ${declaredMerkleRoot}, recomputed ${recomputedMerkleRoot}`,
          );
        }
        const contentSha256 = requireReceiptString(receipt, 'contentSha256');
        const domainInvariants = validatePositiveByteReceiptDomainInvariants(
          receipt,
          chunks,
          declaredMerkleRoot,
          contentSha256,
        );
        let currentTargetMatches: boolean | null = null;
        let currentTargetSha256: string | null = null;
        let relPath: string | null = null;
        if (a.requireCurrentTarget) {
          const finalTargetState = requireReceiptString(receipt, 'finalTargetState');
          if (finalTargetState !== 'written') {
            return fail(`refused: current target verification requires a written receipt, got ${finalTargetState}`);
          }
          const target = resolveSafeTarget(requireReceiptString(receipt, 'file'));
          relPath = target.relPath;
          if (!fs.existsSync(target.absPath) || fs.statSync(target.absPath).isDirectory()) {
            return fail(`refused: receipt target ${target.relPath} is not a current file`);
          }
          currentTargetSha256 = sha256(readUtf8(target.absPath));
          currentTargetMatches = currentTargetSha256 === contentSha256;
          if (!currentTargetMatches) {
            return fail(
              `refused: current target sha256 mismatch for ${target.relPath}; ` +
                `receipt ${contentSha256}, current ${currentTargetSha256}`,
            );
          }
        }
        return ok({
          ok: true,
          changed: false,
          receiptHashValid: true,
          receiptSha256: declaredReceiptSha256,
          merkleRootValid: true,
          merkleRoot: declaredMerkleRoot,
          chunkCount: chunks.length,
          stagedBytes: domainInvariants.stagedBytes,
          contentSha256,
          currentTargetMatches,
          currentTargetSha256,
          file: relPath ?? receipt.file,
          summaryForHuman: 'Verified positive-byte receipt hash, chunk Merkle root, and requested current target state.',
        });
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e));
      }
    },
  );

  server.registerTool(
    'atomic_positive_bytes_abort',
    {
      title: 'Abort a positive-byte materialization session',
      description:
        'Drops staged Atomic chunks. No target filesystem effect is possible before commit.',
      inputSchema: {
        sessionId: z.string(),
      },
    },
    async (a) => {
      try {
        const session = readSession(a.sessionId);
        removeSession(a.sessionId);
        return ok({
          ok: true,
          changed: false,
          sessionId: a.sessionId,
          file: session.relPath,
          droppedChunks: session.chunks.length,
          droppedBytes: session.bytes,
          summaryForHuman: `Aborted positive-byte materialization session for ${session.relPath}`,
        });
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e));
      }
    },
  );
}
