import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { applyEdits } from './engine.js';
import { REPO_ROOT, resolveSafeTarget } from './guard.js';
import { atomicWrite, guardSha, readUtf8, sha256 } from './server-helpers-io.js';
import {
  requireNegativeProofForRemovedBytes,
  type NegativeActionProof,
} from './server-helpers-negative-proof.js';
import { ok, fail, commit } from './server-helpers-result.js';

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

function failCommitAndDropSession(
  session: PositiveByteSession,
  message: string,
  options: { targetWrite?: 'not-attempted' | 'unknown' } = {},
): ReturnType<typeof fail> {
  const chunkCount = session.chunks.length;
  const stagedBytes = session.bytes;
  const targetState =
    options.targetWrite === 'unknown'
      ? 'target materialization state is unknown after the exception; verify the target by sha256 before retrying.'
      : 'no target bytes were materialized.';
  try {
    removeSession(session.sessionId);
  } catch (e) {
    const cleanupError = e instanceof Error ? e.message : String(e);
    return fail(
      `${message} Additionally failed to drop positive-byte session ${session.sessionId}: ${cleanupError}.`,
    );
  }
  return fail(
    `${message} Staged positive-byte session ${session.sessionId} was dropped ` +
      `(${chunkCount} chunk(s), ${stagedBytes} byte(s)); ${targetState}`,
  );
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
    positiveByteProof: {
      chunkSequence: 'contiguous-zero-based-indexes',
      chunkIntegrity: 'sha256-and-byte-count-reverified-before-target-materialization',
      contentIntegrity: 'joined-content-sha256-verified-before-target-materialization',
      targetGuard: args.session.expectedSha256 ? 'expectedSha256-checked-before-target-materialization' : 'no-expectedSha256-declared',
      syntax: 'syntax-regression-checked-before-target-materialization',
      traceIndependence: 'receipt-returned-in-band-even-when-external-trace-persistence-is-unavailable',
    },
    proofLimits: [
      'Receipt proves chunk integrity, target hash assumptions, syntax non-regression, and exact generated content hash.',
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

function positiveByteReceiptHash(receiptBody: Record<string, unknown>): string {
  const { receiptSha256: _receiptSha256, ...body } = receiptBody;
  return sha256(JSON.stringify(body));
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

  const declaredChunkCount = requireReceiptSafeInteger(receipt, 'chunkCount');
  if (declaredChunkCount !== chunks.length) {
    throw new Error(`invalid positive-byte receipt: chunkCount ${declaredChunkCount} does not match ${chunks.length} chunks`);
  }

  const stagedBytes = chunks.reduce((sum, chunk) => sum + chunk.bytes, 0);
  const declaredStagedBytes = requireReceiptSafeInteger(receipt, 'stagedBytes');
  if (declaredStagedBytes !== stagedBytes) {
    throw new Error(`invalid positive-byte receipt: stagedBytes ${declaredStagedBytes} does not match chunk bytes ${stagedBytes}`);
  }

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

  return { stagedBytes };
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
        verify: z.enum(['typecheck', 'lint']).optional(),
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
          return failCommitAndDropSession(session, e instanceof Error ? e.message : String(e));
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
          );
        }
        const materialization = {
          kind: 'chunked-positive-byte-materialization',
          intent: session.intent,
          chunkCount: session.chunks.length,
          stagedBytes: session.bytes,
          contentSha256,
          merkleRoot: merkleRoot(session.chunks.map((chunk) => chunk.sha256)),
          preDiskValidation: 'syntax-regression-checked-before-target-materialization',
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
              ...(negativeActionProof ? { negativeActionProof } : {}),
            },
            false,
            session.verify,
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
      title: 'Verify a positive-byte proof receipt',
      description:
        'Recomputes the receipt body hash, validates the chunk Merkle root, and optionally proves the current target bytes still match the receipt content hash.',
      inputSchema: {
        receipt: z.record(z.string(), z.unknown()).describe('proofReceipt returned by atomic_positive_bytes_commit'),
        requireCurrentTarget: z.boolean().optional().describe('also require the current target file sha256 to match the receipt'),
      },
    },
    async (a) => {
      try {
        const receipt = a.receipt;
        if (!isRecord(receipt)) return fail('invalid positive-byte receipt: receipt must be an object');
        if (receipt.kind !== 'positive-byte-materialization-receipt') {
          return fail('invalid positive-byte receipt: kind must be positive-byte-materialization-receipt');
        }
        const declaredReceiptSha256 = requireReceiptString(receipt, 'receiptSha256');
        const recomputedReceiptSha256 = positiveByteReceiptHash(receipt);
        if (declaredReceiptSha256 !== recomputedReceiptSha256) {
          return fail(
            `refused: positive-byte receipt sha256 mismatch; ` +
              `declared ${declaredReceiptSha256}, recomputed ${recomputedReceiptSha256}`,
          );
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
