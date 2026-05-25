// Thin filesystem reader with safety rails: stays inside workspaceRoot, caps
// read size, returns line-numbered slices.

import { existsSync, readFileSync, statSync, readdirSync } from 'node:fs';
import { join, normalize, relative, resolve, sep, extname } from 'node:path';

const MAX_FILE_BYTES = 2 * 1024 * 1024;

function ensureInside(workspaceRoot, target) {
  const abs = resolve(target);
  const root = resolve(workspaceRoot);
  if (abs !== root && !abs.startsWith(root + sep)) {
    throw new Error(`path escapes workspace root: ${target}`);
  }
  return abs;
}

function toRelative(workspaceRoot, abs) {
  return relative(resolve(workspaceRoot), abs).split(sep).join('/');
}

export function createFilesystemAdapter({ workspaceRoot }) {
  function readSlice(filePath, { fromLine = 1, toLine = null, maxLines = 400 } = {}) {
    const abs = ensureInside(workspaceRoot, filePath);
    if (!existsSync(abs)) return { ok: false, error: `not found: ${filePath}` };
    const st = statSync(abs);
    if (st.size > MAX_FILE_BYTES) {
      return { ok: false, error: `file too large (${st.size} bytes): ${filePath}` };
    }
    const text = readFileSync(abs, 'utf8');
    const lines = text.split(/\r?\n/);
    const start = Math.max(1, fromLine | 0);
    let end = toLine ? Math.min(lines.length, toLine | 0) : lines.length;
    if (end - start + 1 > maxLines) end = start + maxLines - 1;
    const sliced = lines.slice(start - 1, end).map((line, i) => `${String(start + i).padStart(5)}│ ${line}`);
    return {
      ok: true,
      file: toRelative(workspaceRoot, abs),
      totalLines: lines.length,
      fromLine: start,
      toLine: end,
      content: sliced.join('\n'),
    };
  }

  function readWindowAround(filePath, line, { radius = 25, maxLines = 200 } = {}) {
    const from = Math.max(1, (line | 0) - radius);
    const to = (line | 0) + radius;
    return readSlice(filePath, { fromLine: from, toLine: to, maxLines });
  }

  function exists(filePath) {
    try {
      const abs = ensureInside(workspaceRoot, filePath);
      return existsSync(abs);
    } catch {
      return false;
    }
  }

  function listDir(filePath) {
    const abs = ensureInside(workspaceRoot, filePath);
    if (!existsSync(abs)) return { ok: false, error: 'not found' };
    const st = statSync(abs);
    if (!st.isDirectory()) return { ok: false, error: 'not a directory' };
    const entries = readdirSync(abs, { withFileTypes: true })
      .map((d) => ({ name: d.name, dir: d.isDirectory(), ext: d.isFile() ? extname(d.name) : null }))
      .sort((a, b) => (a.dir === b.dir ? a.name.localeCompare(b.name) : a.dir ? -1 : 1));
    return { ok: true, entries };
  }

  function readWhole(filePath, { capBytes = MAX_FILE_BYTES } = {}) {
    const abs = ensureInside(workspaceRoot, filePath);
    if (!existsSync(abs)) return { ok: false, error: `not found: ${filePath}` };
    const st = statSync(abs);
    if (st.size > capBytes) return { ok: false, error: `too large: ${st.size}` };
    return { ok: true, content: readFileSync(abs, 'utf8'), bytes: st.size };
  }

  return { readSlice, readWindowAround, exists, listDir, readWhole, toRelative: (p) => toRelative(workspaceRoot, p) };
}
