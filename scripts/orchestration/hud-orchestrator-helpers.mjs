import { createHash } from 'node:crypto';
import { readdirSync, statSync, writeFileSync, unlinkSync } from 'node:fs';
import { resolve, join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(process.env.KLOEL_REPO_ROOT || resolve(__dirname, '..', '..'));
const PID_FILE = '/tmp/kloel-hud-orchestrator.pid';
const WATCH_FILE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.mts',
  '.mjs',
  '.js',
  '.jsx',
  '.json',
  '.prisma',
  '.yml',
  '.yaml',
  '.md',
  '.css',
  '.scss',
  '.html',
]);
const IGNORE_SEGMENTS = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.next',
  '.obsidian',
]);

// Helpers extracted from hud-orchestrator
export function hashSourceTree() {
  const hash = createHash('sha256');
  const files = [];
  const stack = [REPO_ROOT];

  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        if (!IGNORE_SEGMENTS.has(e.name)) {
          stack.push(p);
        }
        continue;
      }
      if (e.isFile()) {
        const ext = p.slice(p.lastIndexOf('.')).toLowerCase();
        if (WATCH_FILE_EXTENSIONS.has(ext)) {
          const rel = relative(REPO_ROOT, p);
          files.push(rel);
        }
      }
    }
  }

  files.sort();

  for (const rel of files) {
    const abs = join(REPO_ROOT, rel);
    try {
      const s = statSync(abs);
      hash.update(`${rel}:${s.mtimeMs}:${s.size}\n`);
    } catch {
      hash.update(`${rel}:missing\n`);
    }
  }

  return hash.digest('hex');
}

export function writePid() {
  writeFileSync(PID_FILE, String(process.pid), 'utf8');
}

export function removePid() {
  try {
    unlinkSync(PID_FILE);
  } catch {
    // ignore
  }
}

export function handleExit() {
  removePid();
}

