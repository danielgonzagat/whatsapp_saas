import { resolve, join, dirname } from 'node:path';

// ── Configuration ───────────────────────────────────────────────────────────

export const REPO_ROOT = resolve(process.env.KLOEL_REPO_ROOT || '/Users/danielpenin/whatsapp_saas');
export const MIRROR_ROOT = resolve(
  process.env.KLOEL_MIRROR_ROOT ||
    '/Users/danielpenin/Documents/Obsidian Vault/Kloel/99 - Espelho do Codigo',
);
export const VAULT_ROOT = resolve(process.env.KLOEL_VAULT_ROOT || dirname(dirname(MIRROR_ROOT)));
export const SOURCE_MIRROR_DIR = join(MIRROR_ROOT, '_source');
export const MANIFEST_PATH = join(SOURCE_MIRROR_DIR, 'manifest.json');
export const MIRROR_DAEMON_LOCK_PATH = join(REPO_ROOT, '.obsidian-mirror-daemon.lock');
export const LOCK_ACQUIRE_TIMEOUT_MS = Number(process.env.KLOEL_MIRROR_LOCK_TIMEOUT_MS || '30000');
export const LOCK_STALE_MS = Number(process.env.KLOEL_MIRROR_LOCK_STALE_MS || '120000');
export const LOCK_POLL_MS = Number(process.env.KLOEL_MIRROR_LOCK_POLL_MS || '75');
export const GRAPH_SETTINGS_PATH = join(VAULT_ROOT, '.obsidian', 'graph.json');
export const WORKSPACE_GRAPH_SEARCH = '';
export const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
export const DEBOUNCE_MS = 250;
export const GIT_STATE_POLL_MS = 3000;
export const GRAPH_LENS_ENFORCE_MS = 2000;
export const MIRROR_FORMAT_VERSION = 21;
export const SOURCE_BODY_MIRROR_MAX_BYTES = Number(
  process.env.KLOEL_SOURCE_BODY_MIRROR_MAX_BYTES || String(Number.MAX_SAFE_INTEGER),
);
export const GENERATED_PAGE_SIZE = Number(process.env.KLOEL_GRAPH_PAGE_SIZE || '120');
export const DIRTY_WORKSPACE_TAG = 'workspace/dirty';
export const DIRTY_WORKSPACE_QUERY = 'tag:#workspace/dirty';
export const DIRTY_WORKSPACE_COLOR_RGB = 14724096; // Obsidian yellow #e0ac00.
export const LOCAL_COMMIT_TAG = 'workspace/local-commit';
export const LOCAL_COMMIT_QUERY = 'tag:#workspace/local-commit';
export const METADATA_ONLY_TAG = 'mirror/metadata-only';
export const METADATA_ONLY_QUERY = 'tag:#mirror/metadata-only';
export const METADATA_ONLY_COLOR_RGB = 8421504; // Obsidian gray #808080.
export const GRAPH_ACTION_REQUIRED_TAG = 'graph/action-required';
export const GRAPH_ACTION_REQUIRED_QUERY = 'tag:#graph/action-required';
export const GRAPH_ACTION_REQUIRED_COLOR_RGB = 16711680; // red.
export const GRAPH_EVIDENCE_GAP_TAG = 'graph/evidence-gap';
export const GRAPH_EVIDENCE_GAP_QUERY = 'tag:#graph/evidence-gap';
export const GRAPH_EVIDENCE_GAP_COLOR_RGB = 16711935; // magenta.
export const GRAPH_EFFECT_SECURITY_TAG = 'graph/effect-security';
export const GRAPH_EFFECT_SECURITY_QUERY = 'tag:#graph/effect-security';
export const GRAPH_EFFECT_SECURITY_COLOR_RGB = 10040524; // violet.
export const GRAPH_EFFECT_ERROR_TAG = 'graph/effect-error';
export const GRAPH_EFFECT_ERROR_QUERY = 'tag:#graph/effect-error';
export const GRAPH_EFFECT_ERROR_COLOR_RGB = 16724736; // orange-red.
export const GRAPH_EFFECT_ENTRYPOINT_TAG = 'graph/effect-entrypoint';
export const GRAPH_EFFECT_ENTRYPOINT_QUERY = 'tag:#graph/effect-entrypoint';
export const GRAPH_EFFECT_ENTRYPOINT_COLOR_RGB = 65280; // green.
export const GRAPH_EFFECT_DATA_TAG = 'graph/effect-data';
export const GRAPH_EFFECT_DATA_QUERY = 'tag:#graph/effect-data';
export const GRAPH_EFFECT_DATA_COLOR_RGB = 255; // blue.
export const GRAPH_EFFECT_NETWORK_TAG = 'graph/effect-network';
export const GRAPH_EFFECT_NETWORK_QUERY = 'tag:#graph/effect-network';
export const GRAPH_EFFECT_NETWORK_COLOR_RGB = 65535; // cyan.
export const GRAPH_EFFECT_ASYNC_TAG = 'graph/effect-async';
export const GRAPH_EFFECT_ASYNC_QUERY = 'tag:#graph/effect-async';
export const GRAPH_EFFECT_ASYNC_COLOR_RGB = 5635925; // teal.
export const GRAPH_EFFECT_STATE_TAG = 'graph/effect-state';
export const GRAPH_EFFECT_STATE_QUERY = 'tag:#graph/effect-state';
export const GRAPH_EFFECT_STATE_COLOR_RGB = 13789470; // pink.
export const GRAPH_EFFECT_CONTRACT_TAG = 'graph/effect-contract';
export const GRAPH_EFFECT_CONTRACT_QUERY = 'tag:#graph/effect-contract';
export const GRAPH_EFFECT_CONTRACT_COLOR_RGB = 12632256; // silver.
export const GRAPH_EFFECT_CONFIG_TAG = 'graph/effect-config';
export const GRAPH_EFFECT_CONFIG_QUERY = 'tag:#graph/effect-config';
export const GRAPH_EFFECT_CONFIG_COLOR_RGB = 11184810; // light gray.
export const PULSE_MACHINE_TAG = 'source/pulse-machine';
export const PULSE_MACHINE_QUERY = 'tag:#source/pulse-machine';
export const PULSE_MACHINE_COLOR_RGB = 10040524; // violet.
export const SIGNAL_STATIC_HIGH_TAG = 'signal/static-high';
export const SIGNAL_STATIC_HIGH_QUERY = 'tag:#signal/static-high';
export const SIGNAL_STATIC_HIGH_COLOR_RGB = 16711680; // red.
export const SIGNAL_HOTSPOT_TAG = 'signal/hotspot';
export const SIGNAL_HOTSPOT_QUERY = 'tag:#signal/hotspot';
export const SIGNAL_HOTSPOT_COLOR_RGB = 16744192; // orange.
export const SIGNAL_EXTERNAL_TAG = 'signal/external';
export const SIGNAL_EXTERNAL_QUERY = 'tag:#signal/external';
export const SIGNAL_EXTERNAL_COLOR_RGB = 65535; // cyan.
export const GRAPH_RISK_CRITICAL_TAG = 'graph/risk-critical';
export const GRAPH_RISK_CRITICAL_QUERY = 'tag:#graph/risk-critical';
export const GRAPH_RISK_CRITICAL_COLOR_RGB = 16711680; // red.
export const GRAPH_RISK_HIGH_TAG = 'graph/risk-high';
export const GRAPH_RISK_HIGH_QUERY = 'tag:#graph/risk-high';
export const GRAPH_RISK_HIGH_COLOR_RGB = 16744192; // orange.
export const GRAPH_PROOF_TEST_TAG = 'graph/proof-test';
export const GRAPH_PROOF_TEST_QUERY = 'tag:#graph/proof-test';
export const GRAPH_PROOF_TEST_COLOR_RGB = 65280; // green.
export const GRAPH_RUNTIME_API_TAG = 'graph/runtime-api';
export const GRAPH_RUNTIME_API_QUERY = 'tag:#graph/runtime-api';
export const GRAPH_RUNTIME_API_COLOR_RGB = 65535; // cyan.
export const GRAPH_SURFACE_UI_TAG = 'graph/surface-ui';
export const GRAPH_SURFACE_UI_QUERY = 'tag:#graph/surface-ui';
export const GRAPH_SURFACE_UI_COLOR_RGB = 255; // blue.
export const GRAPH_SURFACE_BACKEND_TAG = 'graph/surface-backend';
export const GRAPH_SURFACE_BACKEND_QUERY = 'tag:#graph/surface-backend';
export const GRAPH_SURFACE_BACKEND_COLOR_RGB = 6737151; // steel blue.
export const GRAPH_SURFACE_WORKER_TAG = 'graph/surface-worker';
export const GRAPH_SURFACE_WORKER_QUERY = 'tag:#graph/surface-worker';
export const GRAPH_SURFACE_WORKER_COLOR_RGB = 5635925; // teal.
export const GRAPH_SURFACE_SOURCE_TAG = 'graph/surface-source';
export const GRAPH_SURFACE_SOURCE_QUERY = 'tag:#graph/surface-source';
export const GRAPH_SURFACE_SOURCE_COLOR_RGB = 11184810; // light gray.
export const GRAPH_GOVERNANCE_TAG = 'graph/governance';
export const GRAPH_GOVERNANCE_QUERY = 'tag:#graph/governance';
export const GRAPH_GOVERNANCE_COLOR_RGB = 10040524; // violet.
export const GRAPH_ORPHAN_TAG = 'graph/orphan';
export const GRAPH_ORPHAN_QUERY = 'tag:#graph/orphan';
export const GRAPH_ORPHAN_COLOR_RGB = 16711935; // magenta.
export const GRAPH_MOLECULE_TAG = 'graph/molecule';
export const GRAPH_MOLECULE_QUERY = 'tag:#graph/molecule';
export const GRAPH_MOLECULE_COLOR_RGB = 12632256; // silver.
export const GRAPH_SECTOR_TAG = 'graph/sector';
export const GIT_STATE_DIR = '_git';
export const DIRTY_DELETED_DIR = join(GIT_STATE_DIR, 'dirty-deleted');
export const MACHINE_DIR = '_machine';
export const CAMERA_DIR = '_camera';
export const OBRA_DIR = '_obra';
export const CLUSTER_DIR = '_clusters';
export const VISUAL_FACT_DIR = '_visual';

export const CODE_STATE_COLOR_GROUPS = [
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
export const SOURCE_DIRECTORIES = [
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
export const ROOT_FILE_PATTERNS = [
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

export const SKIP_DIR_PATTERNS = [
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

export const SKIP_FILE_PATTERNS = [
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

export const SKIP_SECRET_PATTERNS = [
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

export const EXT_TO_LANG = {
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

export const LANG_BY_FILENAME = {
  Dockerfile: 'dockerfile',
  Makefile: 'makefile',
  Procfile: 'yaml',
};
