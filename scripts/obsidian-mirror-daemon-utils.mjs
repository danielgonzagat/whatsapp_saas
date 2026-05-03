import {
  existsSync,
  statSync,
  readFileSync,
  writeFileSync,
  renameSync,
  unlinkSync,
  mkdirSync,
  readdirSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join, relative, dirname, basename, extname } from 'node:path';

import {
  REPO_ROOT,
  MIRROR_ROOT,
  VAULT_ROOT,
  SOURCE_MIRROR_DIR,
  MANIFEST_PATH,
  MIRROR_DAEMON_LOCK_PATH,
  LOCK_ACQUIRE_TIMEOUT_MS,
  LOCK_STALE_MS,
  LOCK_POLL_MS,
  GRAPH_SETTINGS_PATH,
  WORKSPACE_GRAPH_SEARCH,
  MIRROR_FORMAT_VERSION,
  CODE_STATE_COLOR_GROUPS,
  SKIP_DIR_PATTERNS,
  SKIP_FILE_PATTERNS,
  SKIP_SECRET_PATTERNS,
  EXT_TO_LANG,
  LANG_BY_FILENAME,
} from './obsidian-mirror-daemon-constants.mjs';

// ── Module-level state ──────────────────────────────────────────────────────

let gitDirtySourcesCache = null;
let gitLocalCommitSourcesCache = null;

// ── Logging & System ────────────────────────────────────────────────────────

export function log(level, ...args) {
  const ts = new Date().toISOString().slice(11, 23);
  const prefix =
    level === 'ERR'
      ? `\x1b[31m[${ts} ERR]\x1b[0m`
      : level === 'WARN'
        ? `\x1b[33m[${ts} WARN]\x1b[0m`
        : level === 'OK'
          ? `\x1b[32m[${ts} OK]\x1b[0m`
          : `\x1b[2m[${ts}]\x1b[0m`;
  console.log(prefix, ...args);
}

export function sleepSync(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    // intentionally busy wait to keep lock acquisition lightweight and predictable
  }
}

// ── Lock Management ─────────────────────────────────────────────────────────

export function readMirrorLock() {
  try {
    return JSON.parse(readFileSync(MIRROR_DAEMON_LOCK_PATH, 'utf8'));
  } catch {
    return null;
  }
}

export function isMirrorLockStale(lock) {
  if (!lock) {
    return true;
  }
  const marker = lock.updatedAt || lock.heartbeatAt || lock.startedAt;
  if (!marker) {
    return false;
  }
  const markerTs = new Date(marker).getTime();
  if (!Number.isFinite(markerTs)) {
    return false;
  }
  return Date.now() - markerTs > LOCK_STALE_MS;
}

export function acquireMirrorLock(context) {
  const token = {
    pid: process.pid,
    context,
    startedAt: new Date().toISOString(),
  };
  const timeoutAt = Date.now() + LOCK_ACQUIRE_TIMEOUT_MS;
  while (true) {
    try {
      writeFileSync(
        MIRROR_DAEMON_LOCK_PATH,
        JSON.stringify({ ...token, heartbeatAt: new Date().toISOString() }) + '\n',
        { flag: 'wx' },
      );
      return token;
    } catch (error) {
      if (error.code !== 'EEXIST') {
        throw error;
      }

      const current = readMirrorLock();
      if (isMirrorLockStale(current)) {
        try {
          unlinkSync(MIRROR_DAEMON_LOCK_PATH);
          log('WARN', `Removed stale mirror lock (${MIRROR_DAEMON_LOCK_PATH}).`);
        } catch {
          // race to remove lock is expected under contention
        }
      } else if (Date.now() >= timeoutAt) {
        throw new Error(
          `Timeout waiting for obsidian mirror lock at ${MIRROR_DAEMON_LOCK_PATH}: held by pid=${current?.pid || 'unknown'} context=${current?.context || 'unknown'}`,
        );
      } else {
        sleepSync(LOCK_POLL_MS);
      }
    }
  }
}

export function releaseMirrorLock(token) {
  const current = readMirrorLock();
  if (!current) {
    return;
  }
  if (current.pid === token.pid && current.startedAt === token.startedAt) {
    try {
      unlinkSync(MIRROR_DAEMON_LOCK_PATH);
    } catch {
      // best-effort release on best-effort path
    }
  }
}

export function withMirrorLock(context, action) {
  const token = acquireMirrorLock(context);
  try {
    return action();
  } finally {
    releaseMirrorLock(token);
  }
}

// ── Hashing & Paths ─────────────────────────────────────────────────────────

export function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

export function normalizePath(path) {
  return path.split('\\').join('/');
}

// ── Git State ───────────────────────────────────────────────────────────────

function readNullDelimitedGitOutput(args) {
  try {
    const output = execFileSync('git', ['-C', REPO_ROOT, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return output.split('\0').filter(Boolean);
  } catch {
    return [];
  }
}

export function readGitDirtySources(force = false) {
  if (gitDirtySourcesCache && !force) {
    return gitDirtySourcesCache;
  }

  const dirty = new Set();
  for (const rel of readNullDelimitedGitOutput(['diff', '--name-only', '-z', 'HEAD', '--'])) {
    dirty.add(normalizePath(rel));
  }
  for (const rel of readNullDelimitedGitOutput([
    'ls-files',
    '--others',
    '--exclude-standard',
    '-z',
  ])) {
    dirty.add(normalizePath(rel));
  }

  gitDirtySourcesCache = dirty;
  return dirty;
}

export function readGitLocalCommitSources(force = false) {
  if (gitLocalCommitSourcesCache && !force) {
    return gitLocalCommitSourcesCache;
  }

  const localCommitSources = new Set(
    readNullDelimitedGitOutput(['diff', '--name-only', '-z', '@{upstream}..HEAD', '--']).map(
      normalizePath,
    ),
  );

  gitLocalCommitSourcesCache = localCommitSources;
  return localCommitSources;
}

export function gitDirtySignature(
  dirtySources = readGitDirtySources(),
  localCommitSources = readGitLocalCommitSources(),
) {
  return [
    ...[...dirtySources].sort(),
    '\0--local-commit--\0',
    ...[...localCommitSources].sort(),
  ].join('\0');
}

export function gitStateForSource(sourcePath) {
  const rel = normalizePath(relative(REPO_ROOT, sourcePath));
  const dirty = readGitDirtySources().has(rel);
  const localCommit = !dirty && readGitLocalCommitSources().has(rel);
  const workspaceState = dirty ? 'DIRTY' : localCommit ? 'LOCAL_COMMIT' : 'NO_LOCAL_DIFF';
  return {
    dirty,
    localCommit,
    rel,
    workspaceState,
  };
}

// ── Graph Settings ──────────────────────────────────────────────────────────

export function ensureGraphLensSettings() {
  if (!existsSync(GRAPH_SETTINGS_PATH)) {
    return false;
  }

  let currentSettings;
  try {
    currentSettings = JSON.parse(readFileSync(GRAPH_SETTINGS_PATH, 'utf8'));
  } catch (e) {
    log('WARN', 'Cannot read Obsidian graph settings:', e.message);
    return false;
  }

  const graphSettings = {
    ...currentSettings,
    search: WORKSPACE_GRAPH_SEARCH,
    showOrphans: true,
    hideUnresolved: true,
    colorGroups: CODE_STATE_COLOR_GROUPS,
  };
  const next = `${JSON.stringify(graphSettings, null, 2)}\n`;
  const current = `${JSON.stringify(currentSettings, null, 2)}\n`;
  if (current === next) {
    return false;
  }

  const tmp = `${GRAPH_SETTINGS_PATH}.tmp`;
  writeFileSync(tmp, next, 'utf8');
  renameSync(tmp, GRAPH_SETTINGS_PATH);
  return true;
}

// ── Obsidian Links ──────────────────────────────────────────────────────────

export function obsidianLinkTarget(filePath) {
  const rel = normalizePath(relative(VAULT_ROOT, filePath));
  return rel.endsWith('.md') ? rel.slice(0, -3) : rel;
}

export function obsidianLink(targetPath, alias) {
  const safeAlias = String(alias || basename(targetPath)).replace(/[\[\]|]/g, '-');
  return `[[${obsidianLinkTarget(targetPath)}|${safeAlias}]]`;
}

// ── Language Detection ──────────────────────────────────────────────────────

export function detectLanguage(filePath) {
  const name = basename(filePath);
  if (LANG_BY_FILENAME[name]) {
    return LANG_BY_FILENAME[name];
  }

  const ext = extname(name).toLowerCase();
  if (EXT_TO_LANG[ext]) {
    return EXT_TO_LANG[ext];
  }

  // Multi-extension fallback
  if (name.endsWith('.d.ts')) {
    return 'typescript';
  }
  if (name.endsWith('.test.ts') || name.endsWith('.spec.ts')) {
    return 'typescript';
  }
  if (name.endsWith('.test.tsx') || name.endsWith('.spec.tsx')) {
    return 'typescript tsx';
  }

  return '';
}

// ── Skip / Filter ───────────────────────────────────────────────────────────

export function shouldSkipDir(dirName, fullPath) {
  const rel = relative(REPO_ROOT, fullPath) || dirName;
  for (const p of SKIP_DIR_PATTERNS) {
    if (p.test(rel) || p.test(dirName)) {
      return true;
    }
  }
  return false;
}

export function shouldSkipFile(fileName, fullPath) {
  const rel = relative(REPO_ROOT, fullPath) || fileName;

  for (const p of SKIP_SECRET_PATTERNS) {
    if (p.test(rel) || p.test(fileName)) {
      return true;
    }
  }
  for (const p of SKIP_FILE_PATTERNS) {
    if (p.test(rel) || p.test(fileName)) return true;
  }
  return false;
}

export function isCandidateSourcePath(fullPath) {
  const rel = relative(REPO_ROOT, fullPath);
  if (rel.startsWith('..') || rel === '') {
    return false;
  }
  if (shouldSkipFile(basename(fullPath), fullPath)) {
    return false;
  }

  const parts = normalizePath(rel).split('/');
  for (let i = 0; i < parts.length - 1; i += 1) {
    if (shouldSkipDir(parts[i], join(REPO_ROOT, ...parts.slice(0, i + 1)))) {
      return false;
    }
  }
  return true;
}

export function isMirrorableSourceFile(fullPath) {
  if (!isCandidateSourcePath(fullPath)) {
    return false;
  }
  try {
    const st = statSync(fullPath);
    return st.isFile();
  } catch {
    return false;
  }
}

// ── File System Helpers ─────────────────────────────────────────────────────

export function ensureDir(dirPath) {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Ensure the _source/ directory and manifest exist.
 * Returns the manifest object.
 * NOTE: Does NOT call persistManifestState to avoid circular import with indexes.
 */
export function ensureSourceDir() {
  ensureDir(SOURCE_MIRROR_DIR);
  if (!existsSync(MANIFEST_PATH)) {
    writeManifest({
      version: 2,
      generated: new Date().toISOString(),
      repo_root: REPO_ROOT,
      files: {},
    });
  }
  ensureGraphLensSettings();
  return readManifest();
}

export function readManifest() {
  try {
    if (existsSync(MANIFEST_PATH)) {
      return JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
    }
  } catch (e) {
    log('WARN', 'Manifest read error, reinitializing:', e.message);
  }
  return { version: 2, generated: new Date().toISOString(), repo_root: REPO_ROOT, files: {} };
}

export function writeManifest(data) {
  ensureDir(SOURCE_MIRROR_DIR);
  // Atomic write via temp + rename
  const tmp = MANIFEST_PATH + '.tmp';
  writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8');
  renameSync(tmp, MANIFEST_PATH);
}

// ── Path Mapping ──────────────────────────────────────────────────────────

export function mirrorVisibleSegment(segment) {
  return segment.startsWith('.') ? `_dot_${segment.slice(1)}` : segment;
}

export function sourceRelToMirrorRel(sourceRel) {
  return normalizePath(sourceRel).split('/').map(mirrorVisibleSegment).join('/');
}

export function mirrorVisibleSegmentToSource(segment) {
  return segment.startsWith('_dot_') ? `.${segment.slice(5)}` : segment;
}

export function mirrorRelToSourceRel(mirrorRel) {
  return normalizePath(mirrorRel).split('/').map(mirrorVisibleSegmentToSource).join('/');
}

export function sourceToMirrorPath(sourceAbs) {
  const rel = sourceRelToMirrorRel(relative(REPO_ROOT, sourceAbs));
  return join(SOURCE_MIRROR_DIR, rel + '.md');
}

export function mirrorToSourcePath(mirrorPath) {
  let rel = relative(SOURCE_MIRROR_DIR, mirrorPath);
  if (rel.endsWith('.md')) {
    rel = rel.slice(0, -3);
  }
  return join(REPO_ROOT, mirrorRelToSourceRel(rel));
}

// ── Source File Scanning ────────────────────────────────────────────────────

export function scanDirectory(dir, entries) {
  try {
    const items = readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
      const full = join(dir, item.name);
      if (item.isDirectory()) {
        if (shouldSkipDir(item.name, full)) {
          continue;
        }
        scanDirectory(full, entries);
      } else if (item.isFile()) {
        if (shouldSkipFile(item.name, full)) {
          continue;
        }
        entries.push(full);
      }
    }
  } catch (e) {
    log('WARN', `Cannot read directory ${relative(REPO_ROOT, dir)}:`, e.message);
  }
}

export function collectAllSourceFiles() {
  const entries = [];

  if (existsSync(REPO_ROOT) && statSync(REPO_ROOT).isDirectory()) {
    scanDirectory(REPO_ROOT, entries);
  }

  return entries.sort();
}
