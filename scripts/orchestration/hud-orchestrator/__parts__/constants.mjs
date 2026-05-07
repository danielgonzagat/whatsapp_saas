import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(
  process.env.KLOEL_REPO_ROOT || resolve(__dirname, '..', '..', '..'),
);
export const OPS_DIR = join(REPO_ROOT, 'scripts', 'ops');
export const ORCH_DIR = join(REPO_ROOT, 'scripts', 'orchestration');
export const OBSIDIAN_DIR = join(REPO_ROOT, 'scripts');
export const REFRESH_LOG_PATH = join(REPO_ROOT, 'HUD_LAST_REFRESH.json');
export const PID_FILE = '/tmp/kloel-hud-orchestrator.pid';
export const DEFAULT_WATCH_MINUTES = 5;

export const STEP_TIMEOUT_MS = 180_000;

export const POLL_INTERVAL_MS = 60_000;
export const WATCH_FILE_EXTENSIONS = new Set([
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

export const IGNORE_SEGMENTS = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.next',
  '.obsidian',
]);
