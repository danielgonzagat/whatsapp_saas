import type { PulseConfig } from '../../../scripts/pulse/types';
import {
  classifyWatchChange,
  getWatchRefreshMode,
  shouldRescanForWatchChange,
} from '../../../scripts/pulse/daemon';

describe('PULSE daemon watch classification', () => {
  const config: PulseConfig = {
    rootDir: '/repo',
    frontendDir: '/repo/frontend',
    backendDir: '/repo/backend',
    workerDir: '/repo/worker',
    schemaPath: '/repo/prisma/schema.prisma',
    globalPrefix: '',
    certificationProfile: null,
  };

  it('classifies structural code surfaces that must trigger a rescan', () => {
    expect(classifyWatchChange('/repo/frontend/src/app/page.tsx', config)).toBe('frontend');
    expect(classifyWatchChange('/repo/frontend-admin/src/App.tsx', config)).toBe('frontend-admin');
    expect(classifyWatchChange('/repo/backend/src/app.controller.ts', config)).toBe('backend');
    expect(classifyWatchChange('/repo/worker/src/jobs/send.ts', config)).toBe('worker');
    expect(classifyWatchChange('/repo/e2e/customer/auth.spec.ts', config)).toBe('e2e');
    expect(classifyWatchChange('/repo/scripts/pulse/index.ts', config)).toBe('scripts');
    expect(classifyWatchChange('/repo/prisma/schema.prisma', config)).toBe('schema');
    expect(classifyWatchChange('/repo/prisma/migrations/20260422_init/migration.sql', config)).toBe(
      'schema',
    );
    expect(classifyWatchChange('/repo/PULSE_CODACY_STATE.json', config)).toBe('codacy');
    expect(classifyWatchChange('/repo/pulse.manifest.json', config)).toBe('manifest');
    expect(classifyWatchChange('/repo/package.json', config)).toBe('root-config');
  });

  it('keeps docs observable but non-blocking for rescans', () => {
    const kind = classifyWatchChange('/repo/docs/pulse/vision.md', config);
    expect(kind).toBe('docs');
    expect(shouldRescanForWatchChange(kind)).toBe(false);
  });

  it('rescans for code and evidence changes only', () => {
    expect(
      shouldRescanForWatchChange(classifyWatchChange('/repo/worker/src/jobs/send.ts', config)),
    ).toBe(true);
    expect(
      shouldRescanForWatchChange(classifyWatchChange('/repo/PULSE_CODACY_STATE.json', config)),
    ).toBe(true);
    expect(shouldRescanForWatchChange(null)).toBe(false);
  });

  it('uses derived refresh for live manifest and codacy overlays', () => {
    expect(getWatchRefreshMode(classifyWatchChange('/repo/pulse.manifest.json', config))).toBe(
      'derived',
    );
    expect(getWatchRefreshMode(classifyWatchChange('/repo/PULSE_CODACY_STATE.json', config))).toBe(
      'derived',
    );
    expect(
      getWatchRefreshMode(classifyWatchChange('/repo/backend/src/app.controller.ts', config)),
    ).toBe('full');
    expect(getWatchRefreshMode(classifyWatchChange('/repo/docs/pulse/vision.md', config))).toBe(
      'none',
    );
  });
});
