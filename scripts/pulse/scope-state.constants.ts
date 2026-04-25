/**
 * Static lookup tables shared by `scope-state.ts`.
 *
 * Extracted from `scope-state.ts` to satisfy the 600-line architecture cap
 * on touched files. The exported values keep the same semantics they had
 * inline; consumers should treat these sets as read-only.
 */

/** File extensions that PULSE will scan during scope discovery. */
export const SCANNABLE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.sql',
  '.md',
  '.yml',
  '.yaml',
  '.json',
  '.css',
  '.scss',
]);

/** Directory names that PULSE never descends into. */
export const IGNORED_DIRECTORIES = new Set([
  'node_modules',
  '.git',
  '.pulse',
  '.claude',
  '.copilot',
  'dist',
  '.next',
  '.turbo',
  'build',
  'coverage',
  '.cache',
  '.vercel',
]);

/** Repository-root configuration files that PULSE always scans. */
export const ROOT_CONFIG_FILES = new Set([
  'package.json',
  'package-lock.json',
  '.dockerignore',
  '.gitignore',
  '.npmrc',
  '.nvmrc',
  '.tool-versions',
  'railpack-plan.json',
  'docker-compose.yml',
  'docker-compose.yaml',
]);

/**
 * Path segments that PULSE strips out when classifying a module candidate
 * from a file path. These are structural noise (folders that exist for
 * organisation rather than identity) and never represent a module.
 */
export const STRUCTURAL_NOISE_SEGMENTS = new Set([
  '',
  'backend',
  'frontend',
  'frontend-admin',
  'worker',
  'src',
  'app',
  'apps',
  'pages',
  'page',
  'route',
  'routes',
  'api',
  'components',
  'component',
  'hooks',
  'hook',
  'lib',
  'libs',
  'utils',
  'util',
  'common',
  'shared',
  'module',
  'modules',
  'feature',
  'features',
  'provider',
  'providers',
  'context',
  'contexts',
  'types',
  'scripts',
  'docs',
  'prisma',
  'migrations',
  'generated',
  'tests',
  'test',
  'spec',
  'specs',
  '__tests__',
  'ops',
  'nginx',
  'docker',
  'layout',
  'loading',
  'error',
  'template',
  'index',
]);
