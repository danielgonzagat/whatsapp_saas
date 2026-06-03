import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { buildScopeEngineState, getCriticalOrphans } from './build-state';

function writeFixture(rootDir: string, relativePath: string, content: string): string {
  const filePath = path.join(rootDir, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
  return filePath;
}

function findFile(stateRoot: ReturnType<typeof buildScopeEngineState>, relativePath: string) {
  const entry = stateRoot.files.find((file) => file.relativePath === relativePath);
  assert.ok(entry, `Expected ${relativePath} in scope state`);
  return entry;
}

const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-scope-engine-'));

try {
  writeFixture(
    rootDir,
    'ops/protected-governance-files.json',
    JSON.stringify({
      protectedExact: ['.husky/pre-push'],
      protectedPrefixes: ['.github/workflows/'],
    }),
  );
  writeFixture(
    rootDir,
    'frontend/tsconfig.json',
    JSON.stringify({
      compilerOptions: {
        baseUrl: '.',
        paths: {
          '@/*': ['./src/*'],
        },
      },
    }),
  );
  writeFixture(rootDir, 'backend/package.json', JSON.stringify({ scripts: { test: 'jest' } }));
  writeFixture(rootDir, 'backend/tsconfig.json', JSON.stringify({ compilerOptions: {} }));
  const secureRandomPath = writeFixture(
    rootDir,
    'frontend/src/lib/secure-random.ts',
    'export function secureRandomFloat(): number { return 0.5; }\n',
  );
  const secureRandomImporterPath = writeFixture(
    rootDir,
    'frontend/src/components/widget.ts',
    "import { secureRandomFloat } from '@/lib/secure-random';\nexport const value = secureRandomFloat();\n",
  );
  const templatesPath = writeFixture(
    rootDir,
    'backend/src/flows/templates.ts',
    "export const FLOW_TEMPLATES = ['welcome'];\n",
  );
  const templatesImporterPath = writeFixture(
    rootDir,
    'backend/src/flows/flows.controller.ts',
    "export async function loadTemplates() { return import('./templates'); }\n",
  );
  const minifiedHelperPath = writeFixture(
    rootDir,
    'frontend/src/components/minified-helper.ts',
    'export const minifiedHelper = true;\n',
  );
  const minifiedImporterPath = writeFixture(
    rootDir,
    'frontend/src/components/minified-root.js',
    'import{minifiedHelper}from"./minified-helper";export default minifiedHelper;\n',
  );
  writeFixture(
    rootDir,
    'frontend/src/app/(main)/billing/page.tsx',
    "export default function BillingPage(): JSX.Element { return <main />; }\n",
  );
  writeFixture(
    rootDir,
    'frontend/src/app/auth/apple/callback/route.ts',
    "export async function GET(): Promise<Response> { return new Response('ok'); }\n",
  );
  writeFixture(rootDir, 'frontend/next.config.ts', 'export default {};\n');
  writeFixture(rootDir, 'frontend/instrumentation.ts', 'export function register(): void {}\n');
  writeFixture(
    rootDir,
    'frontend/public/kloel-theme-init.js',
    "window.__KLOEL_THEME__ = window.__KLOEL_THEME__ || 'dark';\n",
  );
  const publicCanvasGuardPath = writeFixture(
    rootDir,
    'frontend/public/kloel-public-landing-canvas-guard.js',
    'HTMLCanvasElement.prototype.getContext = HTMLCanvasElement.prototype.getContext;\n',
  );
  const appLayoutPath = writeFixture(
    rootDir,
    'frontend/src/app/layout.tsx',
    'export default function Layout(): JSX.Element { return <script src="/kloel-public-landing-canvas-guard.js" />; }\n',
  );
  writeFixture(rootDir, 'frontend/src/types/google-identity.d.ts', 'declare global {}\n');
  writeFixture(rootDir, 'backend/prisma/seed.ts', 'export async function main(): Promise<void> {}\n');
  writeFixture(rootDir, 'backend/prisma.config.ts', 'export default {};\n');
  writeFixture(rootDir, 'backend/test/mocks/ioredis.ts', 'export class RedisMock {}\n');
  writeFixture(
    rootDir,
    'backend/vendor/node-domexception-native/index.js',
    'module.exports = globalThis.DOMException;\n',
  );
  writeFixture(rootDir, '.github/workflows/ci.yml', 'name: ci\n');
  writeFixture(rootDir, '.husky/pre-push', 'npm test\n');
  writeFixture(rootDir, '.git/config', '[core]\n');
  writeFixture(rootDir, '.local-cache/config.json', '{}\n');
  writeFixture(rootDir, 'scripts/smoke-test-prod.ts', 'export async function smoke(): Promise<void> {}\n');
  writeFixture(rootDir, 'scripts/pulse/types.continuous-daemon.ts', 'export interface Daemon {}\n');
  writeFixture(rootDir, 'backend/src/flows/orphan.ts', 'export const orphan = true;\n');
  writeFixture(
    rootDir,
    'backend/src/flows/orphan.spec.ts',
    "describe('orphan spec', () => { it('runs by test runner', () => expect(true).toBe(true)); });\n",
  );
  writeFixture(rootDir, 'backend/src/common/throttler/orphan-policy.ts', 'export const orphan = true;\n');

  const state = buildScopeEngineState(rootDir);

  const secureRandom = findFile(state, 'frontend/src/lib/secure-random.ts');
  assert.deepStrictEqual(secureRandom.connectedFrom, [secureRandomImporterPath]);

  const secureRandomImporter = findFile(state, 'frontend/src/components/widget.ts');
  assert.deepStrictEqual(secureRandomImporter.connections, [secureRandomPath]);

  const templates = findFile(state, 'backend/src/flows/templates.ts');
  assert.deepStrictEqual(templates.connectedFrom, [templatesImporterPath]);

  const templatesImporter = findFile(state, 'backend/src/flows/flows.controller.ts');
  assert.deepStrictEqual(templatesImporter.connections, [templatesPath]);

  const minifiedHelper = findFile(state, 'frontend/src/components/minified-helper.ts');
  assert.deepStrictEqual(minifiedHelper.connectedFrom, [minifiedImporterPath]);

  const minifiedImporter = findFile(state, 'frontend/src/components/minified-root.js');
  assert.deepStrictEqual(minifiedImporter.connections, [minifiedHelperPath]);

  const publicCanvasGuard = findFile(state, 'frontend/public/kloel-public-landing-canvas-guard.js');
  assert.deepStrictEqual(publicCanvasGuard.connectedFrom, [appLayoutPath]);

  const appLayout = findFile(state, 'frontend/src/app/layout.tsx');
  assert.deepStrictEqual(appLayout.connections, [publicCanvasGuardPath]);

  assert.ok(
    findFile(state, '.github/workflows/ci.yml').isProtected,
    'Governance-hidden directories from protected prefixes are scanned',
  );
  assert.ok(
    findFile(state, '.husky/pre-push').isProtected,
    'Governance-hidden exact files are scanned',
  );
  assert.ok(
    !state.files.some((entry) => entry.relativePath === '.git/config'),
    'Ignored hidden runtime directories stay out of the scope engine',
  );
  assert.ok(
    !state.files.some((entry) => entry.relativePath === '.local-cache/config.json'),
    'Unprotected hidden directories stay out of the scope engine',
  );
  assert.ok(
    findFile(state, 'backend/package.json').nodeIds.includes('runtime:config-entrypoint'),
    'Package manifests are runtime config entrypoints',
  );
  assert.ok(
    findFile(state, 'backend/tsconfig.json').nodeIds.includes('runtime:config-entrypoint'),
    'TypeScript configs are runtime config entrypoints',
  );
  assert.ok(
    findFile(state, 'backend/src/flows/orphan.spec.ts').nodeIds.includes(
      'test:test-runner-entrypoint',
    ),
    'Specs are test-runner entrypoints even when nothing imports them',
  );

  const criticalOrphanPaths = getCriticalOrphans(state).map((entry) => entry.relativePath);
  assert.ok(
    criticalOrphanPaths.includes('backend/src/flows/orphan.ts'),
    'A source file with no imports stays a critical orphan',
  );
  assert.ok(
    !criticalOrphanPaths.includes('backend/src/flows/orphan.spec.ts'),
    'Standalone spec files are not critical source orphans',
  );
  assert.ok(
    !criticalOrphanPaths.includes('frontend/src/lib/secure-random.ts'),
    'tsconfig path aliases prevent imported frontend files from becoming critical orphans',
  );
  assert.ok(
    !criticalOrphanPaths.includes('backend/src/flows/templates.ts'),
    'dynamic imports prevent imported backend files from becoming critical orphans',
  );
  assert.ok(
    !criticalOrphanPaths.includes('frontend/src/components/minified-helper.ts'),
    'minified static imports prevent imported helper files from becoming critical orphans',
  );

  for (const frameworkEntrypoint of [
    'frontend/src/app/(main)/billing/page.tsx',
    'frontend/src/app/auth/apple/callback/route.ts',
    'frontend/next.config.ts',
    'frontend/instrumentation.ts',
    'frontend/public/kloel-theme-init.js',
    'frontend/src/types/google-identity.d.ts',
    'backend/prisma/seed.ts',
    'backend/prisma.config.ts',
    'backend/test/mocks/ioredis.ts',
    'backend/vendor/node-domexception-native/index.js',
    'scripts/smoke-test-prod.ts',
    'scripts/pulse/types.continuous-daemon.ts',
  ]) {
    assert.ok(
      !criticalOrphanPaths.includes(frameworkEntrypoint),
      `${frameworkEntrypoint} has runtime/framework evidence and must not be critical orphan`,
    );
    assert.ok(
      findFile(state, frameworkEntrypoint).nodeIds.length > 0,
      `${frameworkEntrypoint} should expose node evidence`,
    );
  }

  assert.ok(
    criticalOrphanPaths.includes('backend/src/common/throttler/orphan-policy.ts'),
    'A non-entrypoint source file without imports stays a critical orphan',
  );
} finally {
  fs.rmSync(rootDir, { recursive: true, force: true });
}
