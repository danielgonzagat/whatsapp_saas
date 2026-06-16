/**
 * server-tools-session — the MULTI-tool atomic WINDOW for the atomic OS.
 *
 * Today the byte-EFFECT primitives (captureEffectSnapshot / diffEffect /
 * rollbackEffect in server-helpers-effect.ts) make a SINGLE shell/exec call a
 * reversible transaction, but nothing makes a *plan* — a sequence of edit/exec
 * tool calls — atomic as a whole. This module opens a named session window over
 * REPO_ROOT: one snapshot taken at begin, every edit/exec tool that runs in
 * between writes through atomicWrite as usual (no change to those tools), and at
 * the end the whole window can be rolled back byte-exact (untracked-inclusive)
 * to the original snapshot, or to a named savepoint, or committed with a merged
 * per-file [-removed-]{+added+} receipt across ALL files touched.
 *
 * Invariant: the rollback target NEVER moves. begin captures the original bytes
 * once; savepoint markers only record WHICH files were touched up to that point
 * (a file-set), never re-snapshot — so rolling back to any savepoint restores
 * exactly the files in that file-set to their original (pre-begin) bytes, which
 * is the precise "undo everything after this savepoint" semantics for a window
 * whose only truth is the begin snapshot.
 *
 * State is in-process only (a Map keyed by sessionId): a session lives for the
 * life of the MCP server process. No git, no disk ledger — the snapshot is the
 * byte-truth, decoupled from the index exactly like the effect primitives.
 */
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { REPO_ROOT, activeWorkspaceRoot, bindWorkspaceRoot, workspaceBindingStatus } from './guard.js';
import { ok, fail } from './server-helpers-result.js';
import {
  assertCompleteEffectSnapshot,
  captureEffectSnapshot,
  diffEffect,
  rollbackEffect,
  type EffectSnapshot,
  type FileEffect,
} from './server-helpers-effect.js';
import { judgeTemporalSession, type TemporalSessionSnapshot } from './gates/temporal-session-gate.js';

/** A named rollback marker: the file-set touched at savepoint time. */
interface Savepoint {
  name: string;
  /** files changed against the ORIGINAL snapshot when this savepoint was taken */
  effects: FileEffect[];
  /** current bytes for those files at the savepoint, for temporal gates only */
  contents: Record<string, string | null>;
  at: number;
}

/** An open multi-tool window over REPO_ROOT or declared scoped paths. */
interface Session {
  id: string;
  /** byte-exact snapshot at begin — the immutable rollback truth */
  snap: EffectSnapshot;
  /** Optional repo-relative roots that bound this session's effect surface. */
  scopePaths?: string[];
  savepoints: Savepoint[];
  startedAt: number;
}

/** In-process registry: one entry per open session for the server's lifetime. */
const SESSIONS = new Map<string, Session>();

/** Trim a FileEffect[] to a compact, machine-friendly receipt. */
function receipt(effects: FileEffect[]): {
  filesTouched: number;
  created: number;
  modified: number;
  deleted: number;
  files: FileEffect[];
} {
  return {
    filesTouched: effects.length,
    created: effects.filter((e) => e.change === 'created').length,
    modified: effects.filter((e) => e.change === 'modified').length,
    deleted: effects.filter((e) => e.change === 'deleted').length,
    files: effects,
  };
}

function readCurrentContents(effects: FileEffect[]): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const effect of effects) {
    const rel = effect.file.replaceAll('\\', '/');
    try {
      out[rel] = fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
    } catch {
      out[rel] = null;
    }
  }
  return out;
}

function temporalSnapshots(sess: Session, commitEffects: FileEffect[], committedAt: number): TemporalSessionSnapshot[] {
  const commitContents = readCurrentContents(commitEffects);
  const files = new Set<string>();
  for (const savepoint of sess.savepoints) {
    for (const file of Object.keys(savepoint.contents)) files.add(file.replaceAll('\\', '/'));
  }
  for (const file of Object.keys(commitContents)) files.add(file.replaceAll('\\', '/'));

  const beginFiles: Record<string, string | null> = {};
  for (const file of files) beginFiles[file] = sess.snap.files.get(file) ?? null;

  return [
    { name: 'begin', at: sess.startedAt, files: beginFiles },
    ...sess.savepoints.map((savepoint) => ({
      name: `savepoint:${savepoint.name}`,
      at: savepoint.at,
      files: savepoint.contents,
    })),
    { name: 'commit', at: committedAt, files: commitContents },
  ];
}

function normalizeSessionScope(paths: string[] | undefined): string[] | undefined {
  if (!paths || paths.length === 0) return undefined;
  const scoped = new Set<string>();
  const baseRoot = activeWorkspaceRoot();
  for (const raw of paths) {
    const trimmed = raw.trim();
    if (!trimmed) throw new Error('atomic_session_begin paths cannot contain empty entries');
    const abs = path.isAbsolute(trimmed) ? path.resolve(trimmed) : path.resolve(baseRoot, trimmed);
    const rel = path.relative(REPO_ROOT, abs);
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
      throw new Error(`atomic_session_begin refused out-of-repo scope path: ${raw}`);
    }
    scoped.add(rel.split(path.sep).join('/'));
  }
  return [...scoped].sort();
}


export function registerToolsSession(server: McpServer): void {
  server.registerTool(
    'atomic_workspace_bind',
    {
      title: 'Bind this MCP process to one workspace root before any relative read/edit/exec',
      description:
        'Declares the workspace root for this Atomic MCP process. After binding, every relative path in read/edit/exec tools resolves against this workspace, and absolute paths outside it are refused. Use this as the first ALL-IN worker preflight in linked worktrees or sub-project directories.',
      inputSchema: {
        root: z.string().min(1).describe('absolute workspace directory, or repo-relative directory to bind'),
      },
    },
    async (a) => {
      try {
        const status = bindWorkspaceRoot(a.root);
        return ok({ ok: true, ...status, summary: `atomic workspace bound to ${status.activeWorkspaceRoot}` });
      } catch (e) {
        return fail(`atomic_workspace_bind failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    },
  );

  server.registerTool(
    'atomic_workspace_status',
    {
      title: 'Report the active Atomic workspace binding',
      description:
        'Read-only preflight: shows the repo root and active workspace root used for relative paths. If declaredBy is repo-root-default, linked-worktree workers should call atomic_workspace_bind before task work.',
      inputSchema: {},
    },
    async () => {
      try {
        return ok({ ok: true, ...workspaceBindingStatus() });
      } catch (e) {
        return fail(`atomic_workspace_status failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    },
  );

  server.registerTool(
    'atomic_session_begin',
    {
      title: 'Open a multi-tool atomic window over the repo or declared scoped paths',
      description:
        'Captures one byte-exact, git-decoupled snapshot over either the full repo root or the optional ' +
        'repo-relative paths[] scope (the same EffectSnapshot substrate that backs atomic_exec proveEffect — ' +
        'caps + skips node_modules/.git/dist unless a scoped root is explicitly inside a skipped parent; sets ' +
        'limitReached on a cap) and returns a sessionId. Scoped sessions preserve repo-relative receipts while ' +
        'avoiding whole-repo snapshot caps in large workspaces. Every edit/exec tool you run afterwards writes ' +
        'through atomicWrite as normal — no change to those tools — but the declared window is now reversible ' +
        'as ONE unit: atomic_session_rollback restores the scoped bytes byte-exact (untracked-inclusive) to this ' +
        'instant, atomic_session_savepoint marks a named undo point, atomic_session_commit emits the merged ' +
        'receipt and closes the window. The snapshot is the immutable rollback truth — it never moves.',
      inputSchema: {
        paths: z
          .array(z.string().min(1))
          .min(1)
          .max(200)
          .optional()
          .describe('optional repo-relative or in-repo absolute paths that bound this session; omit for whole repo'),
      },
    },
    async (a) => {
      try {
        const scopePaths = normalizeSessionScope(a.paths);
        const snap = captureEffectSnapshot(REPO_ROOT, scopePaths ? { includeRel: scopePaths } : {});
        assertCompleteEffectSnapshot(snap, 'open atomic session');
        const id = randomUUID();
        const startedAt = Date.now();
        SESSIONS.set(id, { id, snap, scopePaths, savepoints: [], startedAt });
        return ok({
          ok: true,
          sessionId: id,
          rootAbs: snap.rootAbs,
          scopePaths,
          filesSnapshotted: snap.files.size,
          limitReached: snap.limitReached,
          startedAt,
          summary: `atomic session ${id} opened over ${scopePaths ? `${scopePaths.length} scoped path(s)` : `${snap.files.size} files`}${snap.limitReached ? ' (snapshot cap reached — rollback is bounded to captured files)' : ''}`,
        });
      } catch (e) {
        return fail(`atomic_session_begin failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    },
  );

  server.registerTool(
    'atomic_session_savepoint',
    {
      title: 'Mark a named undo point inside the open window',
      description:
        'Records WHICH files have changed against the original begin snapshot so far, under a name — WITHOUT ' +
        're-snapshotting, so the rollback target stays the original begin bytes. A later ' +
        'atomic_session_rollback {toSavepoint} restores exactly that file-set back to its pre-begin bytes ' +
        '(undo everything that touched those files after the savepoint). Returns the file-set receipt.',
      inputSchema: {
        sessionId: z.string().min(1).describe('id from atomic_session_begin'),
        name: z.string().min(1).describe('savepoint label (unique within the session; re-use overwrites)'),
      },
    },
    async (a) => {
      try {
        const sess = SESSIONS.get(a.sessionId);
        if (!sess) return fail(`atomic_session_savepoint: unknown sessionId ${a.sessionId}`);
        const effects = diffEffect(sess.snap);
        const at = Date.now();
        // re-using a name overwrites the marker (latest file-set under that label)
        const existing = sess.savepoints.findIndex((s) => s.name === a.name);
        const marker: Savepoint = { name: a.name, effects, contents: readCurrentContents(effects), at };
        if (existing >= 0) sess.savepoints[existing] = marker;
        else sess.savepoints.push(marker);
        return ok({
          ok: true,
          sessionId: sess.id,
          savepoint: a.name,
          at,
          ...receipt(effects),
          summary: `savepoint '${a.name}' marks ${effects.length} touched file(s) in session ${sess.id}`,
        });
      } catch (e) {
        return fail(`atomic_session_savepoint failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    },
  );

  server.registerTool(
    'atomic_session_rollback',
    {
      title: 'Revert the open window to begin (or to a savepoint)',
      description:
        'Restores the repo byte-exact to the begin snapshot. Without toSavepoint it reverts EVERY file changed ' +
        'since begin (created files unlinked, modified/deleted files rewritten to their snapshot bytes — ' +
        'untracked-inclusive). With toSavepoint it reverts only the file-set recorded by that savepoint, back ' +
        'to their pre-begin bytes. The session stays open after rollback so you can continue or commit; pass ' +
        'close:true to also discard the window.',
      inputSchema: {
        sessionId: z.string().min(1).describe('id from atomic_session_begin'),
        toSavepoint: z.string().optional().describe('savepoint name to roll back to (default: full begin snapshot)'),
        close: z.boolean().optional().describe('discard the session after rolling back (default false)'),
      },
    },
    async (a) => {
      try {
        const sess = SESSIONS.get(a.sessionId);
        if (!sess) return fail(`atomic_session_rollback: unknown sessionId ${a.sessionId}`);
        let effects: FileEffect[];
        let scope: string;
        if (a.toSavepoint !== undefined) {
          const sp = sess.savepoints.find((s) => s.name === a.toSavepoint);
          if (!sp) return fail(`atomic_session_rollback: unknown savepoint '${a.toSavepoint}' in session ${sess.id}`);
          effects = sp.effects;
          scope = `savepoint '${a.toSavepoint}'`;
        } else {
          // full revert: diff live state against begin → the complete touched set
          effects = diffEffect(sess.snap);
          scope = 'begin snapshot';
        }
        const restored = rollbackEffect(sess.snap, effects);
        if (a.close) SESSIONS.delete(sess.id);
        return ok({
          ok: true,
          sessionId: sess.id,
          rolledBackTo: scope,
          filesTargeted: effects.length,
          filesRestored: restored,
          closed: a.close === true,
          ...receipt(effects),
          summary: `rolled back ${restored}/${effects.length} file(s) to ${scope} in session ${sess.id}${a.close ? ' (session closed)' : ''}`,
        });
      } catch (e) {
        return fail(`atomic_session_rollback failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    },
  );

  server.registerTool(
    'atomic_session_commit',
    {
      title: 'Close the window and emit the merged receipt',
      description:
        'Diffs the live repo against the begin snapshot and returns the merged per-file ' +
        '[-removed-]{+added+} char-level receipt across ALL files touched in the window, then clears the ' +
        'session (the byte changes stay on disk — commit accepts the window, it does NOT write or revert). ' +
        'Use atomic_session_rollback first if you want to discard instead.',
      inputSchema: {
        sessionId: z.string().min(1).describe('id from atomic_session_begin'),
      },
    },
    async (a) => {
      try {
        const sess = SESSIONS.get(a.sessionId);
        if (!sess) return fail(`atomic_session_commit: unknown sessionId ${a.sessionId}`);
        const effects = diffEffect(sess.snap);
        const committedAt = Date.now();
        const durationMs = committedAt - sess.startedAt;
        const temporalGate = judgeTemporalSession(temporalSnapshots(sess, effects, committedAt), { followingSnapshots: 2 });
        SESSIONS.delete(sess.id);
        return ok({
          ok: true,
          sessionId: sess.id,
          committed: true,
          durationMs,
          savepoints: sess.savepoints.map((s) => s.name),
          temporalGate,
          ...receipt(effects),
          summary: `committed session ${sess.id}: ${effects.length} file(s) touched, window closed`,
        });
      } catch (e) {
        return fail(`atomic_session_commit failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    },
  );
}
