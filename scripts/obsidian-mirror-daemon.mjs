#!/usr/bin/env node

import {
  watch,
  existsSync,
  statSync,
  readFileSync,
  writeFileSync,
  renameSync,
  unlinkSync,
  mkdirSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative, dirname, basename, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(process.env.KLOEL_REPO_ROOT || '/Users/danielpenin/whatsapp_saas');
const MIRROR_ROOT = resolve(
  process.env.KLOEL_MIRROR_ROOT ||
    '/Users/danielpenin/Documents/Obsidian Vault/Kloel/99 - Espelho do Codigo',
);
const MANIFEST_PATH = join(MIRROR_ROOT, 'obsidian-mirror-manifest.json');
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const DEBOUNCE_MS = 500;

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  '.turbo',
  'coverage',
  '__snapshots__',
  '.cache',
  '.nx',
]);

const SKIP_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.bmp',
  '.ico',
  '.webp',
  '.svg',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.otf',
  '.mp3',
  '.mp4',
  '.wav',
  '.ogg',
  '.webm',
  '.avi',
  '.mov',
  '.pdf',
  '.zip',
  '.tar',
  '.gz',
  '.bz2',
  '.xz',
  '.7z',
  '.rar',
  '.exe',
  '.dll',
  '.so',
  '.dylib',
  '.wasm',
  '.class',
  '.pyc',
  '.map',
  '.lock',
  '.db',
  '.sqlite',
  '.sqlite3',
]);

const SECRET_PATTERNS = /\b(secret|token|password|credential|private.?key)\b/i;

let manifest = { last_rebuild: null, total_mirrored: 0, files: {} };

// ---------------------------------------------------------------------------
// Path mapping
// ---------------------------------------------------------------------------

const PATH_MAPPINGS = [
  { prefix: 'backend/prisma/', category: 'Database' },
  { prefix: '.github/workflows/', category: 'CI-CD' },
  { prefix: 'backend/src/', category: 'Backend' },
  { prefix: 'frontend/src/app/', category: 'Frontend' },
  { prefix: 'worker/', category: 'Worker' },
  { prefix: 'scripts/', category: 'Scripts' },
];

function mapSourceToMirror(relPath) {
  for (const { prefix, category } of PATH_MAPPINGS) {
    if (relPath.startsWith(prefix)) {
      const remainder = relPath.slice(prefix.length);
      return join(MIRROR_ROOT, category, remainder.replace(/\.[^.]+$/, '.md'));
    }
  }
  return join(MIRROR_ROOT, 'Root', relPath.replace(/\.[^.]+$/, '.md'));
}

// ---------------------------------------------------------------------------
// File filtering
// ---------------------------------------------------------------------------

function shouldMirror(absPath) {
  const rel = relative(REPO_ROOT, absPath);
  if (rel.startsWith('..')) return false;

  const parts = rel.split('/');
  for (const part of parts) {
    if (SKIP_DIRS.has(part)) return false;
  }

  const name = basename(absPath);
  const ext = extname(name).toLowerCase();

  if (SKIP_EXTENSIONS.has(ext)) return false;
  if (name.endsWith('.d.ts')) return false;
  if (name.endsWith('.min.js') || name.endsWith('.min.css')) return false;
  if (SECRET_PATTERNS.test(name)) return false;
  if (name === '.env') return false;

  if (name.startsWith('.env') && name !== '.env.example' && name !== '.env.sample') {
    return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// Language detection
// ---------------------------------------------------------------------------

const LANG_MAP = {
  '.ts': 'typescript',
  '.tsx': 'tsx',
  '.js': 'javascript',
  '.jsx': 'jsx',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.json': 'json',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.toml': 'toml',
  '.env': 'ini',
  '.prisma': 'prisma',
  '.sql': 'sql',
  '.css': 'css',
  '.scss': 'scss',
  '.less': 'less',
  '.html': 'html',
  '.htm': 'html',
  '.md': 'markdown',
  '.mdx': 'mdx',
  '.graphql': 'graphql',
  '.gql': 'graphql',
  '.proto': 'protobuf',
  '.sh': 'bash',
  '.bash': 'bash',
  '.zsh': 'bash',
  '.py': 'python',
  '.rb': 'ruby',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
  '.kt': 'kotlin',
  '.kts': 'kotlin',
  '.swift': 'swift',
  '.c': 'c',
  '.cpp': 'cpp',
  '.cc': 'cpp',
  '.cxx': 'cpp',
  '.h': 'c',
  '.hpp': 'cpp',
  '.hh': 'cpp',
  '.hxx': 'cpp',
  '.xml': 'xml',
  '.svg': 'xml',
  '.txt': '',
  '.cfg': 'ini',
  '.conf': 'ini',
  '.ini': 'ini',
  '.editorconfig': 'ini',
};

const FILENAME_LANG = {
  dockerfile: 'dockerfile',
  makefile: 'makefile',
  '.gitignore': 'gitignore',
  '.dockerignore': 'gitignore',
  '.eslintrc': 'json',
  '.prettierrc': 'json',
  '.npmrc': 'ini',
};

function getLang(absPath) {
  const name = basename(absPath).toLowerCase();
  if (FILENAME_LANG[name]) return FILENAME_LANG[name];
  if (name.startsWith('dockerfile')) return 'dockerfile';
  return LANG_MAP[extname(absPath).toLowerCase()] || '';
}

// ---------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------

function loadManifest() {
  try {
    if (existsSync(MANIFEST_PATH)) {
      manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'));
      manifest.files ??= {};
      manifest.total_mirrored = Object.keys(manifest.files).length;
    }
  } catch {
    manifest = { last_rebuild: null, total_mirrored: 0, files: {} };
  }
}

function saveManifest() {
  manifest.total_mirrored = Object.keys(manifest.files).length;
  mkdirSync(dirname(MANIFEST_PATH), { recursive: true });
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf-8');
}

function updateManifest(relPath, hash, mirrorAbsPath) {
  manifest.files[relPath] = {
    hash,
    mirror_path: relative(MIRROR_ROOT, mirrorAbsPath),
    mirrored_at: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    size: statSync(join(REPO_ROOT, relPath)).size,
  };
}

function removeFromManifest(relPath) {
  delete manifest.files[relPath];
}

// ---------------------------------------------------------------------------
// Atomic write
// ---------------------------------------------------------------------------

function atomicWrite(destPath, content) {
  const tmp = destPath + '.tmp';
  writeFileSync(tmp, content, 'utf-8');
  renameSync(tmp, destPath);
}

// ---------------------------------------------------------------------------
// Mirror a single file
// ---------------------------------------------------------------------------

function mirrorFile(absSourcePath) {
  const relPath = relative(REPO_ROOT, absSourcePath);
  const mirrorPath = mapSourceToMirror(relPath);

  let content;
  try {
    content = readFileSync(absSourcePath, 'utf-8');
  } catch {
    return;
  }

  const hash = createHash('sha256').update(content).digest('hex');
  const lang = getLang(absSourcePath);
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

  const md = [
    '---',
    'tipo: espelho',
    'status: SINCRONIZADO',
    `source: ${relPath}`,
    `source_hash: ${hash}`,
    `mirrored_at: ${now}`,
    '---',
    '',
    lang ? `\`\`\`${lang}` : '```',
    content,
    '```',
    '',
  ].join('\n');

  mkdirSync(dirname(mirrorPath), { recursive: true });
  atomicWrite(mirrorPath, md);
  updateManifest(relPath, hash, mirrorPath);

  return { relPath, mirrorPath };
}

// ---------------------------------------------------------------------------
// Delete mirror
// ---------------------------------------------------------------------------

function deleteMirror(absSourcePath) {
  const relPath = relative(REPO_ROOT, absSourcePath);
  const mirrorPath = mapSourceToMirror(relPath);

  if (existsSync(mirrorPath)) {
    unlinkSync(mirrorPath);
  }
  removeFromManifest(relPath);
}

// ---------------------------------------------------------------------------
// Walk repo and mirror all valid files
// ---------------------------------------------------------------------------

function walkAndMirror(dir, onProgress) {
  let count = 0;
  const stack = [dir];

  while (stack.length > 0) {
    const current = stack.pop();
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const full = join(current, entry.name);

      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        if (entry.name.startsWith('.')) {
          if (entry.name === '.github') {
            stack.push(full);
            continue;
          }
          continue;
        }
        stack.push(full);
        continue;
      }

      if (!shouldMirror(full)) continue;

      let stat;
      try {
        stat = statSync(full);
      } catch {
        continue;
      }
      if (stat.size > MAX_FILE_SIZE) {
        console.warn(
          `[obsidian-mirror] Skipping large file (${(stat.size / 1024 / 1024).toFixed(1)}MB): ${relative(REPO_ROOT, full)}`,
        );
        continue;
      }

      const result = mirrorFile(full);
      if (result) {
        count++;
        onProgress?.(result.relPath);
      }
    }
  }

  return count;
}

// ---------------------------------------------------------------------------
// Rebuild
// ---------------------------------------------------------------------------

function rebuild() {
  console.log('[obsidian-mirror] Full rebuild...');

  if (existsSync(MIRROR_ROOT)) {
    const entries = readdirSync(MIRROR_ROOT, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(MIRROR_ROOT, entry.name);
      try {
        rmSync(full, { recursive: true });
      } catch {
        /* best effort */
      }
    }
  }

  manifest = { last_rebuild: null, total_mirrored: 0, files: {} };

  const count = walkAndMirror(REPO_ROOT, (relPath) => {
    console.log(`  [mirrored] ${relPath}`);
  });

  manifest.last_rebuild = new Date().toISOString();
  saveManifest();

  console.log(`[obsidian-mirror] Rebuild complete. ${count} files mirrored.`);
}

// ---------------------------------------------------------------------------
// Incremental mirror on watch start
// ---------------------------------------------------------------------------

function mirrorUnmirroredFiles() {
  let count = 0;
  const stack = [REPO_ROOT];

  while (stack.length > 0) {
    const current = stack.pop();
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const full = join(current, entry.name);

      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        if (entry.name.startsWith('.')) {
          if (entry.name === '.github') {
            stack.push(full);
            continue;
          }
          continue;
        }
        stack.push(full);
        continue;
      }

      if (!shouldMirror(full)) continue;
      const rel = relative(REPO_ROOT, full);
      if (manifest.files[rel]) continue;

      let stat;
      try {
        stat = statSync(full);
      } catch {
        continue;
      }
      if (stat.size > MAX_FILE_SIZE) continue;

      const result = mirrorFile(full);
      if (result) count++;
    }
  }

  if (count > 0) {
    saveManifest();
    console.log(`[obsidian-mirror] Mirrored ${count} previously untracked files.`);
  }
}

// ---------------------------------------------------------------------------
// Watch
// ---------------------------------------------------------------------------

function startWatch() {
  loadManifest();
  console.log(`[obsidian-mirror] Watching ${REPO_ROOT}`);

  mkdirSync(MIRROR_ROOT, { recursive: true });

  mirrorUnmirroredFiles();

  const pending = new Map();

  function flush(filePath, action) {
    try {
      if (action === 'delete') {
        deleteMirror(filePath);
      } else {
        if (!existsSync(filePath)) return;
        const stat = statSync(filePath);
        if (stat.isDirectory()) return;
        if (stat.size > MAX_FILE_SIZE) {
          console.warn(`[obsidian-mirror] Skipping large file: ${relative(REPO_ROOT, filePath)}`);
          return;
        }
        const result = mirrorFile(filePath);
        if (result) {
          console.log(
            `[obsidian-mirror] ${action === 'add' ? 'Added' : 'Updated'}: ${result.relPath}`,
          );
        }
      }
      saveManifest();
    } catch (err) {
      console.error(`[obsidian-mirror] Error processing ${filePath}:`, err.message);
    }
  }

  function schedule(filePath, action) {
    const existing = pending.get(filePath);
    if (existing) clearTimeout(existing.timer);

    const timer = setTimeout(() => {
      pending.delete(filePath);
      flush(filePath, action);
    }, DEBOUNCE_MS);

    pending.set(filePath, { action, timer });
  }

  const watcher = watch(REPO_ROOT, { recursive: true }, (eventType, filename) => {
    if (!filename) return;
    const filePath = join(REPO_ROOT, filename);

    if (!shouldMirror(filePath)) return;

    if (eventType === 'rename') {
      if (existsSync(filePath)) {
        schedule(filePath, 'add');
      } else {
        schedule(filePath, 'delete');
      }
    } else if (eventType === 'change') {
      schedule(filePath, 'change');
    }
  });

  process.on('SIGINT', () => {
    console.log('\n[obsidian-mirror] Shutting down...');
    for (const [, { timer }] of pending) clearTimeout(timer);
    watcher.close();
    saveManifest();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    watcher.close();
    saveManifest();
    process.exit(0);
  });

  process.stdin.resume();
}

// ---------------------------------------------------------------------------
// Validate
// ---------------------------------------------------------------------------

function validate() {
  loadManifest();
  const issues = [];

  for (const [relPath, entry] of Object.entries(manifest.files)) {
    const sourcePath = join(REPO_ROOT, relPath);

    if (!existsSync(sourcePath)) {
      issues.push({
        type: 'SOURCE_DELETED',
        file: relPath,
        detail: 'Source file no longer exists',
      });
      continue;
    }

    const mirrorPath = join(MIRROR_ROOT, entry.mirror_path);
    if (!existsSync(mirrorPath)) {
      issues.push({
        type: 'MIRROR_MISSING',
        file: relPath,
        detail: 'Mirror file missing from vault',
      });
      continue;
    }

    let content;
    try {
      content = readFileSync(sourcePath, 'utf-8');
    } catch {
      issues.push({ type: 'UNREADABLE', file: relPath, detail: 'Cannot read source' });
      continue;
    }

    const currentHash = createHash('sha256').update(content).digest('hex');
    if (currentHash !== entry.hash) {
      issues.push({
        type: 'HASH_MISMATCH',
        file: relPath,
        detail: `Mirror is stale (${entry.hash.slice(0, 12)}... vs ${currentHash.slice(0, 12)}...)`,
      });
    }
  }

  // Check for files in repo not in manifest
  const stack = [REPO_ROOT];
  while (stack.length > 0) {
    const current = stack.pop();
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        if (entry.name.startsWith('.')) {
          if (entry.name === '.github') {
            stack.push(full);
            continue;
          }
          continue;
        }
        stack.push(full);
        continue;
      }

      if (!shouldMirror(full)) continue;

      let stat;
      try {
        stat = statSync(full);
      } catch {
        continue;
      }
      if (stat.size > MAX_FILE_SIZE) continue;

      const rel = relative(REPO_ROOT, full);
      if (!manifest.files[rel]) {
        issues.push({
          type: 'UNMIRRORED',
          file: rel,
          detail: 'File exists in repo but not in mirror manifest',
        });
      }
    }
  }

  if (issues.length > 0) {
    console.log(`[obsidian-mirror] Validation found ${issues.length} issue(s):`);
    for (const issue of issues) {
      console.log(`  [${issue.type}] ${issue.file} — ${issue.detail}`);
    }
    console.log(`\nRun --rebuild to fix.`);
    process.exitCode = 1;
    return false;
  }

  console.log(
    `[obsidian-mirror] All ${manifest.total_mirrored} mirrors validated. No drift detected.`,
  );
  return true;
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

function status() {
  loadManifest();

  let synced = 0;
  let stale = 0;
  let missingSource = 0;
  let missingMirror = 0;

  for (const [relPath, entry] of Object.entries(manifest.files)) {
    const sourcePath = join(REPO_ROOT, relPath);

    if (!existsSync(sourcePath)) {
      missingSource++;
      continue;
    }

    const mirrorPath = join(MIRROR_ROOT, entry.mirror_path);
    if (!existsSync(mirrorPath)) {
      missingMirror++;
      continue;
    }

    let content;
    try {
      content = readFileSync(sourcePath, 'utf-8');
    } catch {
      stale++;
      continue;
    }

    const currentHash = createHash('sha256').update(content).digest('hex');
    if (currentHash === entry.hash) {
      synced++;
    } else {
      stale++;
    }
  }

  const total = manifest.total_mirrored;

  console.log('Obsidian Mirror Status');
  console.log('======================');
  console.log(`  Mirror root  : ${MIRROR_ROOT}`);
  console.log(`  Repo root    : ${REPO_ROOT}`);
  console.log(`  Last rebuild : ${manifest.last_rebuild ?? 'never'}`);
  console.log(`  Total files  : ${total}`);
  console.log(`  Synced       : ${synced}`);
  console.log(`  Stale        : ${stale}`);
  console.log(`  Missing src  : ${missingSource}`);
  console.log(`  Missing md   : ${missingMirror}`);
}

// ---------------------------------------------------------------------------
// CLI dispatch
// ---------------------------------------------------------------------------

function showUsage() {
  console.log(`Usage: node obsidian-mirror-daemon.mjs [--watch|--rebuild|--validate|--status]

Modes:
  --watch      Continuous file watching with live mirroring
  --rebuild    Full rebuild of all mirrors from source
  --validate   Check all mirrors for drift; exit non-zero on issues
  --status     Print mirror statistics

Environment:
  KLOEL_REPO_ROOT    Path to the repo root (default: ${REPO_ROOT})
  KLOEL_MIRROR_ROOT  Path to the Obsidian mirror directory (default: ${MIRROR_ROOT})`);
}

function main() {
  const mode = process.argv[2];

  loadManifest();

  switch (mode) {
    case '--watch':
      startWatch();
      break;
    case '--rebuild':
      rebuild();
      break;
    case '--validate':
      validate();
      break;
    case '--status':
      status();
      break;
    default:
      showUsage();
      process.exitCode = mode ? 1 : 0;
      break;
  }
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  main();
}

export {
  REPO_ROOT,
  MIRROR_ROOT,
  MANIFEST_PATH,
  mapSourceToMirror,
  shouldMirror,
  mirrorFile,
  deleteMirror,
  walkAndMirror,
  loadManifest,
  saveManifest,
  rebuild,
  startWatch,
  validate,
  status,
  manifest,
};
