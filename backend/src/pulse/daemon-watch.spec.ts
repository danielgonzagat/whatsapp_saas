import { spawnSync } from 'child_process';
import * as path from 'path';

interface WatchClassificationFixtureResult {
  readonly structuralClassifications: Record<string, string | null>;
  readonly docsKind: string | null;
  readonly docsShouldRescan: boolean;
  readonly rescanModes: Record<string, boolean>;
  readonly refreshModes: Record<string, string>;
}

function runWatchClassificationFixture(): WatchClassificationFixtureResult {
  const repoRoot = path.resolve(__dirname, '../../..');
  const script = String.raw`
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const repoRoot = process.cwd();
const originalLoad = Module._load;
Module._load = function load(request, parent, isMain) {
  if (
    request === './external-signals/snapshot-config' &&
    parent &&
    parent.filename.includes(path.join('scripts', 'pulse'))
  ) {
    return { PULSE_EXTERNAL_INPUT_FILES: ['PULSE_CODACY_STATE.json'] };
  }
  return originalLoad.apply(this, arguments);
};

require.extensions['.ts'] = function compileTypeScript(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2021,
    },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};

const {
  classifyWatchChange,
  getWatchRefreshMode,
  shouldRescanForWatchChange,
} = require(path.join(repoRoot, 'scripts/pulse/daemon.ts'));

const config = {
  rootDir: '/repo',
  frontendDir: '/repo/frontend',
  backendDir: '/repo/backend',
  workerDir: '/repo/worker',
  schemaPath: '/repo/prisma/schema.prisma',
  globalPrefix: '',
  certificationProfile: null,
};

const structuralClassifications = {
  frontend: classifyWatchChange('/repo/frontend/src/app/page.tsx', config),
  frontendAdmin: classifyWatchChange('/repo/frontend-admin/src/App.tsx', config),
  backend: classifyWatchChange('/repo/backend/src/app.controller.ts', config),
  worker: classifyWatchChange('/repo/worker/src/jobs/send.ts', config),
  e2e: classifyWatchChange('/repo/e2e/customer/auth.spec.ts', config),
  scripts: classifyWatchChange('/repo/scripts/pulse/index.ts', config),
  schema: classifyWatchChange('/repo/prisma/schema.prisma', config),
  migration: classifyWatchChange('/repo/prisma/migrations/20260422_init/migration.sql', config),
  codacy: classifyWatchChange('/repo/PULSE_CODACY_STATE.json', config),
  github: classifyWatchChange('/repo/PULSE_GITHUB_STATE.json', config),
  sentry: classifyWatchChange('/repo/PULSE_SENTRY_STATE.json', config),
  manifest: classifyWatchChange('/repo/pulse.manifest.json', config),
  rootConfig: classifyWatchChange('/repo/package.json', config),
};

const docsKind = classifyWatchChange('/repo/docs/pulse/vision.md', config);
const backendKind = classifyWatchChange('/repo/backend/src/app.controller.ts', config);
const codacyKind = classifyWatchChange('/repo/PULSE_CODACY_STATE.json', config);
const githubKind = classifyWatchChange('/repo/PULSE_GITHUB_STATE.json', config);
const manifestKind = classifyWatchChange('/repo/pulse.manifest.json', config);

process.stdout.write(
  JSON.stringify({
    structuralClassifications,
    docsKind,
    docsShouldRescan: shouldRescanForWatchChange(docsKind),
    rescanModes: {
      worker: shouldRescanForWatchChange(classifyWatchChange('/repo/worker/src/jobs/send.ts', config)),
      codacy: shouldRescanForWatchChange(codacyKind),
      github: shouldRescanForWatchChange(githubKind),
      none: shouldRescanForWatchChange(null),
    },
    refreshModes: {
      manifest: getWatchRefreshMode(manifestKind),
      codacy: getWatchRefreshMode(codacyKind),
      github: getWatchRefreshMode(githubKind),
      backend: getWatchRefreshMode(backendKind),
      docs: getWatchRefreshMode(docsKind),
    },
  }),
);
`;

  const result = spawnSync(process.execPath, ['--max-old-space-size=8192', '-e', script], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, NODE_ENV: 'test' },
    maxBuffer: 1024 * 1024,
  });

  if (result.status !== 0) {
    throw new Error(`daemon watch fixture failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  }

  return JSON.parse(result.stdout) as WatchClassificationFixtureResult;
}

describe('PULSE daemon watch classification', () => {
  const fixture = runWatchClassificationFixture();

  it('classifies structural code surfaces that must trigger a rescan', () => {
    expect(fixture.structuralClassifications).toEqual({
      frontend: 'frontend',
      frontendAdmin: 'frontend-admin',
      backend: 'backend',
      worker: 'worker',
      e2e: 'e2e',
      scripts: 'scripts',
      schema: 'schema',
      migration: 'schema',
      codacy: 'codacy',
      github: 'external-signal',
      sentry: 'external-signal',
      manifest: 'manifest',
      rootConfig: 'root-config',
    });
  });

  it('keeps docs observable but non-blocking for rescans', () => {
    expect(fixture.docsKind).toBe('docs');
    expect(fixture.docsShouldRescan).toBe(false);
  });

  it('rescans for code and evidence changes only', () => {
    expect(fixture.rescanModes).toEqual({
      worker: true,
      codacy: true,
      github: true,
      none: false,
    });
  });

  it('uses derived refresh for live manifest and external evidence overlays', () => {
    expect(fixture.refreshModes).toEqual({
      manifest: 'derived',
      codacy: 'derived',
      github: 'derived',
      backend: 'full',
      docs: 'none',
    });
  });
});
