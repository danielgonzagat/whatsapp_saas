/**
 * server-helpers-effect.ts — the filesystem-effect substrate for atomic_exec.
 *
 * Principle (the one substance applied to shell): a terminal's persistent effect
 * is just a byte-delta on files. So govern the EFFECT, not the command —
 * snapshot the affected file-bytes BEFORE a command runs, diff them AFTER (the
 * exact char/byte changes), and reverse by restoring those bytes. This lifts the
 * one coarse escape hatch (shell) into a byte-proven, byte-reversible
 * transaction: the same envelope as every byte-edit op.
 *
 * Bounded by design: caps on file count / total bytes / per-file size, and skips
 * heavy/derived dirs (node_modules, .git, dist, …). On a cap it sets
 * limitReached so the receipt never silently claims full coverage (honest scope).
 */
import * as childProcess from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { characterDiff } from './advanced.js';
import { REPO_ROOT } from './guard.js';

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', '.next', 'build', 'coverage', '.atomic', '.turbo', 'vendor', '.cache',
]);

export interface EffectSnapshot {
  rootAbs: string;
  /** repo-relative path -> UTF-8 content of every existing in-scope file at snapshot time */
  files: Map<string, string>;
  /** repo-relative path -> POSIX mode bits for every existing in-scope file at snapshot time */
  modes?: Map<string, number>;
  limitReached: boolean;
  limits: { maxFiles: number; maxBytes: number; maxFileBytes: number };
}

export interface FileEffect {
  file: string;
  change: 'modified' | 'created' | 'deleted';
  /** char-level [-removed-]{+added+} proof for a modification */
  atomicDiff?: string;
  bytesBefore: number;
  bytesAfter: number;
  modeBefore?: number;
  modeAfter?: number;
  metadataOnly?: boolean;
}

function brokerSocketPath(): string | null {
  const value = process.env.ATOMIC_EXEC_BROKER_SOCKET;
  return value && value.trim() ? value : null;
}

function nearestExistingPath(target: string): string {
  let current = path.resolve(target);
  while (!fs.existsSync(current)) {
    const next = path.dirname(current);
    if (next === current) return current;
    current = next;
  }
  return current;
}

function hostVisiblePath(target: string): string {
  const host = process.env.ATOMIC_HOST_WRITE_ROOT?.trim();
  if (!host) return path.resolve(target);
  try {
    const hostRoot = path.resolve(host);
    const hostReal = fs.realpathSync.native(hostRoot);
    const nearest = nearestExistingPath(target);
    const nearestReal = fs.realpathSync.native(nearest);
    const relNearest = path.relative(hostReal, nearestReal);
    if (relNearest === '' || (!relNearest.startsWith('..') && !path.isAbsolute(relNearest))) {
      return path.join(hostRoot, relNearest, path.relative(nearest, path.resolve(target)));
    }
  } catch {
    // Fall through to the resolved target.
  }
  return path.resolve(target);
}

function shellPath(value: string): string {
  return JSON.stringify(String(value));
}

function canUseBrokerRollback(error: unknown): boolean {
  return Boolean(brokerSocketPath()) && typeof error === 'object' && error !== null && 'code' in error &&
    ((error as { code?: unknown }).code === 'EPERM' || (error as { code?: unknown }).code === 'EACCES');
}

function runRollbackBroker(rootAbs: string, op: 'delete' | 'write' | 'chmod', absPath: string, stdin?: string, mode?: number): void {
  const socket = brokerSocketPath();
  if (!socket) throw new Error('rollback broker fallback unavailable: ATOMIC_EXEC_BROKER_SOCKET is unset');
  const helper = hostVisiblePath(path.join(REPO_ROOT, 'scripts/mcp/atomic-edit/atomic-rollback-broker.mjs'));
  const visibleRoot = hostVisiblePath(rootAbs);
  const visibleTarget = hostVisiblePath(absPath);
  const req = {
    command: shellPath(process.execPath) + ' ' + shellPath(helper) + ' ' + shellPath(op),
    cwd: visibleRoot,
    effectRoot: visibleRoot,
    timeoutMs: 120000,
    env: {
      ATOMIC_ROLLBACK_TARGET: visibleTarget,
      ATOMIC_ROLLBACK_TMP: visibleTarget + '.atomic-rollback-' + process.pid + '.tmp',
      ...(mode === undefined ? {} : { ATOMIC_ROLLBACK_MODE: String(mode) }),
    },
    stdin,
  };
  const client = hostVisiblePath(path.join(REPO_ROOT, 'scripts/mcp/atomic-edit/atomic-exec-broker-client.mjs'));
  const res = childProcess.spawnSync(process.execPath, [client, socket], {
    cwd: visibleRoot,
    encoding: 'utf8',
    input: JSON.stringify(req),
    maxBuffer: 32 * 1024 * 1024,
    timeout: 125000,
  });
  if (res.error) throw res.error;
  let reply: Record<string, unknown>;
  try {
    reply = JSON.parse(res.stdout || '{}') as Record<string, unknown>;
  } catch {
    throw new Error('rollback broker fallback returned unparseable output: ' + String(res.stdout).slice(0, 300));
  }
  if (reply.ok !== true) {
    throw new Error('rollback broker fallback failed: ' + String(reply.error ?? reply.stderr ?? res.stderr ?? 'unknown broker failure'));
  }
}

function rollbackDelete(rootAbs: string, absPath: string): boolean {
  try {
    fs.unlinkSync(absPath);
    return true;
  } catch (e) {
    if (typeof e === 'object' && e !== null && 'code' in e && (e as { code?: unknown }).code === 'ENOENT') return true;
    if (!canUseBrokerRollback(e)) return false;
    runRollbackBroker(rootAbs, 'delete', absPath);
    return true;
  }
}

function rollbackWrite(rootAbs: string, absPath: string, content: string): boolean {
  try {
    fs.mkdirSync(path.dirname(absPath), { recursive: true });
    fs.writeFileSync(absPath, content);
    return true;
  } catch (e) {
    if (!canUseBrokerRollback(e)) return false;
    runRollbackBroker(rootAbs, 'write', absPath, content);
    return true;
  }
}

function rollbackChmod(rootAbs: string, absPath: string, mode: number): boolean {
  try {
    fs.chmodSync(absPath, mode);
    return true;
  } catch (e) {
    if (!canUseBrokerRollback(e)) return false;
    runRollbackBroker(rootAbs, 'chmod', absPath, undefined, mode);
    return true;
  }
}

export function assertCompleteEffectSnapshot(snap: EffectSnapshot, action: string): void {
  if (!snap.limitReached) return;
  throw new Error(
    `effect snapshot incomplete; refusing to ${action} because byte coverage is UNJUDGED (snapshot cap/limit reached)`,
  );
}

/** Capture the byte-content of every in-scope file under `rootAbs` (bounded). */
export function captureEffectSnapshot(
  rootAbs: string,
  opts: { maxFiles?: number; maxBytes?: number; maxFileBytes?: number } = {},
): EffectSnapshot {
  const maxFiles = opts.maxFiles ?? 4000;
  const maxBytes = opts.maxBytes ?? 64 * 1024 * 1024;
  const maxFileBytes = opts.maxFileBytes ?? 2 * 1024 * 1024;
  const limits = { maxFiles, maxBytes, maxFileBytes };
  const files = new Map<string, string>();
  const modes = new Map<string, number>();
  let total = 0;
  let limitReached = false;
  const walk = (dir: string): void => {
    if (files.size >= maxFiles || total >= maxBytes) {
      limitReached = true;
      return;
    }
    let ents: fs.Dirent[];
    try {
      ents = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of ents) {
      if (files.size >= maxFiles || total >= maxBytes) {
        limitReached = true;
        return;
      }
      if (SKIP_DIRS.has(e.name)) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        walk(full);
      } else if (e.isFile()) {
        let st: fs.Stats;
        try {
          st = fs.statSync(full);
        } catch {
          // An in-scope file we cannot stat -> coverage is no longer provably
          // complete. Honest ceiling: mark incomplete rather than pretend.
          limitReached = true;
          continue;
        }
        if (st.size > maxFileBytes) {
          // Too large to snapshot under the cap -> we cannot guarantee byte-exact
          // reversal for it, so the snapshot is NOT complete (was silently skipped).
          limitReached = true;
          continue;
        }
        let buf: Buffer;
        try {
          buf = fs.readFileSync(full);
        } catch {
          limitReached = true;
          continue;
        }
        const content = buf.toString('utf8');
        // A non-UTF-8 (binary) file cannot be faithfully held as a string and
        // would be CORRUPTED on restore (utf8 round-trip replaces invalid bytes
        // with U+FFFD). Refuse to claim coverage instead of silently corrupting:
        // mark the snapshot incomplete so assertCompleteEffectSnapshot blocks the
        // byte-exact diff/rollback. Unprovable ≡ uncovered, never a false "reversed".
        if (!buf.equals(Buffer.from(content, 'utf8'))) {
          limitReached = true;
          continue;
        }
        const rel = path.relative(rootAbs, full);
        files.set(rel, content);
        modes.set(rel, st.mode & 0o7777);
        total += st.size;
      }
    }
  };
  walk(rootAbs);
  return { rootAbs, files, modes, limitReached, limits };
}

/** Re-walk and compute the exact per-file byte-effect since the snapshot. */
export function diffEffect(snap: EffectSnapshot): FileEffect[] {
  assertCompleteEffectSnapshot(snap, 'diff filesystem effect');
  const after = captureEffectSnapshot(snap.rootAbs, snap.limits);
  assertCompleteEffectSnapshot(after, 'diff filesystem effect after command');
  const effects: FileEffect[] = [];
  const beforeModes = snap.modes ?? new Map<string, number>();
  const afterModes = after.modes ?? new Map<string, number>();
  for (const [rel, content] of after.files) {
    const before = snap.files.get(rel);
    const modeAfter = afterModes.get(rel);
    if (before === undefined) {
      effects.push({
        file: rel,
        change: 'created',
        bytesBefore: 0,
        bytesAfter: Buffer.byteLength(content, 'utf8'),
        ...(modeAfter === undefined ? {} : { modeAfter }),
      });
      continue;
    }
    const modeBefore = beforeModes.get(rel);
    const contentChanged = before !== content;
    const modeChanged = modeBefore !== modeAfter;
    if (contentChanged || modeChanged) {
      effects.push({
        file: rel,
        change: 'modified',
        ...(contentChanged ? { atomicDiff: characterDiff(before, content, rel) } : {}),
        bytesBefore: Buffer.byteLength(before, 'utf8'),
        bytesAfter: Buffer.byteLength(content, 'utf8'),
        ...(modeBefore === undefined ? {} : { modeBefore }),
        ...(modeAfter === undefined ? {} : { modeAfter }),
        ...(!contentChanged && modeChanged ? { metadataOnly: true } : {}),
      });
    }
  }
  for (const [rel, content] of snap.files) {
    if (!after.files.has(rel)) {
      const modeBefore = beforeModes.get(rel);
      effects.push({
        file: rel,
        change: 'deleted',
        bytesBefore: Buffer.byteLength(content, 'utf8'),
        bytesAfter: 0,
        ...(modeBefore === undefined ? {} : { modeBefore }),
      });
    }
  }
  return effects;
}

/** Reverse the byte-effect (restore modified/deleted to snapshot bytes; remove created). Best-effort; returns files restored. */
export function rollbackEffect(snap: EffectSnapshot, effects: FileEffect[]): number {
  assertCompleteEffectSnapshot(snap, 'rollback filesystem effect');
  let restored = 0;
  for (const eff of effects) {
    const abs = path.join(snap.rootAbs, eff.file);
    if (eff.change === 'created') {
      if (rollbackDelete(snap.rootAbs, abs)) restored += 1;
      continue;
    }
    const before = snap.files.get(eff.file);
    if (before === undefined) continue;
    let restoredThisFile = false;
    if (eff.change === 'deleted' || eff.metadataOnly !== true) {
      restoredThisFile = rollbackWrite(snap.rootAbs, abs, before) || restoredThisFile;
    }
    const modeBefore = snap.modes?.get(eff.file);
    if (modeBefore !== undefined) {
      restoredThisFile = rollbackChmod(snap.rootAbs, abs, modeBefore) || restoredThisFile;
    }
    if (restoredThisFile) restored += 1;
  }
  return restored;
}

export function rollbackEffectStrict(snap: EffectSnapshot, effects: FileEffect[], action: string): number {
  const restored = rollbackEffect(snap, effects);
  const residual = diffEffect(snap);
  if (residual.length > 0) {
    throw new Error(
      action + ' rollback incomplete after restoring ' + restored + ' file effect(s): ' +
        residual.map((eff) => eff.file + ':' + eff.change).join(', '),
    );
  }
  return restored;
}
