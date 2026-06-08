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
  return session.chunks.map((chunk) => fs.readFileSync(chunkPath(session.sessionId, chunk.index), 'utf8')).join('');
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
          return fail(`refused: ${session.relPath} is a directory, not a file`);
        }
        const before = exists ? readUtf8(session.absPath) : '';
        if (exists && before.trim() !== '' && !session.overwrite) {
          return fail(
            `refused: ${session.relPath} already exists and is non-empty. ` +
              `Start the session with overwrite:true plus proofOfIncorrectness for wholesale replacement.`,
          );
        }
        guardSha(before, session.expectedSha256);
        const content = sessionContent(session);
        const contentSha256 = sha256(content);
        if (session.expectedContentSha256 && session.expectedContentSha256 !== contentSha256) {
          return fail(
            `refused: positive-byte content sha256 mismatch for ${session.relPath}; ` +
              `expected ${session.expectedContentSha256}, got ${contentSha256}`,
          );
        }
        const r = applyEdits(session.relPath, before, [wholeFileEdit(before, content)]);
        if (!r.validation.ok) {
          return fail(
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
          staging: 'scripts/mcp/atomic-edit/.positive-byte-sessions',
        };
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
            summaryForHuman:
              `Previewed positive-byte materialization for ${session.relPath} ` +
              `(${session.chunks.length} chunks, ${session.bytes} bytes). Target was not written.`,
          });
        }
        fs.mkdirSync(path.dirname(session.absPath), { recursive: true });
        const negativeActionProof = negativeProofForCommit(session, before, content);
        const result = commit(
          session.relPath,
          session.absPath,
          before,
          r,
          {
            op: 'atomic_positive_bytes_commit',
            created: !exists,
            contentSha256,
            materialization,
            ...(negativeActionProof ? { negativeActionProof } : {}),
          },
          false,
          session.verify,
          session.lock,
        );
        if (!result.isError) removeSession(session.sessionId);
        return result;
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
