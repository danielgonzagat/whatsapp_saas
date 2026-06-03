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
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { REPO_ROOT } from './guard.js';
import { ok, fail } from './server-helpers-result.js';
import {
  assertCompleteEffectSnapshot,
  captureEffectSnapshot,
  diffEffect,
  rollbackEffect,
  type EffectSnapshot,
  type FileEffect,
} from './server-helpers-effect.js';

/** A named rollback marker: the file-set touched at savepoint time. */
interface Savepoint {
  name: string;
  /** files changed against the ORIGINAL snapshot when this savepoint was taken */
  effects: FileEffect[];
  at: number;
}

/** An open multi-tool window over REPO_ROOT. */
interface Session {
  id: string;
  /** byte-exact snapshot of REPO_ROOT at begin — the immutable rollback truth */
  snap: EffectSnapshot;
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

export function registerToolsSession(server: McpServer): void {
  server.registerTool(
    'atomic_session_begin',
    {
      title: 'Open a multi-tool atomic window over the repo',
      description:
        'Captures one byte-exact, git-decoupled snapshot of the entire repo root (the same EffectSnapshot ' +
        'substrate that backs atomic_exec proveEffect — caps + skips node_modules/.git/dist; sets ' +
        'limitReached on a cap) and returns a sessionId. Every edit/exec tool you run afterwards writes ' +
        'through atomicWrite as normal — no change to those tools — but the whole sequence is now reversible ' +
        'as ONE unit: atomic_session_rollback restores the repo byte-exact (untracked-inclusive) to this ' +
        'instant, atomic_session_savepoint marks a named undo point, atomic_session_commit emits the merged ' +
        'receipt and closes the window. The snapshot is the immutable rollback truth — it never moves.',
      inputSchema: {},
    },
    async () => {
      try {
        const snap = captureEffectSnapshot(REPO_ROOT);
        assertCompleteEffectSnapshot(snap, 'open atomic session');
        const id = randomUUID();
        const startedAt = Date.now();
        SESSIONS.set(id, { id, snap, savepoints: [], startedAt });
        return ok({
          ok: true,
          sessionId: id,
          rootAbs: snap.rootAbs,
          filesSnapshotted: snap.files.size,
          limitReached: snap.limitReached,
          startedAt,
          summary: `atomic session ${id} opened over ${snap.files.size} files${snap.limitReached ? ' (snapshot cap reached — rollback is bounded to captured files)' : ''}`,
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
        const marker: Savepoint = { name: a.name, effects, at };
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
        const durationMs = Date.now() - sess.startedAt;
        SESSIONS.delete(sess.id);
        return ok({
          ok: true,
          sessionId: sess.id,
          committed: true,
          durationMs,
          savepoints: sess.savepoints.map((s) => s.name),
          ...receipt(effects),
          summary: `committed session ${sess.id}: ${effects.length} file(s) touched, window closed`,
        });
      } catch (e) {
        return fail(`atomic_session_commit failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    },
  );
}
