import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(join(__dirname, '..', '..', '..'));

const VAULT_ROOT = resolve(
  process.env.KLOEL_VAULT_ROOT || '/Users/danielpenin/Documents/Obsidian Vault',
);
const MIRROR_ROOT = resolve(
  process.env.KLOEL_MIRROR_ROOT || join(VAULT_ROOT, 'Kloel', '99 - Espelho do Codigo'),
);
const SOURCE_MIRROR_DIR = join(MIRROR_ROOT, '_source');
const MANIFEST_PATH = join(SOURCE_MIRROR_DIR, 'manifest.json');

const PULSE_HEALTH_PATH = join(REPO_ROOT, '.pulse', 'current', 'PULSE_HEALTH.json');
const PULSE_MANIFEST_PATH = join(REPO_ROOT, 'pulse.manifest.json');

const TIER_TAG_PREFIX = 'kloel/tier-';
const SHELL_SIZE_THRESHOLD = 500;

const SOURCE_DIR_PREFIXES = ['backend/src/', 'frontend/src/', 'worker/', 'scripts/pulse/'];

const SKIP_PREFIXES = [
  'docs/',
  'ops/',
  '.github/',
  '.husky/',
  'prisma/',
  'nginx/',
  'e2e/',
  '.claude/',
  '.agents/',
  '.pulse/',
  '.omx/',
  '.gitnexus/',
  '.kilo/',
  '.beads/',
  '.serena/',
  '.turbo/',
  'node_modules/',
  'dist/',
  'build/',
  'coverage/',
  '.next/',
  'artifacts/',
  'tmp/',
];

const SKIP_ROOT_FILES = new Set([
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'turbo.json',
  '.editorconfig',
  '.prettierrc.json',
  '.gitignore',
  '.nvmrc',
  '.node-version',
  '.npmrc',
  '.codacy.yml',
  'CLAUDE.md',
  'AGENTS.md',
  'CODEX.md',
  '.sentryclirc',
]);

const SKIP_EXTS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.svg',
  '.webp',
  '.ico',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.pdf',
  '.zip',
  '.tar',
  '.gz',
  '.mp3',
  '.mp4',
  '.webm',
  '.mov',
  '.sqlite',
  '.sqlite3',
  '.db',
  '.wasm',
  '.bin',
  '.lock',
  '.log',
  '.map',
  '.tsbuildinfo',
]);

export {
  REPO_ROOT,
  VAULT_ROOT,
  MIRROR_ROOT,
  SOURCE_MIRROR_DIR,
  MANIFEST_PATH,
  PULSE_HEALTH_PATH,
  PULSE_MANIFEST_PATH,
  TIER_TAG_PREFIX,
  SHELL_SIZE_THRESHOLD,
  SOURCE_DIR_PREFIXES,
  SKIP_PREFIXES,
  SKIP_ROOT_FILES,
  SKIP_EXTS,
};
