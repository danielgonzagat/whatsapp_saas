#!/usr/bin/env node

/**
 * Obsidian Mirror Daemon — SAFE, non-destructive source-to-vault mirror.
 *
 * KEY RULE: Source mirrors go to `_source/` subdirectory.
 *           Enriched docs in the mirror root are NEVER deleted.
 *
 * MODES:
 *   --watch     Watch mode with debounce.
 *   --rebuild   Full rebuild (--force required for destructive).
 *   --validate  Compare hashes, report differences.
 *   --status    Show mirror summary.
 */

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
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join, relative, dirname, basename, extname, resolve } from 'node:path';

// ── Configuration ───────────────────────────────────────────────────────────

const REPO_ROOT = resolve(process.env.KLOEL_REPO_ROOT || '/Users/danielpenin/whatsapp_saas');
const MIRROR_ROOT = resolve(
  process.env.KLOEL_MIRROR_ROOT ||
    '/Users/danielpenin/Documents/Obsidian Vault/Kloel/99 - Espelho do Codigo',
);
const VAULT_ROOT = resolve(process.env.KLOEL_VAULT_ROOT || dirname(dirname(MIRROR_ROOT)));
const SOURCE_MIRROR_DIR = join(MIRROR_ROOT, '_source');
const MANIFEST_PATH = join(SOURCE_MIRROR_DIR, 'manifest.json');
const MIRROR_DAEMON_LOCK_PATH = join(REPO_ROOT, '.obsidian-mirror-daemon.lock');
const LOCK_ACQUIRE_TIMEOUT_MS = Number(process.env.KLOEL_MIRROR_LOCK_TIMEOUT_MS || '30000');
const LOCK_STALE_MS = Number(process.env.KLOEL_MIRROR_LOCK_STALE_MS || '120000');
const LOCK_POLL_MS = Number(process.env.KLOEL_MIRROR_LOCK_POLL_MS || '75');
const GRAPH_SETTINGS_PATH = join(VAULT_ROOT, '.obsidian', 'graph.json');
const WORKSPACE_GRAPH_SEARCH = '';
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const DEBOUNCE_MS = 250;
const GIT_STATE_POLL_MS = 3000;
const GRAPH_LENS_ENFORCE_MS = 2000;
const MIRROR_FORMAT_VERSION = 21;
const SOURCE_BODY_MIRROR_MAX_BYTES = Number(
  process.env.KLOEL_SOURCE_BODY_MIRROR_MAX_BYTES || String(Number.MAX_SAFE_INTEGER),
);
const GENERATED_PAGE_SIZE = Number(process.env.KLOEL_GRAPH_PAGE_SIZE || '120');
const DIRTY_WORKSPACE_TAG = 'workspace/dirty';
const DIRTY_WORKSPACE_QUERY = 'tag:#workspace/dirty';
const DIRTY_WORKSPACE_COLOR_RGB = 14724096; // Obsidian yellow #e0ac00.
const LOCAL_COMMIT_TAG = 'workspace/local-commit';
const LOCAL_COMMIT_QUERY = 'tag:#workspace/local-commit';
const METADATA_ONLY_TAG = 'mirror/metadata-only';
const METADATA_ONLY_QUERY = 'tag:#mirror/metadata-only';
const METADATA_ONLY_COLOR_RGB = 8421504; // Obsidian gray #808080.
const GRAPH_ACTION_REQUIRED_TAG = 'graph/action-required';
const GRAPH_ACTION_REQUIRED_QUERY = 'tag:#graph/action-required';
const GRAPH_ACTION_REQUIRED_COLOR_RGB = 16711680; // red.
const GRAPH_EVIDENCE_GAP_TAG = 'graph/evidence-gap';
const GRAPH_EVIDENCE_GAP_QUERY = 'tag:#graph/evidence-gap';
const GRAPH_EVIDENCE_GAP_COLOR_RGB = 16711935; // magenta.
const GRAPH_EFFECT_SECURITY_TAG = 'graph/effect-security';
const GRAPH_EFFECT_SECURITY_QUERY = 'tag:#graph/effect-security';
const GRAPH_EFFECT_SECURITY_COLOR_RGB = 10040524; // violet.
const GRAPH_EFFECT_ERROR_TAG = 'graph/effect-error';
const GRAPH_EFFECT_ERROR_QUERY = 'tag:#graph/effect-error';
const GRAPH_EFFECT_ERROR_COLOR_RGB = 16724736; // orange-red.
const GRAPH_EFFECT_ENTRYPOINT_TAG = 'graph/effect-entrypoint';
const GRAPH_EFFECT_ENTRYPOINT_QUERY = 'tag:#graph/effect-entrypoint';
const GRAPH_EFFECT_ENTRYPOINT_COLOR_RGB = 65280; // green.
const GRAPH_EFFECT_DATA_TAG = 'graph/effect-data';
const GRAPH_EFFECT_DATA_QUERY = 'tag:#graph/effect-data';
const GRAPH_EFFECT_DATA_COLOR_RGB = 255; // blue.
const GRAPH_EFFECT_NETWORK_TAG = 'graph/effect-network';
const GRAPH_EFFECT_NETWORK_QUERY = 'tag:#graph/effect-network';
const GRAPH_EFFECT_NETWORK_COLOR_RGB = 65535; // cyan.
const GRAPH_EFFECT_ASYNC_TAG = 'graph/effect-async';
const GRAPH_EFFECT_ASYNC_QUERY = 'tag:#graph/effect-async';
const GRAPH_EFFECT_ASYNC_COLOR_RGB = 5635925; // teal.
const GRAPH_EFFECT_STATE_TAG = 'graph/effect-state';
const GRAPH_EFFECT_STATE_QUERY = 'tag:#graph/effect-state';
const GRAPH_EFFECT_STATE_COLOR_RGB = 13789470; // pink.
const GRAPH_EFFECT_CONTRACT_TAG = 'graph/effect-contract';
const GRAPH_EFFECT_CONTRACT_QUERY = 'tag:#graph/effect-contract';
const GRAPH_EFFECT_CONTRACT_COLOR_RGB = 12632256; // silver.
const GRAPH_EFFECT_CONFIG_TAG = 'graph/effect-config';
const GRAPH_EFFECT_CONFIG_QUERY = 'tag:#graph/effect-config';
const GRAPH_EFFECT_CONFIG_COLOR_RGB = 11184810; // light gray.
const PULSE_MACHINE_TAG = 'source/pulse-machine';
const PULSE_MACHINE_QUERY = 'tag:#source/pulse-machine';
const PULSE_MACHINE_COLOR_RGB = 10040524; // violet.
const SIGNAL_STATIC_HIGH_TAG = 'signal/static-high';
const SIGNAL_STATIC_HIGH_QUERY = 'tag:#signal/static-high';
const SIGNAL_STATIC_HIGH_COLOR_RGB = 16711680; // red.
const SIGNAL_HOTSPOT_TAG = 'signal/hotspot';
const SIGNAL_HOTSPOT_QUERY = 'tag:#signal/hotspot';
const SIGNAL_HOTSPOT_COLOR_RGB = 16744192; // orange.
const SIGNAL_EXTERNAL_TAG = 'signal/external';
const SIGNAL_EXTERNAL_QUERY = 'tag:#signal/external';
const SIGNAL_EXTERNAL_COLOR_RGB = 65535; // cyan.
const GRAPH_RISK_CRITICAL_TAG = 'graph/risk-critical';
const GRAPH_RISK_CRITICAL_QUERY = 'tag:#graph/risk-critical';
const GRAPH_RISK_CRITICAL_COLOR_RGB = 16711680; // red.
const GRAPH_RISK_HIGH_TAG = 'graph/risk-high';
const GRAPH_RISK_HIGH_QUERY = 'tag:#graph/risk-high';
const GRAPH_RISK_HIGH_COLOR_RGB = 16744192; // orange.
const GRAPH_PROOF_TEST_TAG = 'graph/proof-test';
const GRAPH_PROOF_TEST_QUERY = 'tag:#graph/proof-test';
const GRAPH_PROOF_TEST_COLOR_RGB = 65280; // green.
const GRAPH_RUNTIME_API_TAG = 'graph/runtime-api';
const GRAPH_RUNTIME_API_QUERY = 'tag:#graph/runtime-api';
const GRAPH_RUNTIME_API_COLOR_RGB = 65535; // cyan.
const GRAPH_SURFACE_UI_TAG = 'graph/surface-ui';
const GRAPH_SURFACE_UI_QUERY = 'tag:#graph/surface-ui';
const GRAPH_SURFACE_UI_COLOR_RGB = 255; // blue.
const GRAPH_SURFACE_BACKEND_TAG = 'graph/surface-backend';
const GRAPH_SURFACE_BACKEND_QUERY = 'tag:#graph/surface-backend';
const GRAPH_SURFACE_BACKEND_COLOR_RGB = 6737151; // steel blue.
const GRAPH_SURFACE_WORKER_TAG = 'graph/surface-worker';
const GRAPH_SURFACE_WORKER_QUERY = 'tag:#graph/surface-worker';
const GRAPH_SURFACE_WORKER_COLOR_RGB = 5635925; // teal.
const GRAPH_SURFACE_SOURCE_TAG = 'graph/surface-source';
const GRAPH_SURFACE_SOURCE_QUERY = 'tag:#graph/surface-source';
const GRAPH_SURFACE_SOURCE_COLOR_RGB = 11184810; // light gray.
const GRAPH_GOVERNANCE_TAG = 'graph/governance';
const GRAPH_GOVERNANCE_QUERY = 'tag:#graph/governance';
const GRAPH_GOVERNANCE_COLOR_RGB = 10040524; // violet.
const GRAPH_ORPHAN_TAG = 'graph/orphan';
const GRAPH_ORPHAN_QUERY = 'tag:#graph/orphan';
const GRAPH_ORPHAN_COLOR_RGB = 16711935; // magenta.
const GRAPH_MOLECULE_TAG = 'graph/molecule';
const GRAPH_MOLECULE_QUERY = 'tag:#graph/molecule';
const GRAPH_MOLECULE_COLOR_RGB = 12632256; // silver.
const GRAPH_SECTOR_TAG = 'graph/sector';
const GIT_STATE_DIR = '_git';
const DIRTY_DELETED_DIR = join(GIT_STATE_DIR, 'dirty-deleted');
const MACHINE_DIR = '_machine';
const CAMERA_DIR = '_camera';
const OBRA_DIR = '_obra';
const CLUSTER_DIR = '_clusters';
const VISUAL_FACT_DIR = '_visual';

const CODE_STATE_COLOR_GROUPS = [
  { query: DIRTY_WORKSPACE_QUERY, color: { a: 1, rgb: DIRTY_WORKSPACE_COLOR_RGB } },
  { query: GRAPH_ACTION_REQUIRED_QUERY, color: { a: 1, rgb: GRAPH_ACTION_REQUIRED_COLOR_RGB } },
  { query: GRAPH_EVIDENCE_GAP_QUERY, color: { a: 1, rgb: GRAPH_EVIDENCE_GAP_COLOR_RGB } },
  { query: GRAPH_EFFECT_SECURITY_QUERY, color: { a: 1, rgb: GRAPH_EFFECT_SECURITY_COLOR_RGB } },
  { query: GRAPH_EFFECT_ERROR_QUERY, color: { a: 1, rgb: GRAPH_EFFECT_ERROR_COLOR_RGB } },
  { query: GRAPH_EFFECT_ENTRYPOINT_QUERY, color: { a: 1, rgb: GRAPH_EFFECT_ENTRYPOINT_COLOR_RGB } },
  { query: GRAPH_EFFECT_DATA_QUERY, color: { a: 1, rgb: GRAPH_EFFECT_DATA_COLOR_RGB } },
  { query: GRAPH_EFFECT_NETWORK_QUERY, color: { a: 1, rgb: GRAPH_EFFECT_NETWORK_COLOR_RGB } },
  { query: GRAPH_EFFECT_ASYNC_QUERY, color: { a: 1, rgb: GRAPH_EFFECT_ASYNC_COLOR_RGB } },
  { query: GRAPH_EFFECT_STATE_QUERY, color: { a: 1, rgb: GRAPH_EFFECT_STATE_COLOR_RGB } },
  { query: GRAPH_EFFECT_CONTRACT_QUERY, color: { a: 1, rgb: GRAPH_EFFECT_CONTRACT_COLOR_RGB } },
  { query: GRAPH_EFFECT_CONFIG_QUERY, color: { a: 1, rgb: GRAPH_EFFECT_CONFIG_COLOR_RGB } },
  { query: METADATA_ONLY_QUERY, color: { a: 1, rgb: METADATA_ONLY_COLOR_RGB } },
  { query: PULSE_MACHINE_QUERY, color: { a: 1, rgb: PULSE_MACHINE_COLOR_RGB } },
  { query: SIGNAL_STATIC_HIGH_QUERY, color: { a: 1, rgb: SIGNAL_STATIC_HIGH_COLOR_RGB } },
  { query: SIGNAL_HOTSPOT_QUERY, color: { a: 1, rgb: 14524637 } },
  { query: SIGNAL_EXTERNAL_QUERY, color: { a: 1, rgb: SIGNAL_EXTERNAL_COLOR_RGB } },
  { query: GRAPH_RISK_CRITICAL_QUERY, color: { a: 1, rgb: GRAPH_RISK_CRITICAL_COLOR_RGB } },
  { query: GRAPH_RISK_HIGH_QUERY, color: { a: 1, rgb: 16724787 } },
  { query: GRAPH_PROOF_TEST_QUERY, color: { a: 1, rgb: GRAPH_PROOF_TEST_COLOR_RGB } },
  { query: GRAPH_RUNTIME_API_QUERY, color: { a: 1, rgb: GRAPH_RUNTIME_API_COLOR_RGB } },
  { query: GRAPH_SURFACE_UI_QUERY, color: { a: 1, rgb: GRAPH_SURFACE_UI_COLOR_RGB } },
  { query: GRAPH_SURFACE_BACKEND_QUERY, color: { a: 1, rgb: GRAPH_SURFACE_BACKEND_COLOR_RGB } },
  { query: GRAPH_SURFACE_WORKER_QUERY, color: { a: 1, rgb: GRAPH_SURFACE_WORKER_COLOR_RGB } },
  { query: GRAPH_SURFACE_SOURCE_QUERY, color: { a: 1, rgb: GRAPH_SURFACE_SOURCE_COLOR_RGB } },
  { query: GRAPH_GOVERNANCE_QUERY, color: { a: 1, rgb: GRAPH_GOVERNANCE_COLOR_RGB } },
  { query: GRAPH_ORPHAN_QUERY, color: { a: 1, rgb: GRAPH_ORPHAN_COLOR_RGB } },
  { query: GRAPH_MOLECULE_QUERY, color: { a: 1, rgb: GRAPH_MOLECULE_COLOR_RGB } },
];

// ── Path Mappings ───────────────────────────────────────────────────────────

/** Directories to mirror from the repo root into _source/. */
const SOURCE_DIRECTORIES = [
  'backend',
  'frontend',
  'worker',
  'scripts',
  '.github',
  'docs',
  'prisma',
  'nginx',
  'ops',
  'e2e',
];

/** Root-level files eligible for mirroring. Supports glob-like wildcards. */
const ROOT_FILE_PATTERNS = [
  { pattern: /^package\.json$/, target: 'package.json' },
  { pattern: /^pnpm-lock\.yaml$/, target: 'pnpm-lock.yaml' },
  { pattern: /^pnpm-workspace\.yaml$/, target: 'pnpm-workspace.yaml' },
  { pattern: /^tsconfig(\.\w+)?\.json$/, target: null }, // keep original name
  { pattern: /^\.env\.example$/, target: '.env.example' },
  { pattern: /^docker-compose(\.\w+)?\.ya?ml$/, target: null },
  { pattern: /^Dockerfile(\.\w+)?$/, target: null },
  { pattern: /^\.eslintrc(\.\w+)?$/ },
  { pattern: /^eslint\.config\.\w+$/ },
  { pattern: /^\.prettierrc(\.\w+)?$/ },
  { pattern: /^\.nvmrc$/ },
  { pattern: /^\.node-version$/ },
  { pattern: /^\.npmrc$/ },
  { pattern: /^\.editorconfig$/ },
  { pattern: /^\.gitignore$/ },
  { pattern: /^CLAUDE\.md$/ },
  { pattern: /^AGENTS\.md$/ },
  { pattern: /^CODEX\.md$/ },
  { pattern: /^turbo\.json$/ },
  { pattern: /^\.codacy\.yml$/ },
  { pattern: /^\.sentryclirc$/ },
];

// ── Skip / Filter Rules ─────────────────────────────────────────────────────

const SKIP_DIR_PATTERNS = [
  /node_modules/,
  /^\.git$/,
  /^\.claude$/,
  /^\.next$/,
  /\bdist\b/,
  /\bbuild\b/,
  /\.turbo/,
  /coverage/,
  /__pycache__/,
  /\.cache/,
  /\.vercel/,
  /\.generated/,
  /generated/,
  /playwright-report/,
  /test-results/,
  /^tmp$/,
  /^Obsidian$/,
  /^\.pulse$/,
  /^\.omx$/,
  /^\.gitnexus$/,
  /^\.kilo$/,
  /^\.beads$/,
  /^\.agents$/,
  /^\.serena$/,
];

const SKIP_FILE_PATTERNS = [
  /\.DS_Store$/,
  /Thumbs\.db$/,
  /\.sw[pon]$/,
  /\.tsbuildinfo$/,
  /\.log$/,
  /\.lock$/,
  /\.map$/,
  /\.d\.ts\.map$/,
  /\.min\.(js|css)$/,
  /\.chunk\.(js|css)$/,
  /\.ico$/,
  /\.png$/,
  /\.jpg$/,
  /\.jpeg$/,
  /\.gif$/,
  /\.webp$/,
  /\.svg$/,
  /\.woff2?$/,
  /\.ttf$/,
  /\.eot$/,
  /\.pdf$/,
  /\.zip$/,
  /\.tar(\.gz)?$/,
  /\.mp[34]$/,
  /\.webm$/,
  /\.mov$/,
  /\.sqlite$/,
  /\.sqlite3$/,
  /\.db$/,
  /\.wasm$/,
  /\.bin$/,
];

const SKIP_SECRET_PATTERNS = [
  /\.env$/,
  /(^|\/)\.env(?:\.(?!example$)[^/]+)?$/,
  /(^|\/)\.npmrc$/,
  /credentials/,
  /\.pem$/,
  /\.key$/,
  /\.cert$/,
  /secrets\.(json|yaml|yml|toml)$/,
  /id_rsa/,
  /id_ed25519/,
  /known_hosts/,
  /\.npmrc_auth$/,
  /\.netrc$/,
];

// ── Language Detection ──────────────────────────────────────────────────────

const EXT_TO_LANG = {
  '.ts': 'typescript',
  '.tsx': 'typescript tsx',
  '.mts': 'typescript',
  '.cts': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript jsx',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.json': 'json',
  '.json5': 'json5',
  '.yml': 'yaml',
  '.yaml': 'yaml',
  '.md': 'markdown',
  '.mdx': 'markdown mdx',
  '.css': 'css',
  '.scss': 'scss',
  '.less': 'less',
  '.pcss': 'postcss',
  '.html': 'html',
  '.htm': 'html',
  '.svg': 'xml svg',
  '.graphql': 'graphql',
  '.gql': 'graphql',
  '.prisma': 'prisma',
  '.sql': 'sql',
  '.sh': 'bash',
  '.bash': 'bash',
  '.zsh': 'bash',
  '.fish': 'fish',
  '.env': 'ini',
  '.dockerfile': 'dockerfile',
  '.py': 'python',
  '.pyi': 'python',
  '.txt': 'text',
  '.toml': 'toml',
  '.xml': 'xml',
  '.nix': 'nix',
  '.hcl': 'hcl',
  '.tf': 'hcl terraform',
  '.tfvars': 'hcl terraform',
  '.proto': 'protobuf',
  '.rs': 'rust',
  '.go': 'go',
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
  '.rb': 'ruby',
  '.php': 'php',
  '.lua': 'lua',
  '.vim': 'vim',
  '.conf': 'nginx',
  '.ini': 'ini',
  '.cfg': 'ini',
  '.nix': 'nix',
};

const LANG_BY_FILENAME = {
  Dockerfile: 'dockerfile',
  Makefile: 'makefile',
  Procfile: 'yaml',
};

// ── Utility Functions ───────────────────────────────────────────────────────

function log(level, ...args) {
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

function sleepSync(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    // intentionally busy wait to keep lock acquisition lightweight and predictable
  }
}

function readMirrorLock() {
  try {
    return JSON.parse(readFileSync(MIRROR_DAEMON_LOCK_PATH, 'utf8'));
  } catch {
    return null;
  }
}

function isMirrorLockStale(lock) {
  if (!lock) return true;
  const marker = lock.updatedAt || lock.heartbeatAt || lock.startedAt;
  if (!marker) return false;
  const markerTs = new Date(marker).getTime();
  if (!Number.isFinite(markerTs)) return false;
  return Date.now() - markerTs > LOCK_STALE_MS;
}

function acquireMirrorLock(context) {
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

function releaseMirrorLock(token) {
  const current = readMirrorLock();
  if (!current) return;
  if (current.pid === token.pid && current.startedAt === token.startedAt) {
    try {
      unlinkSync(MIRROR_DAEMON_LOCK_PATH);
    } catch {
      // best-effort release on best-effort path
    }
  }
}

function withMirrorLock(context, action) {
  const token = acquireMirrorLock(context);
  try {
    return action();
  } finally {
    releaseMirrorLock(token);
  }
}

function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

function normalizePath(path) {
  return path.split('\\').join('/');
}

let gitDirtySourcesCache = null;
let gitLocalCommitSourcesCache = null;

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

function readGitDirtySources(force = false) {
  if (gitDirtySourcesCache && !force) return gitDirtySourcesCache;

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

function readGitLocalCommitSources(force = false) {
  if (gitLocalCommitSourcesCache && !force) return gitLocalCommitSourcesCache;

  const localCommitSources = new Set(
    readNullDelimitedGitOutput(['diff', '--name-only', '-z', '@{upstream}..HEAD', '--']).map(
      normalizePath,
    ),
  );

  gitLocalCommitSourcesCache = localCommitSources;
  return localCommitSources;
}

function gitDirtySignature(
  dirtySources = readGitDirtySources(),
  localCommitSources = readGitLocalCommitSources(),
) {
  return [
    ...[...dirtySources].sort(),
    '\0--local-commit--\0',
    ...[...localCommitSources].sort(),
  ].join('\0');
}

function gitStateForSource(sourcePath) {
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

function ensureGraphLensSettings() {
  if (!existsSync(GRAPH_SETTINGS_PATH)) return false;

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
  if (current === next) return false;

  const tmp = `${GRAPH_SETTINGS_PATH}.tmp`;
  writeFileSync(tmp, next, 'utf8');
  renameSync(tmp, GRAPH_SETTINGS_PATH);
  return true;
}

function obsidianLinkTarget(filePath) {
  const rel = normalizePath(relative(VAULT_ROOT, filePath));
  return rel.endsWith('.md') ? rel.slice(0, -3) : rel;
}

function obsidianLink(targetPath, alias) {
  const safeAlias = String(alias || basename(targetPath)).replace(/[\[\]|]/g, '-');
  return `[[${obsidianLinkTarget(targetPath)}|${safeAlias}]]`;
}

function detectLanguage(filePath) {
  const name = basename(filePath);
  if (LANG_BY_FILENAME[name]) return LANG_BY_FILENAME[name];

  const ext = extname(name).toLowerCase();
  if (EXT_TO_LANG[ext]) return EXT_TO_LANG[ext];

  // Multi-extension fallback
  if (name.endsWith('.d.ts')) return 'typescript';
  if (name.endsWith('.test.ts') || name.endsWith('.spec.ts')) return 'typescript';
  if (name.endsWith('.test.tsx') || name.endsWith('.spec.tsx')) return 'typescript tsx';

  return '';
}

function shouldSkipDir(dirName, fullPath) {
  const rel = relative(REPO_ROOT, fullPath) || dirName;
  for (const p of SKIP_DIR_PATTERNS) {
    if (p.test(rel) || p.test(dirName)) return true;
  }
  return false;
}

function shouldSkipFile(fileName, fullPath) {
  const rel = relative(REPO_ROOT, fullPath) || fileName;

  for (const p of SKIP_SECRET_PATTERNS) {
    if (p.test(rel) || p.test(fileName)) return true;
  }
  for (const p of SKIP_FILE_PATTERNS) {
    if (p.test(rel) || p.test(fileName)) return true;
  }
  return false;
}

function isCandidateSourcePath(fullPath) {
  const rel = relative(REPO_ROOT, fullPath);
  if (rel.startsWith('..') || rel === '') return false;
  if (shouldSkipFile(basename(fullPath), fullPath)) return false;

  const parts = normalizePath(rel).split('/');
  for (let i = 0; i < parts.length - 1; i += 1) {
    if (shouldSkipDir(parts[i], join(REPO_ROOT, ...parts.slice(0, i + 1)))) {
      return false;
    }
  }
  return true;
}

function isMirrorableSourceFile(fullPath) {
  if (!isCandidateSourcePath(fullPath)) return false;
  try {
    const st = statSync(fullPath);
    return st.isFile();
  } catch {
    return false;
  }
}

function ensureDir(dirPath) {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Ensure the _source/ directory and manifest exist.
 * Returns the manifest object.
 */
function ensureSourceDir() {
  ensureDir(SOURCE_MIRROR_DIR);
  if (!existsSync(MANIFEST_PATH)) {
    persistManifestState({
      version: 2,
      generated: new Date().toISOString(),
      repo_root: REPO_ROOT,
      files: {},
    });
  }
  ensureGraphLensSettings();
  return readManifest();
}

function readManifest() {
  try {
    if (existsSync(MANIFEST_PATH)) {
      return JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
    }
  } catch (e) {
    log('WARN', 'Manifest read error, reinitializing:', e.message);
  }
  return { version: 2, generated: new Date().toISOString(), repo_root: REPO_ROOT, files: {} };
}

function writeManifest(data) {
  ensureDir(SOURCE_MIRROR_DIR);
  // Atomic write via temp + rename
  const tmp = MANIFEST_PATH + '.tmp';
  writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8');
  renameSync(tmp, MANIFEST_PATH);
}

function persistManifestState(manifest) {
  withMirrorLock('persist-mirror-state', () => {
    writeGeneratedIndexes(manifest);
    writeManifest(manifest);
  });
}

// ── Mirrored File Content Builder ───────────────────────────────────────────

function mirrorVisibleSegment(segment) {
  return segment.startsWith('.') ? `_dot_${segment.slice(1)}` : segment;
}

function sourceRelToMirrorRel(sourceRel) {
  return normalizePath(sourceRel).split('/').map(mirrorVisibleSegment).join('/');
}

function mirrorVisibleSegmentToSource(segment) {
  return segment.startsWith('_dot_') ? `.${segment.slice(5)}` : segment;
}

function mirrorRelToSourceRel(mirrorRel) {
  return normalizePath(mirrorRel).split('/').map(mirrorVisibleSegmentToSource).join('/');
}

function sourceToMirrorPath(sourceAbs) {
  const rel = sourceRelToMirrorRel(relative(REPO_ROOT, sourceAbs));
  return join(SOURCE_MIRROR_DIR, rel + '.md');
}

function mirrorToSourcePath(mirrorPath) {
  let rel = relative(SOURCE_MIRROR_DIR, mirrorPath);
  if (rel.endsWith('.md')) {
    rel = rel.slice(0, -3);
  }
  return join(REPO_ROOT, mirrorRelToSourceRel(rel));
}

function candidateSourceFiles(basePath) {
  const candidates = [
    basePath,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    `${basePath}.mts`,
    `${basePath}.cts`,
    `${basePath}.js`,
    `${basePath}.jsx`,
    `${basePath}.mjs`,
    `${basePath}.cjs`,
    `${basePath}.json`,
    `${basePath}.css`,
    `${basePath}.scss`,
    join(basePath, 'index.ts'),
    join(basePath, 'index.tsx'),
    join(basePath, 'index.js'),
    join(basePath, 'index.jsx'),
    join(basePath, 'index.mjs'),
  ];
  return candidates;
}

function resolveImportSpecifier(specifier, sourcePath) {
  if (!specifier || specifier.startsWith('node:')) return null;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(specifier)) return null;

  const relSource = normalizePath(relative(REPO_ROOT, sourcePath));
  let basePath = null;

  if (specifier.startsWith('.')) {
    basePath = resolve(dirname(sourcePath), specifier);
  } else if (specifier.startsWith('@/')) {
    if (relSource.startsWith('frontend-admin/')) {
      basePath = join(REPO_ROOT, 'frontend-admin', 'src', specifier.slice(2));
    } else if (relSource.startsWith('frontend/')) {
      basePath = join(REPO_ROOT, 'frontend', 'src', specifier.slice(2));
    }
  }

  if (!basePath) return null;

  for (const candidate of candidateSourceFiles(basePath)) {
    if (existsSync(candidate) && isMirrorableSourceFile(candidate)) {
      return candidate;
    }
  }
  return null;
}

function extractImportSpecifiers(content) {
  const specs = new Set();
  const patterns = [
    /\bimport\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g,
    /\bexport\s+(?:type\s+)?[^'"]*?\s+from\s+['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /@import\s+(?:url\()?['"]([^'"]+)['"]\)?/g,
  ];

  for (const pattern of patterns) {
    let match = pattern.exec(content);
    while (match) {
      specs.add(match[1]);
      match = pattern.exec(content);
    }
  }
  return [...specs];
}

function resolveMarkdownTarget(target, sourcePath) {
  const clean = target.split('#')[0].split('|')[0].trim();
  if (!clean || /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(clean)) return null;
  const base = clean.startsWith('/')
    ? join(REPO_ROOT, clean.slice(1))
    : resolve(dirname(sourcePath), clean);
  const candidates = clean.endsWith('.md')
    ? [base]
    : [base, `${base}.md`, join(base, 'README.md'), join(base, 'index.md')];
  return (
    candidates.find((candidate) => existsSync(candidate) && isMirrorableSourceFile(candidate)) ||
    null
  );
}

function extractMarkdownTargets(content, sourcePath) {
  const targets = [];
  const seen = new Set();
  const patterns = [/\[\[([^\]\n]+)\]\]/g, /\[[^\]\n]+\]\(([^)\n]+)\)/g];

  for (const pattern of patterns) {
    let match = pattern.exec(content);
    while (match) {
      const target = resolveMarkdownTarget(match[1], sourcePath);
      if (target && !seen.has(target)) {
        seen.add(target);
        targets.push({ specifier: match[1], target });
      }
      match = pattern.exec(content);
    }
  }
  return targets;
}

let packageNameIndex = null;

function buildPackageNameIndex() {
  if (packageNameIndex) return packageNameIndex;
  packageNameIndex = new Map();
  for (const source of collectAllSourceFiles()) {
    if (basename(source) !== 'package.json') continue;
    try {
      const parsed = JSON.parse(readFileSync(source, 'utf8'));
      if (parsed.name) {
        packageNameIndex.set(parsed.name, source);
      }
    } catch {
      // Ignore invalid package manifests in historical worktrees.
    }
  }
  return packageNameIndex;
}

function extractPackageRelations(content, sourcePath) {
  if (basename(sourcePath) !== 'package.json') return [];
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    return [];
  }
  const index = buildPackageNameIndex();
  const deps = Object.assign(
    {},
    parsed.dependencies || {},
    parsed.devDependencies || {},
    parsed.peerDependencies || {},
    parsed.optionalDependencies || {},
  );
  return Object.keys(deps)
    .map((name) => ({ specifier: name, target: index.get(name) }))
    .filter((relation) => relation.target && relation.target !== sourcePath);
}

function extractPathStringRelations(content, sourcePath) {
  const relations = [];
  const seen = new Set();
  const relSource = normalizePath(relative(REPO_ROOT, sourcePath));
  const isRuntimeArtifact =
    relSource.startsWith('.pulse/') ||
    relSource.startsWith('.gitnexus/') ||
    relSource.endsWith('.json') ||
    relSource.endsWith('.md') ||
    relSource.endsWith('.yaml') ||
    relSource.endsWith('.yml');
  if (!isRuntimeArtifact) return relations;

  const pathPattern =
    /["'`]((?:\.\/|\.\.\/|\/)?(?:[A-Za-z0-9_.@()[\]-]+\/){1,}[A-Za-z0-9_.@()[\]-]+\.[A-Za-z0-9]+)["'`]/g;
  let match = pathPattern.exec(content);
  while (match && relations.length < 80) {
    const raw = match[1];
    const base = raw.startsWith('/')
      ? join(REPO_ROOT, raw.slice(1))
      : raw.startsWith('./') || raw.startsWith('../')
        ? resolve(dirname(sourcePath), raw)
        : join(REPO_ROOT, raw);
    for (const candidate of candidateSourceFiles(base)) {
      if (
        existsSync(candidate) &&
        isMirrorableSourceFile(candidate) &&
        candidate !== sourcePath &&
        !seen.has(candidate)
      ) {
        seen.add(candidate);
        relations.push({ specifier: raw, target: candidate });
        break;
      }
    }
    match = pathPattern.exec(content);
  }
  return relations;
}

function resolveRepoPathToken(raw, sourcePath) {
  const token = String(raw || '')
    .trim()
    .replace(/^['"`([{<]+|['"`)\]}>.,;:]+$/g, '')
    .split('#')[0];
  if (!token || /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(token)) return null;

  const base = token.startsWith('/')
    ? join(REPO_ROOT, token.slice(1))
    : token.startsWith('./') || token.startsWith('../')
      ? resolve(dirname(sourcePath), token)
      : join(REPO_ROOT, token);

  for (const candidate of candidateSourceFiles(base)) {
    if (existsSync(candidate) && isMirrorableSourceFile(candidate) && candidate !== sourcePath) {
      return candidate;
    }
  }

  return null;
}

function extractEmbeddedRepoPathRelations(content, sourcePath) {
  const relations = [];
  const seen = new Set();
  const text = String(content || '');
  const pathTokenPattern =
    /(?:^|[\s"'`(=:#])((?:(?:backend|frontend|frontend-admin|worker|scripts|docs|prisma|ops|e2e|nginx|\.pulse|\.agents|\.github))\/[^\s"'`,;]+?\.[A-Za-z0-9]+)(?=$|[\s"'`,;#])/g;
  const rootFilePattern =
    /(?:^|[\s"'`(=:#])((?:PULSE_[A-Za-z0-9_-]+|CODEX|CLAUDE|AGENTS|README|package-lock|package|tsconfig|vitest\.config|playwright\.config)\.(?:json|md|js|mjs|ts|yml|yaml))(?=$|[\s"'`),;#])/g;

  for (const pattern of [pathTokenPattern, rootFilePattern]) {
    let match = pattern.exec(text);
    while (match && relations.length < 240) {
      const raw = match[1];
      const target = resolveRepoPathToken(raw, sourcePath);
      if (target && !seen.has(target)) {
        seen.add(target);
        relations.push({ specifier: raw, target });
      }
      match = pattern.exec(text);
    }
  }

  return relations;
}

function extractInternalRelations(content, sourcePath) {
  const relations = [];
  const seen = new Set();

  for (const specifier of extractImportSpecifiers(content)) {
    const target = resolveImportSpecifier(specifier, sourcePath);
    if (!target || target === sourcePath) continue;

    const relTarget = normalizePath(relative(REPO_ROOT, target));
    if (seen.has(relTarget)) continue;
    seen.add(relTarget);
    relations.push({
      specifier,
      source: relTarget,
      mirror: normalizePath(relative(SOURCE_MIRROR_DIR, sourceToMirrorPath(target))),
      link: obsidianLink(sourceToMirrorPath(target), basename(relTarget)),
    });
  }

  for (const { specifier, target } of [
    ...extractMarkdownTargets(content, sourcePath),
    ...extractPackageRelations(content, sourcePath),
    ...extractPathStringRelations(content, sourcePath),
    ...extractEmbeddedRepoPathRelations(content, sourcePath),
  ]) {
    if (!target || target === sourcePath) continue;
    const relTarget = normalizePath(relative(REPO_ROOT, target));
    if (seen.has(relTarget)) continue;
    seen.add(relTarget);
    relations.push({
      specifier,
      source: relTarget,
      mirror: normalizePath(relative(SOURCE_MIRROR_DIR, sourceToMirrorPath(target))),
      link: obsidianLink(sourceToMirrorPath(target), basename(relTarget)),
    });
  }

  return relations.sort((a, b) => a.source.localeCompare(b.source));
}

function shouldExtractArchitecturalRelations(sourcePath) {
  const ext = extname(sourcePath).toLowerCase();
  return ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs', '.prisma', '.sql'].includes(
    ext,
  );
}

function buildRelationsSection(relations) {
  if (relations.length === 0) {
    return ['## Conexoes do codigo', '', 'Nenhuma conexao interna detectada.', ''];
  }

  return [
    '## Conexoes do codigo',
    '',
    ...relations.map((relation) => `- ${relation.link} via \`${relation.specifier}\``),
    '',
  ];
}

function clusterKeyForSource(relPath) {
  const parts = normalizePath(relPath).split('/');
  if (parts[0] === 'backend' && parts[1] === 'src') {
    return ['backend', parts[2] || 'root'].join('__');
  }
  if (parts[0] === 'frontend' && parts[1] === 'src') {
    if (parts[2] === 'app')
      return ['frontend', 'app', parts[3] || 'root', parts[4] || 'index'].join('__');
    if (parts[2] === 'components')
      return ['frontend', 'components', parts[3] || 'root', parts[4] || 'index'].join('__');
    return ['frontend', parts[2] || 'src', parts[3] || 'index'].join('__');
  }
  if (parts[0] === 'worker') return ['worker', parts[1] || 'root'].join('__');
  if (parts[0] === 'scripts')
    return ['scripts', parts[1] || 'root', parts[2] || 'index'].join('__');
  if (parts[0] === '.pulse') return ['pulse-artifacts', parts[1] || 'root'].join('__');
  if (parts[0] === '.agents') return ['agents', parts[1] || 'root', parts[2] || 'index'].join('__');
  if (parts[0] === 'docs') return ['docs', parts[1] || 'root'].join('__');
  if (parts[0] === 'prisma' || parts[1] === 'prisma') return ['database', parts[0]].join('__');
  return [parts[0] || 'root', parts[1] || 'root'].join('__');
}

function clusterTitleForKey(key) {
  return key
    .split('__')
    .filter(Boolean)
    .map((part) => part.replace(/[()]/g, '').replace(/[-_]+/g, ' '))
    .join(' / ');
}

function clusterRelPath(key) {
  return join(CLUSTER_DIR, `${key}.md`);
}

function clusterLink(key) {
  return obsidianLink(join(SOURCE_MIRROR_DIR, clusterRelPath(key)), clusterTitleForKey(key));
}

function machineHubLink(key, alias) {
  return obsidianLink(join(SOURCE_MIRROR_DIR, MACHINE_DIR, `${key}.md`), alias);
}

function slugSegment(value) {
  return (
    String(value || 'unknown')
      .toLowerCase()
      .replace(/[^a-z0-9._/-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 120) || 'unknown'
  );
}

function visualFactRelPath(fact) {
  return join(VISUAL_FACT_DIR, slugSegment(fact.kind), `${slugSegment(fact.value)}.md`);
}

function visualFactKey(fact) {
  return `${fact.kind}:${fact.value}`;
}

function visualFactLink(fact) {
  return obsidianLink(join(SOURCE_MIRROR_DIR, visualFactRelPath(fact)), fact.label || fact.value);
}

function shouldMaterializeVisualFact(fact) {
  return [
    'problem',
    'missing',
    'debt',
    'architecture',
    'flow',
    'computational-effect',
    'effect-intensity',
    'surface',
    'risk',
    'kind',
    'route',
    'api-call',
    'db-op',
    'schema',
    'auth',
    'integration',
    'proof',
  ].includes(fact.kind);
}

function addVisualFact(facts, kind, value, label = value, detail = null) {
  const normalizedKind = String(kind || '').trim();
  const normalizedValue = String(value || '').trim();
  if (!normalizedKind || !normalizedValue) return;
  const key = `${normalizedKind}:${normalizedValue}`;
  if (facts.some((fact) => visualFactKey(fact) === key)) return;
  facts.push({
    kind: normalizedKind,
    value: normalizedValue,
    label: String(label || normalizedValue),
    detail,
  });
}

function isCodeLikeSource(sourcePath) {
  return ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'].includes(
    extname(sourcePath).toLowerCase(),
  );
}

function bucketNumber(value, buckets) {
  for (const [label, max] of buckets) {
    if (value <= max) return label;
  }
  return buckets[buckets.length - 1]?.[0] || 'unknown';
}

function calculateEntropy(text) {
  if (!text) return 0;
  const counts = new Map();
  for (const char of text) counts.set(char, (counts.get(char) || 0) + 1);
  let entropy = 0;
  for (const count of counts.values()) {
    const probability = count / text.length;
    entropy -= probability * Math.log2(probability);
  }
  return entropy;
}

function extractDominantTokens(text) {
  const counts = new Map();
  const stop = new Set([
    'the',
    'and',
    'for',
    'from',
    'with',
    'this',
    'that',
    'const',
    'let',
    'var',
    'return',
    'import',
    'export',
    'default',
    'function',
    'class',
    'type',
    'interface',
    'true',
    'false',
    'null',
    'undefined',
  ]);
  const pattern = /[A-Za-z_][A-Za-z0-9_]{3,}/g;
  let match = pattern.exec(text || '');
  while (match) {
    const token = match[0].toLowerCase();
    if (!stop.has(token) && !/^\d+$/.test(token)) {
      counts.set(token, (counts.get(token) || 0) + 1);
    }
    match = pattern.exec(text || '');
  }
  return [...counts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 8)
    .map(([token]) => token);
}

function extractJsonKeys(content) {
  let parsed;
  try {
    parsed = JSON.parse(content || '');
  } catch {
    return [];
  }
  const keys = new Set();
  const visit = (value, depth = 0) => {
    if (!value || depth > 4) return;
    if (Array.isArray(value)) {
      for (const item of value.slice(0, 8)) visit(item, depth + 1);
      return;
    }
    if (typeof value !== 'object') return;
    for (const key of Object.keys(value).slice(0, 20)) {
      keys.add(key);
      visit(value[key], depth + 1);
      if (keys.size >= 20) return;
    }
  };
  visit(parsed);
  return [...keys].sort().slice(0, 8);
}

function extractMarkdownHeadings(content) {
  const headings = [];
  const pattern = /^#{1,6}\s+(.+)$/gm;
  let match = pattern.exec(content || '');
  while (match && headings.length < 12) {
    headings.push(match[1].trim().slice(0, 80));
    match = pattern.exec(content || '');
  }
  return headings;
}

function addContentShapeFacts(facts, sourcePath, text) {
  const bytes = Buffer.byteLength(text || '', 'utf8');
  const lines = text ? text.split(/\r\n|\r|\n/).length : 0;
  const averageLine = lines ? Math.round(bytes / lines) : 0;
  const entropy = calculateEntropy(text || '');
  const lower = String(text || '').toLowerCase();
  const contentHash = sha256(text || '');
  const lineBucket = bucketNumber(lines, [
    ['lines:0', 0],
    ['lines:1-20', 20],
    ['lines:21-80', 80],
    ['lines:81-250', 250],
    ['lines:251-1000', 1000],
    ['lines:1000+', Number.POSITIVE_INFINITY],
  ]);
  const byteBucket = bucketNumber(bytes, [
    ['bytes:0', 0],
    ['bytes:1-2kb', 2048],
    ['bytes:2-10kb', 10240],
    ['bytes:10-50kb', 51200],
    ['bytes:50-250kb', 256000],
    ['bytes:250kb+', Number.POSITIVE_INFINITY],
  ]);
  const averageLineBucket = bucketNumber(averageLine, [
    ['avg-line:0-40', 40],
    ['avg-line:41-100', 100],
    ['avg-line:101-240', 240],
    ['avg-line:240+', Number.POSITIVE_INFINITY],
  ]);
  const entropyBucket = bucketNumber(Math.round(entropy * 10), [
    ['entropy:empty', 0],
    ['entropy:low', 35],
    ['entropy:medium', 45],
    ['entropy:high', 55],
    ['entropy:very-high', Number.POSITIVE_INFINITY],
  ]);
  const ext = extname(sourcePath).toLowerCase() || 'no-extension';

  for (let index = 0; index < 4; index++) {
    const shard = contentHash.slice(index * 2, index * 2 + 2);
    addVisualFact(facts, 'content-hash-shard', `${index}:${shard}`, `Hash shard ${index}:${shard}`);
  }
  addVisualFact(facts, 'content-shape', lineBucket, lineBucket);
  addVisualFact(facts, 'content-shape', byteBucket, byteBucket);
  addVisualFact(facts, 'content-shape', averageLineBucket, averageLineBucket);
  addVisualFact(facts, 'content-shape', entropyBucket, entropyBucket);
  addVisualFact(facts, 'file-extension', ext, ext);
  if (text.includes('\r\n')) addVisualFact(facts, 'content-shape', 'newline:crlf', 'CRLF newline');
  if (text.includes('\n') && !text.includes('\r\n'))
    addVisualFact(facts, 'content-shape', 'newline:lf', 'LF newline');
  if (/\t/.test(text)) addVisualFact(facts, 'content-shape', 'indent:tabs', 'Tab indentation');
  if (/^ {2,}\S/m.test(text))
    addVisualFact(facts, 'content-shape', 'indent:spaces', 'Space indentation');
  if (/\b(password|secret|token|private_key|api_key)\b/i.test(text))
    addVisualFact(facts, 'debt', 'secret-like-token', 'Secret-like token text');
  if (lower.includes('deprecated'))
    addVisualFact(facts, 'debt', 'deprecated-marker', 'Deprecated marker');
}

function addStructuredContentFacts(facts, sourcePath, text) {
  const ext = extname(sourcePath).toLowerCase();
  const relPath = normalizePath(relative(REPO_ROOT, sourcePath));
  const generatedRuntimeArtifact = /^(\.pulse|\.gitnexus|\.agents|\.kilo|\.omx|\.serena)\//.test(
    relPath,
  );
  if (ext === '.json' && !generatedRuntimeArtifact) {
    for (const key of extractJsonKeys(text)) addVisualFact(facts, 'json-key', key, key);
  }
  if (ext === '.md' || ext === '.mdx') {
    for (const heading of extractMarkdownHeadings(text))
      addVisualFact(facts, 'markdown-heading', heading, heading);
  }
  const vocabularyLimit = generatedRuntimeArtifact ? 3 : 8;
  for (const token of extractDominantTokens(text).slice(0, vocabularyLimit)) {
    addVisualFact(facts, 'vocabulary', token, token);
  }
}

function extractDecoratorRoutes(content) {
  const routes = [];
  const controllerMatch = /@Controller\s*\(\s*['"`]([^'"`]*)['"`]\s*\)/.exec(content || '');
  const base = controllerMatch ? controllerMatch[1].replace(/^\/|\/$/g, '') : '';
  const pattern = /@(Get|Post|Put|Patch|Delete|Options|Head)\s*\(\s*(?:['"`]([^'"`]*)['"`])?\s*\)/g;
  let match = pattern.exec(content || '');
  while (match) {
    const method = match[1].toUpperCase();
    const route = String(match[2] || '').replace(/^\/|\/$/g, '');
    const full = `/${[base, route].filter(Boolean).join('/')}`;
    routes.push(`${method} ${full}`);
    match = pattern.exec(content || '');
  }
  return routes;
}

function normalizeHttpPath(path) {
  const raw = String(path || '').trim();
  if (!raw) return '/';
  return `/${raw
    .replace(/^https?:\/\/[^/]+/i, '')
    .replace(/^\/?api\//i, '')
    .replace(/^\/+|\/+$/g, '')}`;
}

function extractApiConsumers(content) {
  const calls = [];
  const seen = new Set();
  const patterns = [
    /\b(api|client|http|axios)\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/gi,
    /\bfetch\s*\(\s*['"`]([^'"`]+)['"`]\s*,?\s*(?:\{[^}]*?\bmethod\s*:\s*['"`]([A-Z]+)['"`])?/gis,
  ];

  for (const pattern of patterns) {
    let match = pattern.exec(content || '');
    while (match && calls.length < 200) {
      const method = (match[2] || match[4] || 'GET').toUpperCase();
      const target = match[3] || match[1] || '';
      if (target.startsWith('/') || target.startsWith('api/')) {
        const value = `${method} ${normalizeHttpPath(target)}`;
        if (!seen.has(value)) {
          seen.add(value);
          calls.push(value);
        }
      }
      match = pattern.exec(content || '');
    }
  }

  return calls;
}

function extractExportedSymbols(content) {
  const symbols = [];
  const seen = new Set();
  const patterns = [
    /\bexport\s+(?:default\s+)?(?:abstract\s+)?class\s+([A-Z][A-Za-z0-9_]*)/g,
    /\bexport\s+(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_$][A-Za-z0-9_$]*)/g,
    /\bexport\s+(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)/g,
    /\bexport\s+(?:interface|type|enum)\s+([A-Za-z_$][A-Za-z0-9_$]*)/g,
  ];

  for (const pattern of patterns) {
    let match = pattern.exec(content || '');
    while (match && symbols.length < 120) {
      if (!seen.has(match[1])) {
        seen.add(match[1]);
        symbols.push(match[1]);
      }
      match = pattern.exec(content || '');
    }
  }

  return symbols;
}

function extractPrismaModels(content) {
  const models = [];
  const pattern = /^\s*(model|enum)\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{/gm;
  let match = pattern.exec(content || '');
  while (match) {
    models.push(`${match[1]}:${match[2]}`);
    match = pattern.exec(content || '');
  }
  return models;
}

function extractDbOperations(content) {
  const operations = new Set();
  const pattern =
    /\b(?:prisma|this\.prisma|tx|transaction)\.([A-Za-z_][A-Za-z0-9_]*)\.(findUnique|findFirst|findMany|create|createMany|update|updateMany|upsert|delete|deleteMany|aggregate|count)\s*\(/g;
  let match = pattern.exec(content || '');
  while (match && operations.size < 200) {
    operations.add(`${match[1]}.${match[2]}`);
    match = pattern.exec(content || '');
  }
  if (/\.\$transaction\s*\(/.test(content || '')) operations.add('$transaction');
  return [...operations].sort();
}

function extractAuthFacts(content) {
  const facts = [];
  if (/@UseGuards\s*\(/.test(content || '')) facts.push('guarded');
  if (/@Public\s*\(/.test(content || '') || /\bskipAuth\b|isPublic\b/.test(content || ''))
    facts.push('public');
  if (
    /@Controller\s*\(/.test(content || '') &&
    !/@UseGuards\s*\(|@Public\s*\(/.test(content || '')
  ) {
    facts.push('controller-auth-implicit');
  }
  return facts;
}

function countPattern(text, pattern) {
  return [...String(text || '').matchAll(pattern)].length;
}

function extractFunctionCalls(content) {
  const calls = new Map();
  const pattern = /\b([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/g;
  const ignore = new Set([
    'if',
    'for',
    'while',
    'switch',
    'catch',
    'function',
    'return',
    'typeof',
    'new',
    'class',
    'super',
  ]);
  let match = pattern.exec(content || '');
  while (match) {
    const name = match[1];
    if (!ignore.has(name) && name.length > 2) {
      calls.set(name, (calls.get(name) || 0) + 1);
    }
    match = pattern.exec(content || '');
  }
  return [...calls.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 24)
    .map(([name]) => name);
}

function addIntensityFact(facts, kind, prefix, count, label) {
  if (count <= 0) return;
  const bucket = bucketNumber(count, [
    [`${prefix}:1`, 1],
    [`${prefix}:2-5`, 5],
    [`${prefix}:6-20`, 20],
    [`${prefix}:21-80`, 80],
    [`${prefix}:80+`, Number.POSITIVE_INFINITY],
  ]);
  addVisualFact(facts, kind, bucket, `${label} ${bucket.split(':').pop()}`);
}

function addComputationalEffectFacts(facts, sourcePath, text) {
  const relPath = normalizePath(relative(REPO_ROOT, sourcePath));
  const lower = relPath.toLowerCase();
  const codeLike = isCodeLikeSource(sourcePath);
  const ext = extname(sourcePath).toLowerCase();

  if (!codeLike) {
    if (ext === '.json' || ext === '.yaml' || ext === '.yml' || ext === '.toml') {
      addVisualFact(facts, 'computational-effect', 'configuration', 'Configuration effect');
    } else if (ext === '.md' || ext === '.mdx') {
      addVisualFact(
        facts,
        'computational-effect',
        'documentation-or-contract',
        'Documentation/contract effect',
      );
    } else {
      addVisualFact(facts, 'computational-effect', 'static-asset-or-data', 'Static/data effect');
    }
    return;
  }

  const source = String(text || '');
  const branchCount = countPattern(source, /\b(if|switch|case|\?|&&|\|\|)\b/g);
  const loopCount = countPattern(source, /\b(for|while|forEach|map|reduce|filter)\b/g);
  const asyncCount = countPattern(source, /\b(await|async|Promise|then|catch)\b/g);
  const throwCount = countPattern(source, /\bthrow\b|\.catch\s*\(|try\s*\{|catch\s*\(/g);
  const callCount = countPattern(source, /\b[A-Za-z_$][A-Za-z0-9_$]*\s*\(/g);

  addIntensityFact(facts, 'effect-intensity', 'branches', branchCount, 'Branching');
  addIntensityFact(facts, 'effect-intensity', 'loops', loopCount, 'Looping');
  addIntensityFact(facts, 'effect-intensity', 'async', asyncCount, 'Async');
  addIntensityFact(facts, 'effect-intensity', 'errors', throwCount, 'Error path');
  addIntensityFact(facts, 'effect-intensity', 'calls', callCount, 'Call volume');

  for (const call of extractFunctionCalls(source)) addVisualFact(facts, 'call', call, call);

  if (/\b(prisma|this\.prisma|tx)\./.test(source))
    addVisualFact(facts, 'computational-effect', 'database-io', 'Database I/O');
  if (/\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/.test(source))
    addVisualFact(facts, 'computational-effect', 'database-write', 'Database write');
  if (/\.(findUnique|findFirst|findMany|aggregate|count)\s*\(/.test(source))
    addVisualFact(facts, 'computational-effect', 'database-read', 'Database read');
  if (/\b(fetch|axios|apiFetch|http\.)\b/.test(source))
    addVisualFact(facts, 'computational-effect', 'network-io', 'Network I/O');
  if (/\b(localStorage|sessionStorage|indexedDB|cookie)\b/.test(source))
    addVisualFact(facts, 'computational-effect', 'browser-persistence', 'Browser persistence');
  if (/\b(useState|useReducer|useEffect|useMemo|useCallback|useSWR)\b/.test(source))
    addVisualFact(facts, 'computational-effect', 'ui-reactivity', 'UI reactivity');
  if (/@Controller\s*\(|@(Get|Post|Put|Patch|Delete)\s*\(/.test(source))
    addVisualFact(facts, 'computational-effect', 'http-server', 'HTTP server effect');
  if (/@Injectable\s*\(|class\s+[A-Za-z0-9_]+Service\b/.test(source))
    addVisualFact(facts, 'computational-effect', 'service-logic', 'Service logic');
  if (/@Module\s*\(/.test(source))
    addVisualFact(
      facts,
      'computational-effect',
      'dependency-injection-wiring',
      'Dependency injection wiring',
    );
  if (/@UseGuards\s*\(|\bJwt|Auth|Guard|workspaceId|tenantId\b/.test(source))
    addVisualFact(facts, 'computational-effect', 'auth-or-isolation', 'Auth/isolation effect');
  if (/\b(Queue|BullMQ|Worker|processor|enqueue|addJob|job)\b/.test(source))
    addVisualFact(facts, 'computational-effect', 'queue-work', 'Queue/work effect');
  if (/\b(stripe|mercadopago|whatsapp|waha|openai|redis|sentry|datadog)\b/i.test(source))
    addVisualFact(facts, 'computational-effect', 'external-provider', 'External provider effect');
  if (
    /^\s*(export\s+)?(interface|type)\s+/m.test(source) &&
    !/\b(function|class|const|let|var)\b/.test(source)
  ) {
    addVisualFact(facts, 'computational-effect', 'type-contract-only', 'Type contract only');
  }
  if (lower.includes('__tests__') || /\.(spec|test)\.[cm]?[jt]sx?$/.test(lower)) {
    addVisualFact(facts, 'computational-effect', 'proof-execution', 'Proof/test execution');
  }
}

function extractExternalPackages(content) {
  const packages = new Set();
  for (const specifier of extractImportSpecifiers(content || '')) {
    if (
      !specifier ||
      specifier.startsWith('.') ||
      specifier.startsWith('@/') ||
      specifier.startsWith('node:')
    ) {
      continue;
    }
    const parts = specifier.split('/');
    const pkg = specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
    if (pkg) packages.add(pkg);
  }
  return [...packages].sort();
}

function extractVisualFacts(sourcePath, content, machine, gitState, relations, omitSourceBody) {
  const relPath = normalizePath(relative(REPO_ROOT, sourcePath));
  const facts = [];
  const text = content || '';
  const codeLike = isCodeLikeSource(sourcePath);
  const prismaSchema = extname(sourcePath).toLowerCase() === '.prisma';

  addContentShapeFacts(facts, sourcePath, text);
  addStructuredContentFacts(facts, sourcePath, text);
  addComputationalEffectFacts(facts, sourcePath, text);
  addVisualFact(facts, 'surface', machine.surface, `Surface: ${machine.surface}`);
  addVisualFact(facts, 'risk', machine.risk, `Risk: ${machine.risk}`);
  addVisualFact(
    facts,
    'language',
    detectLanguage(sourcePath) || 'none',
    `Lang: ${detectLanguage(sourcePath) || 'none'}`,
  );
  addVisualFact(
    facts,
    'payload',
    omitSourceBody ? 'metadata-only' : 'full-text',
    omitSourceBody ? 'Metadata only' : 'Full text',
  );
  if (gitState.dirty) addVisualFact(facts, 'git-state', 'dirty', 'Dirty workspace');
  if (gitState.localCommit) addVisualFact(facts, 'git-state', 'local-commit', 'Local commit');
  for (const kind of machine.kinds) addVisualFact(facts, 'kind', kind, `Kind: ${kind}`);
  for (const relation of relations)
    addVisualFact(facts, 'dependency', relation.source, basename(relation.source));
  if (codeLike) {
    for (const route of extractDecoratorRoutes(text)) addVisualFact(facts, 'route', route, route);
    for (const call of extractApiConsumers(text)) addVisualFact(facts, 'api-call', call, call);
    for (const symbol of extractExportedSymbols(text))
      addVisualFact(facts, 'symbol', symbol, symbol);
    for (const op of extractDbOperations(text)) addVisualFact(facts, 'db-op', op, op);
    for (const auth of extractAuthFacts(text)) addVisualFact(facts, 'auth', auth, auth);
    if (/\b(workspaceId|tenantId|accountId|ownerId|userId)\b/.test(text)) {
      addVisualFact(facts, 'isolation-key', 'tenant-or-owner-scope', 'Tenant/owner scope key');
    }
    for (const pkg of extractExternalPackages(text)) addVisualFact(facts, 'package', pkg, pkg);
  }
  if (prismaSchema) {
    for (const model of extractPrismaModels(text)) addVisualFact(facts, 'schema', model, model);
  }

  const detectors = [
    ['debt', 'todo', /\bTODO\b|FIXME|XXX|HACK/i, 'TODO/FIXME/HACK'],
    [
      'debt',
      'mock-or-fake',
      /\bmock\b|\bfake\b|placeholder|simulat(?:e|ed|ion)|demo/i,
      'Mock/fake/simulation',
    ],
    ['debt', 'random-runtime', /Math\.random\s*\(/, 'Random runtime value'],
    ['debt', 'local-storage', /\blocalStorage\b|\bsessionStorage\b/, 'Browser storage state'],
    ['debt', 'typescript-any', /:\s*any\b|as\s+any\b|<any>/, 'TypeScript any'],
    [
      'debt',
      'suppression-comment',
      /@ts-ignore|@ts-expect-error|eslint-disable|biome-ignore|NOSONAR|noqa|codacy:ignore/i,
      'Suppression bypass',
    ],
    ['debt', 'console-log', /\bconsole\.(log|warn|error|debug)\s*\(/, 'Console logging'],
    ['debt', 'swallowed-error', /catch\s*\([^)]*\)\s*\{\s*(?:\/\/[^\n]*)?\s*\}/s, 'Empty catch'],
    ['debt', 'process-env-runtime', /\bprocess\.env\.[A-Z0-9_]+\b/, 'Runtime env dependency'],
    [
      'debt',
      'hardcoded-localhost',
      /localhost|127\.0\.0\.1|0\.0\.0\.0/,
      'Hardcoded local endpoint',
    ],
    [
      'debt',
      'hardcoded-timeout',
      /\bsetTimeout\s*\(|\bsetInterval\s*\(|timeout(?:Ms|MS)?\s*[:=]\s*\d{3,}/,
      'Hardcoded timer/timeout',
    ],
    [
      'debt',
      'money-number',
      /\b(amount|price|total|subtotal|fee|commission|payout|balance|wallet|ledger)\b[^;\n]{0,80}\b\d+(?:\.\d+)?\b/i,
      'Money value literal',
    ],
    ['debt', 'unsafe-delete-many', /\.deleteMany\s*\(/, 'Bulk delete operation'],
    ['debt', 'unsafe-update-many', /\.updateMany\s*\(/, 'Bulk update operation'],
    ['proof', 'test-file', isTestSource(relPath) ? /./ : /$a/, 'Test/proof file'],
    ['integration', 'stripe', /\bstripe\b/i, 'Stripe integration'],
    ['integration', 'mercado-pago', /mercado\s*pago|mercadopago/i, 'Mercado Pago integration'],
    ['integration', 'whatsapp', /\bwhatsapp\b|\bwaha\b|\bmeta\b/i, 'WhatsApp/Meta integration'],
    ['integration', 'openai', /\bopenai\b/i, 'OpenAI integration'],
    ['integration', 'redis-bullmq', /\bredis\b|\bbullmq\b/i, 'Redis/BullMQ integration'],
  ];

  for (const [kind, value, pattern, label] of detectors) {
    if (pattern.test(text)) addVisualFact(facts, kind, value, label);
  }

  return facts;
}

function buildVisualFactsSection(facts) {
  if (facts.length === 0) return [];
  return [
    '## Comportamento visual do codigo',
    '',
    ...facts.map((fact) => `- \`${visualFactKey(fact)}\`${fact.detail ? ` - ${fact.detail}` : ''}`),
    '',
  ];
}

function buildConstructionMapSection(relPath, machine, gitState) {
  const links = [clusterLink(clusterKeyForSource(relPath))];

  if (gitState.dirty) links.push(machineHubLink('workspace-sujo', 'Workspace sujo'));
  if (machine.risk === 'critical') links.push(machineHubLink('risco-critico', 'Risco critico'));
  if (machine.risk === 'high') links.push(machineHubLink('risco-alto', 'Risco alto'));
  if (machine.kinds.includes('api-controller'))
    links.push(machineHubLink('runtime-api', 'Runtime API'));
  if (machine.surface === 'frontend') links.push(machineHubLink('ui-frontend', 'UI frontend'));
  if (machine.kinds.includes('test'))
    links.push(machineHubLink('provas-testes', 'Provas e testes'));
  if (machine.surface === 'pulse-machine')
    links.push(machineHubLink('pulse-maquina', 'PULSE maquina'));
  if (machine.surface === 'governance') links.push(machineHubLink('governanca', 'Governanca'));

  return ['## Mapa da obra', '', ...[...new Set(links)].map((link) => `- ${link}`), ''];
}

let mirrorSignalIndexCache = null;

function readJsonArtifact(...parts) {
  const filePath = join(REPO_ROOT, ...parts);
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function signalBucketForSource(index, source) {
  const normalized = normalizePath(source || '');
  if (!normalized) return null;
  let bucket = index.get(normalized);
  if (!bucket) {
    bucket = { tags: new Set(), details: [] };
    index.set(normalized, bucket);
  }
  return bucket;
}

function addSignalTag(index, source, tag, detail = null) {
  const bucket = signalBucketForSource(index, source);
  if (!bucket) return;
  bucket.tags.add(tag);
  if (detail) bucket.details.push(detail);
}

function buildMirrorSignalIndex() {
  if (mirrorSignalIndexCache) return mirrorSignalIndexCache;

  const index = new Map();
  const codacy = readJsonArtifact('PULSE_CODACY_STATE.json');
  if (codacy) {
    for (const item of codacy.topFiles || []) {
      addSignalTag(index, item.file, SIGNAL_HOTSPOT_TAG, `Codacy hotspot: ${item.count} issue(s)`);
    }
    for (const issue of codacy.highPriorityBatch || []) {
      const severity = String(issue.severityLevel || '').toLowerCase();
      if (severity === 'high' || severity === 'error') {
        addSignalTag(
          index,
          issue.filePath,
          SIGNAL_STATIC_HIGH_TAG,
          `Codacy ${issue.severityLevel}: ${issue.message || issue.patternId || 'high priority issue'}`,
        );
      }
    }
  }

  const external = readJsonArtifact('.pulse', 'current', 'PULSE_EXTERNAL_SIGNAL_STATE.json');
  if (external) {
    for (const signal of external.signals || []) {
      for (const file of signal.relatedFiles || []) {
        addSignalTag(
          index,
          file,
          SIGNAL_EXTERNAL_TAG,
          `${signal.source || 'external'} ${signal.type || 'signal'}: ${signal.summary || signal.id || 'observed signal'}`,
        );
      }
    }
  }

  mirrorSignalIndexCache = index;
  return index;
}

function sourceBaseTags(relPath, lightweight) {
  const tags = [];
  if (lightweight) tags.push(METADATA_ONLY_TAG);
  return tags;
}

function isTestSource(relPath) {
  return (
    /(^|\/)(__tests__|test|tests|e2e)(\/|$)/.test(relPath) ||
    /\.(spec|test)\.[cm]?[jt]sx?$/.test(relPath)
  );
}

function classifyMachineSource(relPath, content) {
  const normalized = normalizePath(relPath);
  const lower = normalized.toLowerCase();
  const kinds = [];
  let surface = 'source';
  let risk = 'normal';

  if (normalized.startsWith('frontend/src/') || normalized.startsWith('frontend-admin/')) {
    surface = 'frontend';
  } else if (normalized.startsWith('backend/src/')) {
    surface = 'backend';
  } else if (normalized.startsWith('worker/')) {
    surface = 'worker';
  } else if (normalized.startsWith('scripts/pulse/') || normalized.startsWith('.pulse/')) {
    surface = 'pulse-machine';
  } else if (
    normalized.startsWith('.github/') ||
    normalized.startsWith('ops/') ||
    normalized.startsWith('scripts/ops/') ||
    ['AGENTS.md', 'CLAUDE.md', 'CODEX.md', '.codacy.yml', 'package.json'].includes(normalized)
  ) {
    surface = 'governance';
  }

  if (isTestSource(normalized)) {
    kinds.push('test');
  }
  if (
    /controller\.[cm]?tsx?$/.test(lower) ||
    /@(Controller|Get|Post|Put|Patch|Delete)\b/.test(content || '')
  ) {
    kinds.push('api-controller');
  }
  if (/\.module\.[cm]?tsx?$/.test(lower) || /@Module\b/.test(content || '')) kinds.push('module');
  if (/service\.[cm]?tsx?$/.test(lower) || /@Injectable\b/.test(content || ''))
    kinds.push('service');
  if (
    /\.tsx$/.test(lower) &&
    /(export default function|export function|function [A-Z][A-Za-z0-9_]*|const [A-Z][A-Za-z0-9_]*\s*=)/.test(
      content || '',
    )
  ) {
    kinds.push('ui-component');
  }
  if (/schema\.prisma$/.test(lower) || /\.prisma$/.test(lower)) kinds.push('data-model');
  if (/route\.[cm]?[jt]sx?$/.test(lower) || /page\.[cm]?[jt]sx?$/.test(lower)) {
    kinds.push('frontend-route');
  }

  if (
    /(^|\/)(payments?|wallet|ledger|billing|auth|kyc|webhooks?|prisma|ops|\.github)(\/|$)/.test(
      lower,
    ) ||
    /(^|\/)(package\.json|pnpm-lock\.yaml|\.codacy\.yml|agents\.md|claude\.md|codex\.md)$/.test(
      lower,
    )
  ) {
    risk = 'critical';
  } else if (
    /(^|\/)(whatsapp|worker|queue|meta|tiktok|stripe|mercado-pago|openai|integrations?|mass-send|campaigns?)(\/|$)/.test(
      lower,
    )
  ) {
    risk = 'high';
  }

  return {
    kinds: [...new Set(kinds)],
    surface,
    risk,
  };
}

function activeConstructionTags(machine, gitState, signalTags = []) {
  const tags = [];
  const signalSet = new Set(signalTags);

  if (machine.surface === 'frontend') tags.push(GRAPH_SURFACE_UI_TAG);
  if (machine.surface === 'backend') tags.push(GRAPH_SURFACE_BACKEND_TAG);
  if (machine.surface === 'worker') tags.push(GRAPH_SURFACE_WORKER_TAG);
  if (machine.surface === 'source') tags.push(GRAPH_SURFACE_SOURCE_TAG);
  if (machine.surface === 'governance' || machine.surface === 'pulse-machine') {
    tags.push(GRAPH_GOVERNANCE_TAG);
  }
  if (machine.surface === 'pulse-machine') tags.push(PULSE_MACHINE_TAG);

  if (gitState.dirty) {
    if (machine.risk === 'critical') tags.push(GRAPH_RISK_CRITICAL_TAG);
    if (machine.risk === 'high') tags.push(GRAPH_RISK_HIGH_TAG);
    if (machine.kinds.includes('api-controller')) tags.push(GRAPH_RUNTIME_API_TAG);
  }

  if (signalSet.has(SIGNAL_STATIC_HIGH_TAG) && machine.risk === 'critical') {
    tags.push(GRAPH_RISK_CRITICAL_TAG);
  }
  if (signalSet.has(SIGNAL_HOTSPOT_TAG) && machine.risk === 'high') {
    tags.push(GRAPH_RISK_HIGH_TAG);
  }

  return [...new Set(tags)];
}

function isLightweightMirrorSource(sourcePath) {
  const rel = normalizePath(relative(REPO_ROOT, sourcePath));
  const first = rel.split('/')[0];
  if (
    first === '.agents' ||
    first === '.beads' ||
    first === '.gitnexus' ||
    first === '.kilo' ||
    first === '.omx' ||
    first === '.pulse' ||
    first === '.serena'
  ) {
    return true;
  }

  const name = basename(rel);
  return (
    /^PULSE_.*\.(json|md)$/.test(name) ||
    /^FUNCTIONAL_.*\.md$/.test(name) ||
    name === 'KLOEL_PRODUCT_MAP.md' ||
    name === 'AUDIT_FEATURE_MATRIX.md' ||
    name === 'package-lock.json'
  );
}

function shouldOmitSourceBody(sourcePath, sourceSize) {
  return sourceSize > SOURCE_BODY_MIRROR_MAX_BYTES;
}

function buildMirrorContent(sourcePath, content) {
  const st = statSync(sourcePath);
  const raw = content ?? readFileSync(sourcePath, 'utf8');
  const lang = detectLanguage(sourcePath);
  const relPath = relative(REPO_ROOT, sourcePath);
  const omitSourceBody = shouldOmitSourceBody(sourcePath, st.size);
  const relations = extractInternalRelations(raw, sourcePath);
  const gitState = gitStateForSource(sourcePath);
  const sourceHash = sha256(raw);
  const signalInfo = buildMirrorSignalIndex().get(normalizePath(relPath));
  const machine = classifyMachineSource(normalizePath(relPath), raw);
  const clusterKey = clusterKeyForSource(normalizePath(relPath));
  const visualFacts = extractVisualFacts(
    sourcePath,
    raw,
    machine,
    gitState,
    relations,
    omitSourceBody,
  );
  const signalTags = [...(signalInfo?.tags || [])];
  const visualTags = visualFacts.map(visualFactTag).filter(Boolean);
  const tags = [
    ...(gitState.dirty ? [DIRTY_WORKSPACE_TAG] : []),
    ...sourceBaseTags(normalizePath(relPath), omitSourceBody),
    ...activeConstructionTags(machine, gitState, signalTags),
    ...visualTags,
    ...signalTags,
  ];
  const uniqueTags = [...new Set(tags)];

  const fence = lang || '';
  const lines = [
    `---`,
    `source: ${relPath}`,
    `repo_root: ${REPO_ROOT}`,
    `mirror_format: ${MIRROR_FORMAT_VERSION}`,
    `sha256: ${sourceHash}`,
    `bytes: ${st.size}`,
    `lang: ${lang || 'none'}`,
    `git_dirty: ${gitState.dirty ? 'true' : 'false'}`,
    `git_local_commit: ${gitState.localCommit ? 'true' : 'false'}`,
    `workspace_state: ${gitState.workspaceState}`,
    `mirror_payload: ${omitSourceBody ? 'metadata_only' : 'full_text'}`,
    `machine_surface: ${machine.surface}`,
    `machine_risk: ${machine.risk}`,
    `machine_cluster: ${clusterKey}`,
    ...(machine.kinds.length
      ? ['machine_kinds:', ...machine.kinds.map((kind) => `  - ${kind}`)]
      : []),
    ...(uniqueTags.length > 0 ? ['tags:', ...uniqueTags.map((tag) => `  - ${tag}`)] : []),
    `mirrored: ${new Date().toISOString()}`,
    `internal_links: ${relations.length}`,
    ...(visualFacts.length
      ? ['visual_facts:', ...visualFacts.map((fact) => `  - ${visualFactKey(fact)}`)]
      : []),
    `---`,
    ``,
    `> Source: \`${relPath}\``,
    `> Superficie: \`${machine.surface}\` | Risco: \`${machine.risk}\` | Tipo: \`${machine.kinds.join(', ') || 'source'}\``,
    ``,
    ...buildRelationsSection(relations),
    ...buildVisualFactsSection(visualFacts),
    ...(signalInfo?.details?.length
      ? ['## Sinais reais do codigo', '', ...signalInfo.details.map((detail) => `- ${detail}`), '']
      : []),
    ...(omitSourceBody
      ? [
          '## Payload',
          '',
          'Conteudo omitido do espelho interativo para manter o Obsidian leve.',
          '',
          `Arquivo original: \`${relPath}\``,
          `Bytes: ${st.size}`,
          `SHA-256: \`${sourceHash}\``,
        ]
      : ['```' + fence, raw, '```']),
    '',
  ];

  return lines.join('\n');
}

// ── Scan Source Files ──────────────────────────────────────────────────────

function scanDirectory(dir, entries) {
  try {
    const items = readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
      const full = join(dir, item.name);
      if (item.isDirectory()) {
        if (shouldSkipDir(item.name, full)) continue;
        scanDirectory(full, entries);
      } else if (item.isFile()) {
        if (shouldSkipFile(item.name, full)) continue;
        entries.push(full);
      }
    }
  } catch (e) {
    log('WARN', `Cannot read directory ${relative(REPO_ROOT, dir)}:`, e.message);
  }
}

function collectAllSourceFiles() {
  const entries = [];

  if (existsSync(REPO_ROOT) && statSync(REPO_ROOT).isDirectory()) {
    scanDirectory(REPO_ROOT, entries);
  }

  return entries.sort();
}

// ── Core Mirror Operations ──────────────────────────────────────────────────

function mirrorFile(sourcePath, manifest) {
  const mirrorPath = sourceToMirrorPath(sourcePath);
  const relSource = relative(REPO_ROOT, sourcePath);
  const sourceStat = statSync(sourcePath);

  let content;
  try {
    content = readFileSync(sourcePath, 'utf8');
  } catch (e) {
    log('ERR', `Cannot read source: ${relSource} — ${e.message}`);
    // Remove stale mirror if source can't be read
    if (existsSync(mirrorPath)) {
      unlinkSync(mirrorPath);
      delete manifest.files[relative(SOURCE_MIRROR_DIR, mirrorPath)];
    }
    return { status: 'error', reason: e.message };
  }

  const hash = sha256(content);
  const relMirror = relative(SOURCE_MIRROR_DIR, mirrorPath);
  const existing = manifest.files[relMirror];
  const gitState = gitStateForSource(sourcePath);

  const relations = extractInternalRelations(content, sourcePath);
  const machine = classifyMachineSource(normalizePath(relSource), content);
  const clusterKey = clusterKeyForSource(normalizePath(relSource));
  const visualFacts = extractVisualFacts(
    sourcePath,
    content,
    machine,
    gitState,
    relations,
    shouldOmitSourceBody(sourcePath, sourceStat.size),
  );
  const visualTags = visualFacts.map(visualFactTag).filter(Boolean);

  // Check if file is unchanged and already uses the current graph format.
  if (
    existing &&
    existing.hash === hash &&
    existing.format_version === MIRROR_FORMAT_VERSION &&
    existing.git_dirty === gitState.dirty &&
    existing.git_local_commit === gitState.localCommit &&
    existing.workspace_state === gitState.workspaceState
  ) {
    return { status: 'unchanged' };
  }

  // Build mirror markdown
  const mirrorContent = buildMirrorContent(sourcePath, content);

  // Atomic write
  ensureDir(dirname(mirrorPath));
  const tmp = mirrorPath + '.tmp';
  try {
    writeFileSync(tmp, mirrorContent, 'utf8');
    renameSync(tmp, mirrorPath);
  } catch (e) {
    log('ERR', `Cannot write mirror: ${relMirror} — ${e.message}`);
    try {
      unlinkSync(tmp);
    } catch {
      /* cleanup */
    }
    return { status: 'error', reason: e.message };
  }

  // Update manifest
  const st = statSync(mirrorPath);
  manifest.files[relMirror] = {
    source: relSource,
    hash,
    source_size: sourceStat.size,
    mirror_size: st.size,
    lang: detectLanguage(sourcePath) || 'none',
    git_dirty: gitState.dirty,
    git_local_commit: gitState.localCommit,
    workspace_state: gitState.workspaceState,
    mirror_payload: shouldOmitSourceBody(sourcePath, sourceStat.size)
      ? 'metadata_only'
      : 'full_text',
    machine_surface: machine.surface,
    machine_risk: machine.risk,
    machine_cluster: clusterKey,
    machine_kinds: machine.kinds,
    machine_tags: [
      ...new Set([
        ...sourceBaseTags(
          normalizePath(relSource),
          shouldOmitSourceBody(sourcePath, sourceStat.size),
        ),
        ...activeConstructionTags(machine, gitState),
        ...visualTags,
      ]),
    ],
    format_version: MIRROR_FORMAT_VERSION,
    internal_links: relations.length,
    links_to: relations.map((relation) => relation.source),
    visual_facts: visualFacts.map(visualFactKey),
    updated: new Date().toISOString(),
  };

  return { status: 'updated' };
}

function normalizeGeneratedNoteForCompare(content) {
  return content.replace(/^generated: .+$/gm, 'generated: <stable>');
}

function writeGeneratedNote(relPath, content) {
  const fullPath = join(SOURCE_MIRROR_DIR, relPath);
  ensureDir(dirname(fullPath));
  if (
    existsSync(fullPath) &&
    normalizeGeneratedNoteForCompare(readFileSync(fullPath, 'utf8')) ===
      normalizeGeneratedNoteForCompare(content)
  ) {
    return false;
  }
  const tmp = fullPath + '.tmp';
  writeFileSync(tmp, content, 'utf8');
  renameSync(tmp, fullPath);
  return true;
}

function rewriteMirrorFrontmatterTags(relMirror, tags) {
  const fullPath = join(SOURCE_MIRROR_DIR, relMirror);
  if (!existsSync(fullPath)) return false;

  const content = readFileSync(fullPath, 'utf8');
  if (!content.startsWith('---\n')) return false;

  const end = content.indexOf('\n---\n', 4);
  if (end === -1) return false;

  const frontmatter = content.slice(4, end).split('\n');
  const body = content.slice(end);
  const nextFrontmatter = [];
  let inserted = false;

  for (let index = 0; index < frontmatter.length; index++) {
    const line = frontmatter[index];
    if (line === 'tags:') {
      while (frontmatter[index + 1]?.startsWith('  - ')) index++;
      continue;
    }

    if (!inserted && line.startsWith('mirrored:')) {
      nextFrontmatter.push('tags:', ...tags.map((tag) => `  - ${tag}`));
      inserted = true;
    }

    nextFrontmatter.push(line);
  }

  if (!inserted) {
    nextFrontmatter.push('tags:', ...tags.map((tag) => `  - ${tag}`));
  }

  const next = `---\n${nextFrontmatter.join('\n')}${body}`;
  if (next === content) return false;

  const tmp = `${fullPath}.tmp`;
  writeFileSync(tmp, next, 'utf8');
  renameSync(tmp, fullPath);
  return true;
}

function applyGraphDerivedTags(manifest) {
  const incoming = new Map();
  for (const entry of Object.values(manifest.files)) {
    for (const target of entry.links_to || []) {
      incoming.set(target, (incoming.get(target) || 0) + 1);
    }
  }

  let changed = 0;
  for (const [relMirror, entry] of Object.entries(manifest.files)) {
    const hasNoOutbound = (entry.internal_links || 0) === 0;
    const hasNoInbound = (incoming.get(entry.source) || 0) === 0;
    const tags = new Set(entry.machine_tags || []);

    if (hasNoInbound && hasNoOutbound) {
      tags.add(GRAPH_ORPHAN_TAG);
    } else {
      tags.delete(GRAPH_ORPHAN_TAG);
    }

    const nextTags = [...tags];
    if (JSON.stringify(nextTags) === JSON.stringify(entry.machine_tags || [])) continue;

    entry.machine_tags = nextTags;
    if (rewriteMirrorFrontmatterTags(relMirror, nextTags)) changed++;
  }

  if (changed > 0) {
    log('OK', `Graph derived file tags applied to ${changed} source points.`);
  }
}

function listGeneratedMarkdownRelPaths(rootDir, relPrefix) {
  if (!existsSync(rootDir)) return [];
  const paths = [];
  const stack = [rootDir];
  while (stack.length > 0) {
    const dir = stack.pop();
    let items;
    try {
      items = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const item of items) {
      const full = join(dir, item.name);
      if (item.isDirectory()) {
        stack.push(full);
      } else if (item.isFile() && item.name.endsWith('.md')) {
        paths.push(normalizePath(join(relPrefix, relative(rootDir, full))));
      }
    }
  }
  return paths;
}

function listAllSourceMirrorMarkdownRelPaths() {
  if (!existsSync(SOURCE_MIRROR_DIR)) return [];
  const paths = [];
  const stack = [SOURCE_MIRROR_DIR];
  while (stack.length > 0) {
    const dir = stack.pop();
    let items;
    try {
      items = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const item of items) {
      const full = join(dir, item.name);
      if (item.isDirectory()) {
        stack.push(full);
      } else if (item.isFile() && item.name.endsWith('.md')) {
        paths.push(normalizePath(relative(SOURCE_MIRROR_DIR, full)));
      }
    }
  }
  return paths;
}

function cleanupStaleMirrorFiles(manifest) {
  const expected = new Set(Object.keys(manifest.files).map(normalizePath));
  let removed = 0;
  for (const relPath of listAllSourceMirrorMarkdownRelPaths()) {
    if (expected.has(relPath)) continue;
    try {
      unlinkSync(join(SOURCE_MIRROR_DIR, relPath));
      removed++;
    } catch (e) {
      log('WARN', `Cannot remove stale mirror file ${relPath}:`, e.message);
    }
  }
  return removed;
}

function signalNotePath(source, index) {
  const safeSource = normalizePath(source)
    .replace(/[^a-zA-Z0-9._/-]/g, '-')
    .replace(/\//g, '__');
  return join('_signals', `${String(index).padStart(3, '0')}__${safeSource}.md`);
}

function buildSignalNote(source, bucket, index) {
  const tags = [...bucket.tags].sort();
  return [
    '---',
    'tipo: sinal-operacional',
    `source: ${source}`,
    `generated: ${new Date().toISOString()}`,
    ...(tags.length ? ['tags:', ...tags.map((tag) => `  - ${tag}`)] : []),
    '---',
    '',
    `# Sinal: ${source}`,
    '',
    `Arquivo afetado: ${obsidianLink(sourceToMirrorPath(join(REPO_ROOT, source)), basename(source))}`,
    '',
    '## Evidencias',
    '',
    ...bucket.details.slice(0, 12).map((detail) => `- ${detail}`),
    '',
  ].join('\n');
}

function visualFactTag(fact) {
  if (fact.kind === 'debt') return SIGNAL_STATIC_HIGH_TAG;
  if (fact.kind === 'problem') return GRAPH_ACTION_REQUIRED_TAG;
  if (fact.kind === 'architecture') return SIGNAL_HOTSPOT_TAG;
  if (fact.kind === 'missing') return GRAPH_EVIDENCE_GAP_TAG;
  if (fact.kind === 'computational-effect') {
    if (fact.value === 'auth-or-isolation') return GRAPH_EFFECT_SECURITY_TAG;
    if (fact.value === 'http-server' || fact.value === 'service-logic')
      return GRAPH_EFFECT_ENTRYPOINT_TAG;
    if (
      fact.value === 'database-io' ||
      fact.value === 'database-read' ||
      fact.value === 'database-write'
    )
      return GRAPH_EFFECT_DATA_TAG;
    if (fact.value === 'network-io' || fact.value === 'external-provider')
      return GRAPH_EFFECT_NETWORK_TAG;
    if (fact.value === 'queue-work') return GRAPH_EFFECT_ASYNC_TAG;
    if (fact.value === 'ui-reactivity' || fact.value === 'browser-persistence')
      return GRAPH_EFFECT_STATE_TAG;
    if (fact.value === 'documentation-or-contract' || fact.value === 'type-contract-only')
      return GRAPH_EFFECT_CONTRACT_TAG;
    if (fact.value === 'configuration') return GRAPH_EFFECT_CONFIG_TAG;
    return SIGNAL_HOTSPOT_TAG;
  }
  if (fact.kind === 'effect-intensity') {
    if (String(fact.value).startsWith('async:')) return GRAPH_EFFECT_ASYNC_TAG;
    if (String(fact.value).startsWith('errors:')) return GRAPH_EFFECT_ERROR_TAG;
    return SIGNAL_HOTSPOT_TAG;
  }
  if (fact.kind === 'flow') return GRAPH_PROOF_TEST_TAG;
  if (fact.kind === 'risk' && fact.value === 'critical') return GRAPH_RISK_CRITICAL_TAG;
  if (fact.kind === 'risk' && fact.value === 'high') return GRAPH_RISK_HIGH_TAG;
  if (fact.kind === 'proof') return GRAPH_PROOF_TEST_TAG;
  if (fact.kind === 'route') return GRAPH_RUNTIME_API_TAG;
  if (fact.kind === 'api-call') return GRAPH_RUNTIME_API_TAG;
  if (fact.kind === 'db-op') return GRAPH_RISK_HIGH_TAG;
  if (fact.kind === 'schema') return GRAPH_RISK_CRITICAL_TAG;
  if (fact.kind === 'auth') return GRAPH_RISK_HIGH_TAG;
  if (fact.kind === 'integration') return SIGNAL_EXTERNAL_TAG;
  if (fact.kind === 'surface' && fact.value === 'frontend') return GRAPH_SURFACE_UI_TAG;
  if (fact.kind === 'surface' && fact.value === 'backend') return GRAPH_SURFACE_BACKEND_TAG;
  if (fact.kind === 'surface' && fact.value === 'worker') return GRAPH_SURFACE_WORKER_TAG;
  if (fact.kind === 'surface' && fact.value === 'source') return GRAPH_SURFACE_SOURCE_TAG;
  if (fact.kind === 'surface' && (fact.value === 'governance' || fact.value === 'pulse-machine'))
    return GRAPH_GOVERNANCE_TAG;
  if (fact.kind === 'git-state' && fact.value === 'dirty') return DIRTY_WORKSPACE_TAG;
  if (fact.kind === 'payload' && fact.value === 'metadata-only') return METADATA_ONLY_TAG;
  return null;
}

function buildVisualFactNote(fact, sources) {
  const tag = visualFactTag(fact);
  const uniqueSources = [...new Set(sources)].sort();
  const tags = [...new Set([tag || GRAPH_MOLECULE_TAG, GRAPH_MOLECULE_TAG].filter(Boolean))];
  return [
    '---',
    'tipo: comportamento-visual-do-codigo',
    `kind: ${fact.kind}`,
    `value: ${fact.value}`,
    `source_count: ${uniqueSources.length}`,
    'tags:',
    ...tags.map((item) => `  - ${item}`),
    `generated: ${new Date().toISOString()}`,
    '---',
    '',
    `# ${fact.label || fact.value}`,
    '',
    'Fato visual emitido automaticamente pelo conteudo do codigo.',
    '',
    '## Arquivos que emitem este comportamento',
    '',
    ...uniqueSources
      .slice(0, 400)
      .map((source) => `- ${obsidianLink(sourceToMirrorPath(join(REPO_ROOT, source)), source)}`),
    ...(uniqueSources.length > 400
      ? [`- ... ${uniqueSources.length - 400} arquivo(s) omitidos desta nota`]
      : []),
    '',
  ].join('\n');
}

function cameraRelPath(name) {
  return join(CAMERA_DIR, `${name}.md`);
}

function buildCameraNote(name, title, tag, factBuckets, limit = 80) {
  const buckets = factBuckets
    .filter(Boolean)
    .filter((bucket) => bucket.sources.length > 0)
    .sort(
      (a, b) =>
        b.sources.length - a.sources.length ||
        visualFactKey(a.fact).localeCompare(visualFactKey(b.fact)),
    )
    .slice(0, limit);
  return [
    '---',
    'tipo: camera-computacional',
    `camera: ${name}`,
    `total_signals: ${buckets.length}`,
    `generated: ${new Date().toISOString()}`,
    'tags:',
    `  - ${tag}`,
    `  - ${GRAPH_SECTOR_TAG}`,
    '---',
    '',
    `# ${title}`,
    '',
    ...buckets.flatMap((bucket) => [
      `- ${visualFactLink(bucket.fact)} (${bucket.sources.length})`,
      ...bucket.sources
        .slice(0, 12)
        .map(
          (source) => `  - ${obsidianLink(sourceToMirrorPath(join(REPO_ROOT, source)), source)}`,
        ),
    ]),
    '',
  ].join('\n');
}

function buildCameraRootNote(cameraNotes) {
  return [
    '---',
    'tipo: camera-computacional-raiz',
    `generated: ${new Date().toISOString()}`,
    'tags:',
    `  - ${GRAPH_SECTOR_TAG}`,
    '---',
    '',
    '# Camera da computacao',
    '',
    ...cameraNotes.map(
      (note) => `- ${obsidianLink(join(SOURCE_MIRROR_DIR, cameraRelPath(note.name)), note.title)}`,
    ),
    '',
  ].join('\n');
}

function writeCameraIndexes(facts) {
  const buckets = [...facts.values()];
  const byKind = (kind) => buckets.filter((bucket) => bucket.fact.kind === kind);
  const byKinds = (...kinds) => buckets.filter((bucket) => kinds.includes(bucket.fact.kind));
  const cameraNotes = [
    {
      name: '00-problemas',
      title: 'Problemas que aparecem no print',
      tag: SIGNAL_STATIC_HIGH_TAG,
      buckets: byKinds('problem', 'missing', 'debt'),
    },
    {
      name: '01-arquitetura',
      title: 'Arquitetura e isolamento',
      tag: SIGNAL_HOTSPOT_TAG,
      buckets: byKind('architecture'),
    },
    {
      name: '02-fluxos-vivos',
      title: 'Fluxos vivos e comprovados',
      tag: GRAPH_PROOF_TEST_TAG,
      buckets: byKind('flow'),
    },
    {
      name: '03-efeito-computacional',
      title: 'Efeito computacional runtime',
      tag: SIGNAL_HOTSPOT_TAG,
      buckets: byKinds('computational-effect', 'effect-intensity'),
    },
    {
      name: '04-superficies',
      title: 'Superficies da maquina',
      tag: GRAPH_SECTOR_TAG,
      buckets: byKinds('surface', 'risk', 'kind'),
    },
    {
      name: '05-contratos',
      title: 'Contratos, rotas, schema e chamadas',
      tag: GRAPH_RUNTIME_API_TAG,
      buckets: byKinds('route', 'api-call', 'db-op', 'schema', 'auth', 'symbol'),
    },
  ];

  const expected = new Set([normalizePath(cameraRelPath('CAMERA'))]);
  writeGeneratedNote(cameraRelPath('CAMERA'), buildCameraRootNote(cameraNotes));
  for (const note of cameraNotes) {
    const relPath = normalizePath(cameraRelPath(note.name));
    expected.add(relPath);
    writeGeneratedNote(relPath, buildCameraNote(note.name, note.title, note.tag, note.buckets));
  }

  const cameraRoot = join(SOURCE_MIRROR_DIR, CAMERA_DIR);
  for (const relPath of listGeneratedMarkdownRelPaths(cameraRoot, CAMERA_DIR)) {
    if (expected.has(relPath)) continue;
    try {
      unlinkSync(join(SOURCE_MIRROR_DIR, relPath));
    } catch (e) {
      log('WARN', `Cannot remove stale camera note ${relPath}:`, e.message);
    }
  }
}

function removeGeneratedGraphOverlays() {
  for (const dirName of [
    VISUAL_FACT_DIR,
    CAMERA_DIR,
    MACHINE_DIR,
    CLUSTER_DIR,
    '_signals',
    '_domains',
    '_git',
  ]) {
    const dirPath = join(SOURCE_MIRROR_DIR, dirName);
    if (!existsSync(dirPath)) continue;
    try {
      rmSync(dirPath, { recursive: true, force: true });
    } catch (e) {
      log('WARN', `Cannot remove generated graph overlay ${dirName}:`, e.message);
    }
  }
}

function writeSignalNotes() {
  const signalRoot = join(SOURCE_MIRROR_DIR, '_signals');
  ensureDir(signalRoot);

  const signalEntries = [...buildMirrorSignalIndex().entries()]
    .filter(([, bucket]) => bucket.tags.size > 0 && bucket.details.length > 0)
    .sort((a, b) => a[0].localeCompare(b[0]));

  const expected = new Set();
  signalEntries.forEach(([source, bucket], index) => {
    const relPath = signalNotePath(source, index + 1);
    expected.add(normalizePath(relPath));
    writeGeneratedNote(relPath, buildSignalNote(source, bucket, index + 1));
  });

  for (const relPath of listGeneratedMarkdownRelPaths(signalRoot, '_signals')) {
    if (expected.has(relPath)) continue;
    try {
      unlinkSync(join(SOURCE_MIRROR_DIR, relPath));
    } catch (e) {
      log('WARN', `Cannot remove stale signal note ${relPath}:`, e.message);
    }
  }
}

function writeDomainIndexes(manifest) {
  const entries = Object.values(manifest.files)
    .filter((entry) => entry.source)
    .sort((a, b) => a.source.localeCompare(b.source));
  const domains = new Map();
  for (const entry of entries) {
    const domain = domainForSource(entry.source);
    const bucket = domains.get(domain) || [];
    bucket.push(entry);
    domains.set(domain, bucket);
  }

  const expected = new Set(['INDEX.md']);
  writeGeneratedNote('INDEX.md', buildGeneratedIndex(manifest));

  for (const [domain, domainEntries] of [...domains.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    const domainRel = normalizePath(join('_domains', `${domain}.md`));
    expected.add(domainRel);
    writeGeneratedNote(domainRel, buildDomainNote(domain, domainEntries));

    const pages = paginate(domainEntries);
    pages.forEach((pageEntries, index) => {
      const pageRel = normalizePath(domainPageRelPath(domain, index + 1));
      expected.add(pageRel);
      writeGeneratedNote(
        pageRel,
        buildDomainPageNote(domain, pageEntries, index + 1, pages.length),
      );
    });
  }

  const domainRoot = join(SOURCE_MIRROR_DIR, '_domains');
  for (const relPath of listGeneratedMarkdownRelPaths(domainRoot, '_domains')) {
    if (expected.has(relPath)) continue;
    try {
      unlinkSync(join(SOURCE_MIRROR_DIR, relPath));
    } catch (e) {
      log('WARN', `Cannot remove stale domain note ${relPath}:`, e.message);
    }
  }
}

function domainForSource(sourcePath) {
  const [first, second] = normalizePath(sourcePath).split('/');
  if (!second) return 'root';
  if (first === '.') return 'root';
  return first;
}

function domainNoteLink(domain) {
  return obsidianLink(join(SOURCE_MIRROR_DIR, '_domains', `${domain}.md`), domain);
}

function sourceEntryLink(entry) {
  return obsidianLink(sourceToMirrorPath(join(REPO_ROOT, entry.source)), basename(entry.source));
}

function plainDomainLabel(domain) {
  return `\`${domain}\``;
}

function plainSourceLabel(entry) {
  return `\`${entry.source}\``;
}

function sourceMirrorExistsInManifest(manifest, source) {
  return Object.values(manifest.files).some((entry) => entry.source === source);
}

function dirtyDeletedNoteRelPath(source) {
  return join(DIRTY_DELETED_DIR, `${source}.md`);
}

function buildDirtyDeletedNote(source) {
  return [
    '---',
    'tipo: espelho-git-dirty',
    'status: DIRTY',
    `source: ${source}`,
    `repo_root: ${REPO_ROOT}`,
    `mirror_format: ${MIRROR_FORMAT_VERSION}`,
    'git_dirty: true',
    'git_local_commit: false',
    'workspace_state: DIRTY_DELETED',
    'tags:',
    `  - ${DIRTY_WORKSPACE_TAG}`,
    `generated: ${new Date().toISOString()}`,
    '---',
    '',
    '# Arquivo removido com diff nao commitado',
    '',
    `Source: \`${source}\``,
    '',
    DIRTY_WORKSPACE_TAG.startsWith('#') ? DIRTY_WORKSPACE_TAG : `#${DIRTY_WORKSPACE_TAG}`,
    '',
    'Este no existe para representar um arquivo removido enquanto a delecao ainda nao foi commitada.',
    '',
  ].join('\n');
}

function buildGeneratedIndex(manifest) {
  const entries = Object.values(manifest.files)
    .filter((entry) => entry.source)
    .sort((a, b) => a.source.localeCompare(b.source));
  const domains = new Map();
  for (const entry of entries) {
    const domain = domainForSource(entry.source);
    domains.set(domain, (domains.get(domain) || 0) + 1);
  }

  return [
    '---',
    'tipo: espelho-dinamico',
    'status: SINCRONIZADO',
    `repo_root: ${REPO_ROOT}`,
    `mirror_format: ${MIRROR_FORMAT_VERSION}`,
    `total_sources: ${entries.length}`,
    `generated: ${new Date().toISOString()}`,
    '---',
    '',
    '# Workspace completo',
    '',
    `Repo: \`${REPO_ROOT}\``,
    '',
    '## Dominios',
    '',
    ...[...domains.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([domain, count]) => `- ${domainNoteLink(domain)} (${count})`),
    '',
  ].join('\n');
}

function domainPageRelPath(domain, pageIndex) {
  return join('_domains', '_pages', domain, `${String(pageIndex).padStart(3, '0')}.md`);
}

function paginate(entries, pageSize = GENERATED_PAGE_SIZE) {
  const pages = [];
  for (let index = 0; index < entries.length; index += pageSize) {
    pages.push(entries.slice(index, index + pageSize));
  }
  return pages.length ? pages : [[]];
}

function buildDomainNote(domain, entries) {
  const sorted = entries.sort((a, b) => a.source.localeCompare(b.source));
  const pages = paginate(sorted);
  return [
    '---',
    'tipo: espelho-dominio',
    'status: SINCRONIZADO',
    `dominio: ${domain}`,
    `total_sources: ${sorted.length}`,
    `pages: ${pages.length}`,
    `generated: ${new Date().toISOString()}`,
    '---',
    '',
    `# ${domain}`,
    '',
    ...pages.map((page, index) => {
      const first = page[0]?.source || 'vazio';
      const last = page[page.length - 1]?.source || 'vazio';
      const pageRel = domainPageRelPath(domain, index + 1);
      return `- ${obsidianLink(join(SOURCE_MIRROR_DIR, pageRel), `${domain} ${index + 1}`)} (${page.length}) \`${first}\` -> \`${last}\``;
    }),
    '',
    'Este no mantem o dominio navegavel sem criar um hub unico com milhares de arestas.',
    '',
  ].join('\n');
}

function buildDomainPageNote(domain, pageEntries, pageIndex, totalPages) {
  const sorted = pageEntries.sort((a, b) => a.source.localeCompare(b.source));
  return [
    '---',
    'tipo: espelho-dominio-pagina',
    'status: SINCRONIZADO',
    `dominio: ${domain}`,
    `page: ${pageIndex}`,
    `pages: ${totalPages}`,
    `total_sources: ${sorted.length}`,
    `generated: ${new Date().toISOString()}`,
    '---',
    '',
    `# ${domain} / pagina ${pageIndex}`,
    '',
    `Dominio: ${domainNoteLink(domain)}`,
    '',
    ...sorted.map((entry) => `- ${sourceEntryLink(entry)} \`${entry.source}\``),
    '',
  ].join('\n');
}

function machineHubRelPath(key) {
  return join(MACHINE_DIR, `${key}.md`);
}

function machinePageRelPath(key, pageIndex) {
  return join(MACHINE_DIR, '_pages', key, `${String(pageIndex).padStart(3, '0')}.md`);
}

function entryTags(entry) {
  return Array.isArray(entry.machine_tags) ? entry.machine_tags : [];
}

function entryHasTag(entry, tag) {
  return (
    entryTags(entry).includes(tag) ||
    (tag === DIRTY_WORKSPACE_TAG && entry.git_dirty) ||
    (tag === LOCAL_COMMIT_TAG && entry.git_local_commit)
  );
}

function buildIncomingCount(entries) {
  const incoming = new Map();
  for (const entry of entries) incoming.set(entry.source, 0);
  for (const entry of entries) {
    for (const target of entry.links_to || []) {
      incoming.set(target, (incoming.get(target) || 0) + 1);
    }
  }
  return incoming;
}

function buildMachineHubNote(key, title, description, tags, entries) {
  const sorted = [...entries].sort((a, b) => a.source.localeCompare(b.source));
  const pages = paginate(sorted);
  const activeTags = tags.filter((tag) => sorted.some((entry) => entryHasTag(entry, tag)));
  return [
    '---',
    'tipo: maquina-codigo',
    `machine_key: ${key}`,
    `total_sources: ${sorted.length}`,
    `pages: ${pages.length}`,
    `generated: ${new Date().toISOString()}`,
    'tags:',
    `  - ${GRAPH_SECTOR_TAG}`,
    ...activeTags.map((tag) => `  - ${tag}`),
    '---',
    '',
    `# ${title}`,
    '',
    description,
    '',
    ...pages.map((page, index) => {
      const first = page[0]?.source || 'vazio';
      const last = page[page.length - 1]?.source || 'vazio';
      const relPath = machinePageRelPath(key, index + 1);
      return `- ${obsidianLink(join(SOURCE_MIRROR_DIR, relPath), `${title} ${index + 1}`)} (${page.length}) \`${first}\` -> \`${last}\``;
    }),
    '',
  ].join('\n');
}

function buildMachinePageNote(key, title, tags, pageEntries, pageIndex, totalPages) {
  const sorted = [...pageEntries].sort((a, b) => a.source.localeCompare(b.source));
  const activeTags = tags.filter((tag) => sorted.some((entry) => entryHasTag(entry, tag)));
  return [
    '---',
    'tipo: maquina-codigo-pagina',
    `machine_key: ${key}`,
    `page: ${pageIndex}`,
    `pages: ${totalPages}`,
    `total_sources: ${sorted.length}`,
    `generated: ${new Date().toISOString()}`,
    'tags:',
    `  - ${GRAPH_SECTOR_TAG}`,
    ...activeTags.map((tag) => `  - ${tag}`),
    '---',
    '',
    `# ${title} / pagina ${pageIndex}`,
    '',
    `Mapa: ${obsidianLink(join(SOURCE_MIRROR_DIR, machineHubRelPath(key)), title)}`,
    '',
    ...sorted.map((entry) => {
      const state = entry.workspace_state || 'NO_LOCAL_DIFF';
      const risk = entry.machine_risk || 'normal';
      const kinds = (entry.machine_kinds || []).join(', ') || 'source';
      return `- ${sourceEntryLink(entry)} \`${entry.source}\` | \`${state}\` | \`${risk}\` | \`${kinds}\``;
    }),
    '',
  ].join('\n');
}

function writeMachineCategory(expected, key, title, description, tags, entries) {
  const sorted = [...entries].sort((a, b) => a.source.localeCompare(b.source));
  const hubRel = normalizePath(machineHubRelPath(key));
  expected.add(hubRel);
  writeGeneratedNote(hubRel, buildMachineHubNote(key, title, description, tags, sorted));

  const pages = paginate(sorted);
  pages.forEach((page, index) => {
    const pageRel = normalizePath(machinePageRelPath(key, index + 1));
    expected.add(pageRel);
    writeGeneratedNote(
      pageRel,
      buildMachinePageNote(key, title, tags, page, index + 1, pages.length),
    );
  });
}

function buildMachineMainNote(categories) {
  const totalSources = categories.reduce((sum, category) => sum + category.entries.length, 0);
  return [
    '---',
    'tipo: maquina-codigo-raiz',
    `repo_root: ${REPO_ROOT}`,
    `total_views: ${categories.length}`,
    `total_category_memberships: ${totalSources}`,
    `generated: ${new Date().toISOString()}`,
    'tags:',
    `  - ${GRAPH_SECTOR_TAG}`,
    '---',
    '',
    '# Maquina materializada',
    '',
    'Este e o indice operacional do unico Graph interativo do Obsidian: arquivos reais, estados reais, risco real, provas reais e superficies reais.',
    '',
    ...categories.map(
      (category) =>
        `- ${obsidianLink(join(SOURCE_MIRROR_DIR, machineHubRelPath(category.key)), category.title)} (${category.entries.length})`,
    ),
    '',
  ].join('\n');
}

function writeMachineIndexes(manifest) {
  const entries = Object.values(manifest.files)
    .filter((entry) => entry.source)
    .sort((a, b) => a.source.localeCompare(b.source));
  const incoming = buildIncomingCount(entries);
  const categories = [
    {
      key: 'workspace-sujo',
      title: 'Workspace sujo',
      description:
        'Arquivos tocados e ainda nao commitados. Amarelo e prioridade absoluta para multiagentes nao se sobreporem.',
      tags: [DIRTY_WORKSPACE_TAG],
      entries: entries.filter((entry) => entry.git_dirty),
    },
    {
      key: 'risco-critico',
      title: 'Risco critico',
      description:
        'Superficies onde erro pode quebrar dinheiro, auth, dados, governanca, CI/CD ou contratos centrais.',
      tags: [GRAPH_RISK_CRITICAL_TAG],
      entries: entries.filter((entry) => entry.machine_risk === 'critical'),
    },
    {
      key: 'risco-alto',
      title: 'Risco alto',
      description:
        'Superficies operacionais sensiveis: WhatsApp, filas, provedores externos e automacoes runtime.',
      tags: [GRAPH_RISK_HIGH_TAG],
      entries: entries.filter((entry) => entry.machine_risk === 'high'),
    },
    {
      key: 'runtime-api',
      title: 'Runtime API',
      description: 'Controllers, rotas e superficies HTTP/runtime expostas pela maquina.',
      tags: [GRAPH_RUNTIME_API_TAG],
      entries: entries.filter((entry) => (entry.machine_kinds || []).includes('api-controller')),
    },
    {
      key: 'ui-frontend',
      title: 'UI frontend',
      description: 'Telas, componentes e rotas que materializam a maquina para humanos.',
      tags: [GRAPH_SURFACE_UI_TAG],
      entries: entries.filter((entry) => entry.machine_surface === 'frontend'),
    },
    {
      key: 'provas-testes',
      title: 'Provas e testes',
      description: 'Arquivos de teste e validacao que provam comportamento da maquina.',
      tags: [GRAPH_PROOF_TEST_TAG],
      entries: entries.filter((entry) => (entry.machine_kinds || []).includes('test')),
    },
    {
      key: 'pulse-maquina',
      title: 'PULSE maquina',
      description: 'Arquivos da maquina PULSE e artefatos de autonomia/observabilidade.',
      tags: [PULSE_MACHINE_TAG, GRAPH_GOVERNANCE_TAG],
      entries: entries.filter((entry) => entry.machine_surface === 'pulse-machine'),
    },
    {
      key: 'governanca',
      title: 'Governanca',
      description:
        'Guardrails, contratos e superficies protegidas que impedem gambiarra e perda de controle.',
      tags: [GRAPH_GOVERNANCE_TAG],
      entries: entries.filter((entry) => entry.machine_surface === 'governance'),
    },
    {
      key: 'ilhas-sem-conexao',
      title: 'Ilhas sem conexao',
      description:
        'Arquivos sem arestas internas detectadas nem entrada conhecida. Podem ser folhas legitimas, debt ou codigo invisivel para o grafo.',
      tags: [GRAPH_ORPHAN_TAG],
      entries: entries.filter(
        (entry) => (entry.internal_links || 0) === 0 && (incoming.get(entry.source) || 0) === 0,
      ),
    },
  ];

  const expected = new Set();
  const mainRel = normalizePath(join(MACHINE_DIR, 'MAQUINA.md'));
  expected.add(mainRel);
  writeGeneratedNote(mainRel, buildMachineMainNote(categories));
  for (const category of categories) {
    writeMachineCategory(
      expected,
      category.key,
      category.title,
      category.description,
      category.tags,
      category.entries,
    );
  }

  const machineRoot = join(SOURCE_MIRROR_DIR, MACHINE_DIR);
  for (const relPath of listGeneratedMarkdownRelPaths(machineRoot, MACHINE_DIR)) {
    if (expected.has(relPath)) continue;
    try {
      unlinkSync(join(SOURCE_MIRROR_DIR, relPath));
    } catch (e) {
      log('WARN', `Cannot remove stale machine note ${relPath}:`, e.message);
    }
  }
}

function buildClusterIndexes(entries) {
  const clusters = new Map();
  for (const entry of entries) {
    const key = entry.machine_cluster || clusterKeyForSource(entry.source);
    let cluster = clusters.get(key);
    if (!cluster) {
      cluster = { key, entries: [], linksTo: new Set() };
      clusters.set(key, cluster);
    }
    cluster.entries.push(entry);
  }

  for (const cluster of clusters.values()) {
    for (const entry of cluster.entries) {
      for (const target of entry.links_to || []) {
        const targetKey = clusters.has(clusterKeyForSource(target))
          ? clusterKeyForSource(target)
          : null;
        if (targetKey && targetKey !== cluster.key) {
          cluster.linksTo.add(targetKey);
        }
      }
    }
  }
  return clusters;
}

function buildClusterNote(cluster, clusters) {
  const sorted = [...cluster.entries].sort((a, b) => a.source.localeCompare(b.source));
  const linkedClusters = [...cluster.linksTo].filter((key) => clusters.has(key)).sort();
  return [
    '---',
    'tipo: molecula-codigo',
    `cluster: ${cluster.key}`,
    `total_sources: ${sorted.length}`,
    `total_cluster_links: ${linkedClusters.length}`,
    `generated: ${new Date().toISOString()}`,
    'tags:',
    `  - ${GRAPH_MOLECULE_TAG}`,
    '---',
    '',
    `# ${clusterTitleForKey(cluster.key)}`,
    '',
    '## Pontes para outras moleculas',
    '',
    ...(linkedClusters.length
      ? linkedClusters.map((key) => `- ${clusterLink(key)}`)
      : ['Nenhuma ponte externa detectada.']),
    '',
    '## Arquivos desta molecula',
    '',
    ...sorted.map((entry) => `- ${sourceEntryLink(entry)} \`${entry.source}\``),
    '',
  ].join('\n');
}

function writeClusterIndexes(manifest) {
  const entries = Object.values(manifest.files)
    .filter((entry) => entry.source)
    .sort((a, b) => a.source.localeCompare(b.source));
  const clusters = buildClusterIndexes(entries);
  const expected = new Set();
  for (const cluster of [...clusters.values()].sort((a, b) => a.key.localeCompare(b.key))) {
    const relPath = normalizePath(clusterRelPath(cluster.key));
    expected.add(relPath);
    writeGeneratedNote(relPath, buildClusterNote(cluster, clusters));
  }

  const clusterRoot = join(SOURCE_MIRROR_DIR, CLUSTER_DIR);
  for (const relPath of listGeneratedMarkdownRelPaths(clusterRoot, CLUSTER_DIR)) {
    if (expected.has(relPath)) continue;
    try {
      unlinkSync(join(SOURCE_MIRROR_DIR, relPath));
    } catch (e) {
      log('WARN', `Cannot remove stale cluster note ${relPath}:`, e.message);
    }
  }
}

function writeGeneratedIndexes(manifest) {
  // Disabled: generated artifacts (_visual, _clusters, _signals, _machine, _domains) inflate Obsidian graph
  // with 29k+ non-source files. Only source-code mirror is needed for architectural diagnosis.
  removeGeneratedGraphOverlays();
  applyGraphDerivedTags(manifest);
  return;
  removeGeneratedGraphOverlays();
  applyGraphDerivedTags(manifest);
  writeSignalNotes();
  writeDomainIndexes(manifest);
  writeMachineIndexes(manifest);
  writeClusterIndexes(manifest);

  const facts = new Map();
  const entries = Object.values(manifest.files);
  const sourceSet = new Set(entries.map((entry) => entry.source));
  const incoming = new Map();
  for (const entry of entries) {
    for (const target of entry.links_to || []) {
      incoming.set(target, (incoming.get(target) || 0) + 1);
    }
  }
  const testSources = entries
    .filter((entry) => isTestSource(entry.source))
    .map((entry) => entry.source);
  const factsBySource = new Map();
  const factValuesByKind = (entry, kind) =>
    (factsBySource.get(entry.source) || [])
      .filter((fact) => fact.kind === kind)
      .map((fact) => fact.value);
  const addFactSource = (fact, source) => {
    const key = visualFactKey(fact);
    const bucket = facts.get(key) || {
      fact,
      sources: [],
    };
    bucket.sources.push(source);
    facts.set(key, bucket);
  };
  const parseEntryFacts = (entry) => {
    const parsed = [];
    for (const key of entry.visual_facts || []) {
      const [kind, ...valueParts] = String(key).split(':');
      const value = valueParts.join(':');
      if (!kind || !value) continue;
      parsed.push({
        kind,
        value,
        label: value,
      });
    }
    return parsed;
  };
  const hasNearbyTest = (entry) => {
    if (isTestSource(entry.source)) return true;
    const source = entry.source;
    const ext = extname(source);
    const withoutExt = ext ? source.slice(0, -ext.length) : source;
    const candidates = [
      `${withoutExt}.spec${ext}`,
      `${withoutExt}.test${ext}`,
      `${dirname(source)}/__tests__/${basename(withoutExt)}.spec${ext}`,
      `${dirname(source)}/__tests__/${basename(withoutExt)}.test${ext}`,
    ].map(normalizePath);
    if (candidates.some((candidate) => sourceSet.has(candidate))) return true;
    const stem = basename(withoutExt).replace(
      /\.(controller|service|module|dto|route|page|component)$/i,
      '',
    );
    return testSources.some((testSource) => testSource.includes(stem) && stem.length > 3);
  };
  const routePath = (value) => normalizeHttpPath(String(value || '').replace(/^[A-Z]+\s+/, ''));
  const backendRoutePaths = new Set();
  const frontendCallPaths = new Set();

  for (const entry of entries) {
    const parsed = parseEntryFacts(entry);
    factsBySource.set(entry.source, parsed);
    for (const fact of parsed) {
      if (fact.kind === 'route') backendRoutePaths.add(routePath(fact.value));
      if (fact.kind === 'api-call') frontendCallPaths.add(routePath(fact.value));
    }
  }

  for (const entry of entries) {
    for (const fact of factsBySource.get(entry.source) || []) {
      addFactSource(fact, entry.source);
    }

    const isExecutableSource =
      /^(backend\/src|frontend\/src|frontend-admin\/src|worker\/|scripts\/pulse\/)/.test(
        entry.source,
      ) && !isTestSource(entry.source);
    const isGeneratedRuntimeArtifact =
      /^(\.pulse|\.gitnexus|\.agents|\.kilo|\.omx|\.serena)\//.test(entry.source);
    const inboundCount = incoming.get(entry.source) || 0;
    const computationalEffects = new Set(factValuesByKind(entry, 'computational-effect'));
    const hasServiceDependency = (entry.links_to || []).some((target) =>
      /service\.[cm]?[jt]s$/.test(target),
    );
    const hasRuntimeSideEffect = [
      'database-io',
      'database-read',
      'database-write',
      'network-io',
      'browser-persistence',
      'queue-work',
      'external-provider',
      'http-server',
      'ui-reactivity',
    ].some((effect) => computationalEffects.has(effect));
    if (inboundCount === 0 && !isGeneratedRuntimeArtifact) {
      addFactSource(
        {
          kind: 'architecture',
          value: 'no-known-inbound-link',
          label: 'Sem entrada conhecida no grafo de codigo',
        },
        entry.source,
      );
    }
    if ((entry.internal_links || 0) === 0 && !isGeneratedRuntimeArtifact) {
      addFactSource(
        {
          kind: 'architecture',
          value: 'no-known-outbound-link',
          label: 'Sem saida conhecida no grafo de codigo',
        },
        entry.source,
      );
    }
    if (isExecutableSource && inboundCount === 0 && (entry.internal_links || 0) === 0) {
      addFactSource(
        {
          kind: 'architecture',
          value: 'isolated-code-island',
          label: 'Arquivo isolado sem entrada nem saida',
        },
        entry.source,
      );
    }
    if (isExecutableSource && !hasNearbyTest(entry)) {
      addFactSource(
        {
          kind: 'missing',
          value: 'nearby-test',
          label: 'Sem teste proximo detectado',
        },
        entry.source,
      );
    }
    if ((entry.machine_kinds || []).includes('api-controller') && !hasNearbyTest(entry)) {
      addFactSource(
        {
          kind: 'problem',
          value: 'api-controller-without-nearby-test',
          label: 'Controller API sem teste proximo',
        },
        entry.source,
      );
    }
    if (entry.machine_risk === 'critical' && !hasNearbyTest(entry)) {
      addFactSource(
        {
          kind: 'problem',
          value: 'critical-source-without-nearby-test',
          label: 'Superficie critica sem teste proximo',
        },
        entry.source,
      );
    }
    if (entry.git_dirty && entry.machine_risk === 'critical') {
      addFactSource(
        {
          kind: 'problem',
          value: 'dirty-critical-surface',
          label: 'Superficie critica suja',
        },
        entry.source,
      );
    }
    if (entry.mirror_payload === 'metadata_only' && isExecutableSource) {
      addFactSource(
        {
          kind: 'problem',
          value: 'executable-source-metadata-only',
          label: 'Codigo executavel sem payload completo no espelho',
        },
        entry.source,
      );
    }
    for (const route of entry.source.startsWith('backend/src/') &&
    (entry.machine_kinds || []).includes('api-controller')
      ? factValuesByKind(entry, 'route')
      : []) {
      if (!frontendCallPaths.has(routePath(route))) {
        addFactSource(
          {
            kind: 'problem',
            value: 'route-without-frontend-consumer',
            label: 'Rota backend sem consumidor frontend detectado',
          },
          entry.source,
        );
      } else {
        addFactSource(
          {
            kind: 'flow',
            value: 'backend-route-has-frontend-consumer',
            label: 'Rota backend consumida pelo frontend',
          },
          entry.source,
        );
      }
    }
    for (const call of entry.source.startsWith('frontend/src/')
      ? factValuesByKind(entry, 'api-call')
      : []) {
      if (!backendRoutePaths.has(routePath(call))) {
        addFactSource(
          {
            kind: 'problem',
            value: 'frontend-call-without-backend-route',
            label: 'Chamada frontend sem rota backend detectada',
          },
          entry.source,
        );
      } else {
        addFactSource(
          {
            kind: 'flow',
            value: 'frontend-call-has-backend-route',
            label: 'Chamada frontend encontra rota backend',
          },
          entry.source,
        );
      }
    }
    if (
      entry.source.startsWith('backend/src/') &&
      (entry.machine_kinds || []).includes('api-controller')
    ) {
      if (hasServiceDependency || computationalEffects.has('database-io')) {
        addFactSource(
          {
            kind: 'flow',
            value: 'controller-reaches-service-or-data',
            label: 'Controller alcanca service ou dados',
          },
          entry.source,
        );
      } else {
        addFactSource(
          {
            kind: 'problem',
            value: 'controller-without-visible-execution-chain',
            label: 'Controller sem cadeia visivel de execucao',
          },
          entry.source,
        );
      }
    }
    if (
      entry.source.startsWith('backend/src/') &&
      (entry.machine_kinds || []).includes('service')
    ) {
      if (hasRuntimeSideEffect) {
        addFactSource(
          {
            kind: 'flow',
            value: 'service-has-runtime-side-effect',
            label: 'Service tem efeito runtime visivel',
          },
          entry.source,
        );
      } else {
        addFactSource(
          {
            kind: 'problem',
            value: 'service-without-visible-runtime-effect',
            label: 'Service sem efeito runtime visivel',
          },
          entry.source,
        );
      }
    }
    if (
      entry.source.startsWith('frontend/src/') &&
      (entry.machine_kinds || []).includes('ui-component')
    ) {
      if (computationalEffects.has('ui-reactivity') || computationalEffects.has('network-io')) {
        addFactSource(
          {
            kind: 'flow',
            value: 'ui-has-state-or-io',
            label: 'UI tem estado ou I/O visivel',
          },
          entry.source,
        );
      } else {
        addFactSource(
          {
            kind: 'architecture',
            value: 'static-ui-shell',
            label: 'UI sem estado ou I/O visivel',
          },
          entry.source,
        );
      }
    }
    if (isTestSource(entry.source)) {
      if ((entry.internal_links || 0) > 0) {
        addFactSource(
          {
            kind: 'flow',
            value: 'proof-links-to-target',
            label: 'Prova/teste aponta para alvo',
          },
          entry.source,
        );
      } else {
        addFactSource(
          {
            kind: 'problem',
            value: 'proof-without-target-link',
            label: 'Prova/teste sem alvo visivel',
          },
          entry.source,
        );
      }
    }
    const dbOps = factValuesByKind(entry, 'db-op');
    const isDbWriter = dbOps.some((operation) =>
      /\.(create|createMany|update|updateMany|upsert|delete|deleteMany)$/.test(operation),
    );
    if (isExecutableSource && isDbWriter && factValuesByKind(entry, 'isolation-key').length === 0) {
      addFactSource(
        {
          kind: 'problem',
          value: 'db-write-without-visible-tenant-key',
          label: 'Escrita DB sem chave de isolamento visivel',
        },
        entry.source,
      );
    }
    if (
      entry.source.startsWith('backend/src/') &&
      (entry.machine_kinds || []).includes('api-controller') &&
      !isTestSource(entry.source) &&
      factValuesByKind(entry, 'auth').includes('controller-auth-implicit')
    ) {
      addFactSource(
        {
          kind: 'problem',
          value: 'controller-auth-implicit',
          label: 'Controller sem guard/public explicito',
        },
        entry.source,
      );
    }
  }

  const expected = new Set();
  for (const bucket of facts.values()) {
    const relPath = normalizePath(visualFactRelPath(bucket.fact));
    expected.add(relPath);
    writeGeneratedNote(relPath, buildVisualFactNote(bucket.fact, bucket.sources));
  }
  writeCameraIndexes(facts);

  const visualRoot = join(SOURCE_MIRROR_DIR, VISUAL_FACT_DIR);
  for (const relPath of listGeneratedMarkdownRelPaths(visualRoot, VISUAL_FACT_DIR)) {
    if (expected.has(relPath)) continue;
    try {
      unlinkSync(join(SOURCE_MIRROR_DIR, relPath));
    } catch (e) {
      log('WARN', `Cannot remove stale visual fact ${relPath}:`, e.message);
    }
  }
}

function removeMirror(mirrorRelPath, manifest) {
  const fullPath = join(SOURCE_MIRROR_DIR, mirrorRelPath);
  try {
    if (existsSync(fullPath)) {
      unlinkSync(fullPath);
    }
  } catch (e) {
    log('ERR', `Cannot remove mirror: ${mirrorRelPath} — ${e.message}`);
  }
  delete manifest.files[mirrorRelPath];
}

/** Clean up empty directories inside _source/ (recursive, bottom-up). */
function cleanupEmptyDirs(dir) {
  try {
    const items = readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
      if (item.isDirectory()) {
        cleanupEmptyDirs(join(dir, item.name));
      }
    }
    // Re-read after children cleaned
    const remaining = readdirSync(dir);
    if (remaining.length === 0 && dir !== SOURCE_MIRROR_DIR) {
      rmSync(dir, { recursive: false });
    }
  } catch {
    // Directory may have been removed already
  }
}

// ── Rebuild ─────────────────────────────────────────────────────────────────

function rebuild(force) {
  if (!force) {
    log('WARN', 'Rebuild requires --force flag. Use --rebuild --force to proceed.');
    log('INFO', 'This ensures enriched docs outside _source/ are never accidentally affected.');
    return;
  }

  ensureSourceDir();
  readGitDirtySources(true);
  readGitLocalCommitSources(true);
  const manifest = readManifest();

  // Reset manifest but NEVER touch files outside _source/
  manifest.files = {};
  manifest.generated = new Date().toISOString();

  // Collect all source files
  const sources = collectAllSourceFiles();
  log('INFO', `Found ${sources.length} source files to mirror.`);

  // Do not clear _source/ before writing. Keeping old notes in place prevents
  // Obsidian from rendering an empty graph while the mirror is being rebuilt.

  // Mirror all source files
  let updated = 0;
  let errors = 0;
  for (const [index, source] of sources.entries()) {
    if (index % 250 === 0) {
      log('INFO', `Mirroring ${index + 1}/${sources.length}: ${relative(REPO_ROOT, source)}`);
    }
    const result = mirrorFile(source, manifest);
    if (result.status === 'updated') updated++;
    if (result.status === 'error') errors++;
  }

  // Remove stale mirrors from manifest (files that no longer have a source)
  const staleKeys = Object.keys(manifest.files).filter((relMirror) => {
    const sourcePath = join(REPO_ROOT, manifest.files[relMirror].source);
    return !existsSync(sourcePath);
  });
  for (const key of staleKeys) {
    delete manifest.files[key];
  }
  const staleMirrorFiles = cleanupStaleMirrorFiles(manifest);

  // Clean up empty directories
  cleanupEmptyDirs(SOURCE_MIRROR_DIR);

  // Write manifest
  persistManifestState(manifest);

  log(
    'OK',
    `Rebuild complete: ${updated} updated, ${errors} errors, ${staleKeys.length} stale manifest removed, ${staleMirrorFiles} stale mirror files removed.`,
  );
  log('INFO', `Manifest: ${Object.keys(manifest.files).length} files tracked.`);
}

// ── Validate ────────────────────────────────────────────────────────────────

function validate() {
  const manifest = readManifest();
  readGitDirtySources(true);
  readGitLocalCommitSources(true);

  if (Object.keys(manifest.files).length === 0) {
    log('WARN', 'Manifest is empty. Run --rebuild --force first.');
    return;
  }

  let ok = 0;
  let stale = 0;
  let changed = 0;
  let missingSource = 0;
  let missingMirror = 0;

  for (const [relMirror, entry] of Object.entries(manifest.files)) {
    const mirrorPath = join(SOURCE_MIRROR_DIR, relMirror);
    const sourcePath = join(REPO_ROOT, entry.source);

    if (!existsSync(sourcePath)) {
      missingSource++;
      log('WARN', `Source missing: ${entry.source}`);
      continue;
    }

    if (!existsSync(mirrorPath)) {
      missingMirror++;
      log('WARN', `Mirror missing: ${relMirror}`);
      continue;
    }

    let sourceContent;
    try {
      sourceContent = readFileSync(sourcePath, 'utf8');
    } catch {
      log('ERR', `Cannot read source: ${entry.source}`);
      stale++;
      continue;
    }

    const currentHash = sha256(sourceContent);
    const gitState = gitStateForSource(sourcePath);

    if (currentHash !== entry.hash) {
      changed++;
      log(
        'WARN',
        `Changed: ${entry.source} (manifest: ${entry.hash.slice(0, 8)}, current: ${currentHash.slice(0, 8)})`,
      );
    } else if (Boolean(entry.git_dirty) !== gitState.dirty) {
      changed++;
      log(
        'WARN',
        `Git state changed: ${entry.source} (manifest: ${entry.workspace_state || (entry.git_dirty ? 'DIRTY' : 'NO_LOCAL_DIFF')}, current: ${gitState.workspaceState})`,
      );
    } else if (Boolean(entry.git_local_commit) !== gitState.localCommit) {
      changed++;
      log(
        'WARN',
        `Git local commit state changed: ${entry.source} (manifest: ${entry.workspace_state || 'unknown'}, current: ${gitState.workspaceState})`,
      );
    } else {
      ok++;
    }
  }

  // Also check for source files not in manifest
  const allSources = collectAllSourceFiles();
  const manifestSources = new Set(
    Object.values(manifest.files).map((e) => join(REPO_ROOT, e.source)),
  );
  const untracked = allSources.filter((s) => !manifestSources.has(s));
  for (const u of untracked) {
    log('WARN', `Untracked source: ${relative(REPO_ROOT, u)}`);
  }

  log('INFO', '');
  log(
    'INFO',
    `Validate results: ${ok} OK, ${changed} changed, ${stale} stale, ${missingSource} missing-source, ${missingMirror} missing-mirror, ${untracked.length} untracked.`,
  );

  const exitCode = changed + stale + missingSource + missingMirror + untracked.length > 0 ? 1 : 0;
  process.exit(exitCode);
}

// ── Status ───────────────────────────────────────────────────────────────────

function status() {
  const manifest = readManifest();
  const entries = Object.entries(manifest.files);

  if (entries.length === 0) {
    console.log('Mirror status: EMPTY (no files in manifest)');
    console.log('Run --rebuild --force to populate.');
    return;
  }

  // Aggregate stats
  const byLang = {};
  let totalSourceSize = 0;
  let totalMirrorSize = 0;

  for (const [, entry] of entries) {
    const lang = entry.lang || 'unknown';
    byLang[lang] = (byLang[lang] || 0) + 1;
    totalSourceSize += entry.source_size || 0;
    totalMirrorSize += entry.mirror_size || 0;
  }

  const newest = entries.reduce((a, b) => (a[1].updated > b[1].updated ? a : b));

  const oldest = entries.reduce((a, b) => (a[1].updated < b[1].updated ? a : b));

  console.log('═══════════════════════════════════════════');
  console.log('  Obsidian Mirror Daemon — Status');
  console.log('═══════════════════════════════════════════');
  console.log(`  Repo:        ${REPO_ROOT}`);
  console.log(`  Mirror:      ${SOURCE_MIRROR_DIR}`);
  console.log(`  Files:       ${entries.length}`);
  console.log(`  Source size: ${(totalSourceSize / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  Mirror size: ${(totalMirrorSize / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  Generated:   ${manifest.generated}`);
  console.log(`  Newest:      ${newest[0]} (${newest[1].updated})`);
  console.log(`  Oldest:      ${oldest[0]} (${oldest[1].updated})`);
  console.log('───────────────────────────────────────────');
  console.log('  Language Distribution:');
  const sortedLangs = Object.entries(byLang).sort((a, b) => b[1] - a[1]);
  for (const [lang, count] of sortedLangs) {
    const bar = '█'.repeat(Math.min(count, 60));
    console.log(`  ${String(count).padStart(6)}  ${lang.padEnd(20)} ${bar}`);
  }
  console.log('═══════════════════════════════════════════');
}

// ── Watch ────────────────────────────────────────────────────────────────────

function startWatch() {
  ensureSourceDir();
  readGitDirtySources(true);
  readGitLocalCommitSources(true);
  const manifest = readManifest();
  let lastGitSignature = gitDirtySignature();

  log('INFO', `Watching ${REPO_ROOT}`);
  log('INFO', 'Press Ctrl+C to stop.');

  const pending = new Map();
  let timer = null;

  function flushPending() {
    readGitDirtySources(true);
    readGitLocalCommitSources(true);
    const batch = new Map(pending);
    pending.clear();

    // Group deletes
    const toRemove = [];
    const toProcess = [];

    for (const [absPath, event] of batch) {
      const rel = relative(REPO_ROOT, absPath);

      if (rel.startsWith('..') || rel === '') continue;
      if (!isCandidateSourcePath(absPath)) continue;

      if (event === 'unlink') {
        toRemove.push(absPath);
      } else {
        toProcess.push(absPath);
      }
    }

    // Process removes
    for (const absPath of toRemove) {
      const mirrorPath = sourceToMirrorPath(absPath);
      const relMirror = relative(SOURCE_MIRROR_DIR, mirrorPath);
      if (manifest.files[relMirror]) {
        log('INFO', `Removing mirror: ${relative(REPO_ROOT, absPath)}`);
        removeMirror(relMirror, manifest);
      }
    }

    // Process changes/adds
    let updatedCount = 0;
    for (const absPath of toProcess) {
      if (!existsSync(absPath)) continue;
      let st;
      try {
        st = statSync(absPath);
      } catch {
        continue;
      }
      if (st.isDirectory()) continue;
      const rel = relative(REPO_ROOT, absPath);
      const result = mirrorFile(absPath, manifest);
      if (result.status === 'updated') {
        log('INFO', `Mirrored: ${rel}`);
        updatedCount++;
      } else if (result.status === 'error') {
        log('ERR', `Failed: ${rel} — ${result.reason}`);
      }
    }

    if (toRemove.length > 0 || updatedCount > 0) {
      persistManifestState(manifest);
      cleanupEmptyDirs(SOURCE_MIRROR_DIR);
    }
  }

  function flushGitState() {
    readGitDirtySources(true);
    readGitLocalCommitSources(true);
    const currentSignature = gitDirtySignature();
    if (currentSignature === lastGitSignature) return;
    lastGitSignature = currentSignature;

    let updatedCount = 0;
    const dirtySources = readGitDirtySources();
    const candidates = new Set();

    for (const entry of Object.values(manifest.files)) {
      if (!entry.source) continue;
      if (entry.git_dirty) candidates.add(join(REPO_ROOT, entry.source));
      if (entry.git_local_commit) candidates.add(join(REPO_ROOT, entry.source));
    }
    for (const rel of dirtySources) {
      candidates.add(join(REPO_ROOT, rel));
    }

    for (const absPath of candidates) {
      if (!existsSync(absPath) || !isMirrorableSourceFile(absPath)) continue;
      const result = mirrorFile(absPath, manifest);
      if (result.status === 'updated') {
        updatedCount++;
      }
    }

    if (updatedCount > 0) {
      persistManifestState(manifest);
      cleanupEmptyDirs(SOURCE_MIRROR_DIR);
      log('INFO', `Git dirty graph state refreshed: ${updatedCount} nodes updated.`);
    }
  }

  function enforceGraphLens() {
    ensureGraphLensSettings();
  }

  const watcher = watch(REPO_ROOT, { recursive: true }, (event, filename) => {
    if (!filename) return;
    const absPath = join(REPO_ROOT, filename);

    if (event === 'rename') {
      // Could be add or remove
      if (existsSync(absPath)) {
        pending.set(absPath, 'change');
      } else {
        pending.set(absPath, 'unlink');
      }
    } else {
      pending.set(absPath, event);
    }

    // Debounce
    if (timer) clearTimeout(timer);
    timer = setTimeout(flushPending, DEBOUNCE_MS);
  });

  const gitStateTimer = setInterval(flushGitState, GIT_STATE_POLL_MS);
  const graphLensTimer = setInterval(enforceGraphLens, GRAPH_LENS_ENFORCE_MS);

  // Graceful shutdown
  process.on('SIGINT', () => {
    log('INFO', 'Shutting down watcher...');
    if (timer) clearTimeout(timer);
    flushPending(); // final flush
    flushGitState();
    clearInterval(gitStateTimer);
    clearInterval(graphLensTimer);
    watcher.close();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    if (timer) clearTimeout(timer);
    flushPending();
    flushGitState();
    clearInterval(gitStateTimer);
    clearInterval(graphLensTimer);
    watcher.close();
    process.exit(0);
  });
}

// ── CLI ─────────────────────────────────────────────────────────────────────

function printUsage() {
  console.log(`
Obsidian Mirror Daemon — mirror repo source code into Obsidian vault _source/

USAGE:
  node obsidian-mirror-daemon.mjs <mode>

MODES:
  --watch              Watch for changes and mirror automatically.
  --rebuild --force    Full rebuild of _source/ directory (--force required).
  --rebuild --dry-run  Show what would be mirrored without writing.
  --validate           Check integrity: compare hashes of mirrored files.
  --status             Show mirror summary and language distribution.
  --help               Show this message.

ENVIRONMENT:
  KLOEL_REPO_ROOT      Path to the repository (default: whatsapp_saas).
  KLOEL_MIRROR_ROOT    Path to Obsidian vault mirror directory.

SAFETY:
  - Only the _source/ subdirectory is ever modified.
  - Enriched docs (top-level .md and directories) are NEVER touched.
  - --rebuild requires explicit --force flag.
`);
}

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printUsage();
    process.exit(0);
  }

  // Validate mirror root exists
  if (!existsSync(MIRROR_ROOT)) {
    log('ERR', `Mirror root does not exist: ${MIRROR_ROOT}`);
    log('INFO', 'Create the directory first or set KLOEL_MIRROR_ROOT.');
    process.exit(1);
  }

  // Validate repo root exists
  if (!existsSync(REPO_ROOT)) {
    log('ERR', `Repo root does not exist: ${REPO_ROOT}`);
    log('INFO', 'Set KLOEL_REPO_ROOT to the correct repository path.');
    process.exit(1);
  }

  if (args.includes('--watch')) {
    startWatch();
    return;
  }

  if (args.includes('--validate')) {
    validate();
    return;
  }

  if (args.includes('--status')) {
    status();
    return;
  }

  if (args.includes('--rebuild')) {
    const force = args.includes('--force');
    const dryRun = args.includes('--dry-run');

    if (dryRun) {
      const sources = collectAllSourceFiles();
      console.log(`Would mirror ${sources.length} files:`);
      for (const s of sources) {
        console.log(`  ${relative(REPO_ROOT, s)}`);
      }
      return;
    }

    rebuild(force);
    return;
  }

  printUsage();
  process.exit(1);
}

main();
