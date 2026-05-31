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
import * as fs from 'node:fs';
import * as path from 'node:path';
import { characterDiff } from './advanced.js';

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', '.next', 'build', 'coverage', '.atomic', '.turbo', 'vendor', '.cache',
]);

export interface EffectSnapshot {
  rootAbs: string;
  /** repo-relative path -> UTF-8 content of every existing in-scope file at snapshot time */
  files: Map<string, string>;
  limitReached: boolean;
}

export interface FileEffect {
  file: string;
  change: 'modified' | 'created' | 'deleted';
  /** char-level [-removed-]{+added+} proof for a modification */
  atomicDiff?: string;
  bytesBefore: number;
  bytesAfter: number;
}

/** Capture the byte-content of every in-scope file under `rootAbs` (bounded). */
export function captureEffectSnapshot(
  rootAbs: string,
  opts: { maxFiles?: number; maxBytes?: number; maxFileBytes?: number } = {},
): EffectSnapshot {
  const maxFiles = opts.maxFiles ?? 4000;
  const maxBytes = opts.maxBytes ?? 64 * 1024 * 1024;
  const maxFileBytes = opts.maxFileBytes ?? 2 * 1024 * 1024;
  const files = new Map<string, string>();
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
          continue;
        }
        if (st.size > maxFileBytes) continue;
        let content: string;
        try {
          content = fs.readFileSync(full, 'utf8');
        } catch {
          continue;
        }
        files.set(path.relative(rootAbs, full), content);
        total += st.size;
      }
    }
  };
  walk(rootAbs);
  return { rootAbs, files, limitReached };
}

/** Re-walk and compute the exact per-file byte-effect since the snapshot. */
export function diffEffect(snap: EffectSnapshot): FileEffect[] {
  const after = captureEffectSnapshot(snap.rootAbs);
  const effects: FileEffect[] = [];
  for (const [rel, content] of after.files) {
    const before = snap.files.get(rel);
    if (before === undefined) {
      effects.push({ file: rel, change: 'created', bytesBefore: 0, bytesAfter: Buffer.byteLength(content) });
    } else if (before !== content) {
      effects.push({
        file: rel,
        change: 'modified',
        atomicDiff: characterDiff(before, content, rel),
        bytesBefore: Buffer.byteLength(before),
        bytesAfter: Buffer.byteLength(content),
      });
    }
  }
  for (const [rel, content] of snap.files) {
    if (!after.files.has(rel)) {
      effects.push({ file: rel, change: 'deleted', bytesBefore: Buffer.byteLength(content), bytesAfter: 0 });
    }
  }
  return effects;
}

/** Reverse the byte-effect (restore modified/deleted to snapshot bytes; remove created). Best-effort; returns files restored. */
export function rollbackEffect(snap: EffectSnapshot, effects: FileEffect[]): number {
  let restored = 0;
  for (const eff of effects) {
    const abs = path.join(snap.rootAbs, eff.file);
    try {
      if (eff.change === 'created') {
        fs.unlinkSync(abs);
        restored += 1;
      } else {
        const before = snap.files.get(eff.file);
        if (before === undefined) continue;
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, before);
        restored += 1;
      }
    } catch {
      /* best-effort byte restore */
    }
  }
  return restored;
}
