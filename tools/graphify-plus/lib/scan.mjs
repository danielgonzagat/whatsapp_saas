// tools/graphify-plus/lib/scan.mjs — shared filesystem scan helpers.
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

const DEFAULT_IGNORE = new Set([
  'node_modules',
  'dist',
  '.next',
  'build',
  '.git',
  'coverage',
  '.husky',
  '.cache',
  'graphify-out',
  '.claude',
  '.codacy',
  'test-results',
  'playwright-report',
]);

/** Recursive walk of {root} yielding absolute paths of files matching {filter}. */
export async function* walk(root, filter = () => true, ignore = DEFAULT_IGNORE) {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (ignore.has(entry.name) || entry.name.startsWith('.')) continue;
    const full = join(root, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full, filter, ignore);
    } else if (entry.isFile() && filter(full, entry.name)) {
      yield full;
    }
  }
}

/** Collect all paths under {root} matching {filter}. */
export async function collect(root, filter, ignore) {
  const out = [];
  for await (const p of walk(root, filter, ignore)) out.push(p);
  return out;
}

/** Read file with size cap (default 2 MB) to avoid OOM on huge generated files. */
export async function readCapped(file, capBytes = 2 * 1024 * 1024) {
  const s = await stat(file);
  if (s.size > capBytes) return null;
  return readFile(file, 'utf8');
}

/** Repo-relative path with forward slashes. */
export function rel(file, root) {
  return relative(root, file).split(sep).join('/');
}
