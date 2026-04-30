import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  buildPulseNoHardcodedRealityState,
  formatNoHardcodedRealityBlocker,
  hasNoHardcodedRealityBlocker,
  summarizeNoHardcodedRealityState,
} from '../no-hardcoded-reality-state';

const tempRoots: string[] = [];

function makeTempRoot(): string {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-no-hardcoded-state-'));
  tempRoots.push(rootDir);
  return rootDir;
}

afterEach(() => {
  while (tempRoots.length > 0) {
    const rootDir = tempRoots.pop();
    if (rootDir) {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  }
});

describe('PULSE no-hardcoded-reality state', () => {
  it('does not turn SaaS workspace hardcodes into PULSE no-hardcode blockers', () => {
    const rootDir = makeTempRoot();
    const pulseDir = path.join(rootDir, 'scripts/pulse');
    const backendDir = path.join(rootDir, 'backend/src/products');
    const frontendDir = path.join(rootDir, 'frontend/src/app/checkout');
    fs.mkdirSync(pulseDir, { recursive: true });
    fs.mkdirSync(backendDir, { recursive: true });
    fs.mkdirSync(frontendDir, { recursive: true });
    fs.writeFileSync(
      path.join(pulseDir, 'clean-machine.ts'),
      "export const PULSE_GRAMMAR = ['artifact', 'evidence', 'truth'];\n",
    );
    fs.writeFileSync(
      path.join(backendDir, 'product-catalog.ts'),
      "const PRODUCT_CATALOG = ['checkout-basic', 'crm-suite'];\n",
    );
    fs.writeFileSync(
      path.join(frontendDir, 'routes.tsx'),
      "const PRODUCT_ROUTES = ['/checkout', '/billing/status'];\n",
    );

    const state = buildPulseNoHardcodedRealityState(rootDir, '2026-04-30T00:00:00.000Z');
    const summary = summarizeNoHardcodedRealityState(state);

    expect(state.scannedFiles).toBe(1);
    expect(state.totalEvents).toBe(0);
    expect(state.hardcodeEvents).toEqual([]);
    expect(summary.topFiles).toEqual([]);
    expect(hasNoHardcodedRealityBlocker(summary)).toBe(false);
    expect(formatNoHardcodedRealityBlocker(summary)).toBe(
      '0 hardcoded reality event(s) across 1 scanned PULSE file(s).',
    );
  });

  it('summarizes audit findings as completion blockers for downstream artifacts', () => {
    const rootDir = makeTempRoot();
    const pulseDir = path.join(rootDir, 'scripts/pulse');
    fs.mkdirSync(pulseDir, { recursive: true });
    fs.writeFileSync(
      path.join(pulseDir, 'hardcoded-routes.ts'),
      "const PRODUCT_ROUTES = ['/checkout', '/billing/status'];\n",
    );

    const state = buildPulseNoHardcodedRealityState(rootDir, '2026-04-30T00:00:00.000Z');
    const summary = summarizeNoHardcodedRealityState(state);

    expect(state.artifact).toBe('PULSE_NO_HARDCODED_REALITY');
    expect(summary.totalEvents).toBe(1);
    expect(summary.topFiles).toEqual(['scripts/pulse/hardcoded-routes.ts']);
    expect(hasNoHardcodedRealityBlocker(summary)).toBe(true);
    expect(formatNoHardcodedRealityBlocker(summary)).toContain('1 hardcoded reality event(s)');
  });

  it('keeps downstream top files aligned with the audit summary when events are capped', () => {
    const events = Array.from({ length: 101 }, (_, index) => ({
      eventName: `event-${index}`,
      evidence: 'fixed route catalog',
      filePath: index === 0 ? 'scripts/pulse/first-event.ts' : 'scripts/pulse/other.ts',
      line: index + 1,
      column: 1,
      samples: ['/checkout'],
      truthMode: 'confirmed_static' as const,
      actionability: 'replace_with_dynamic_discovery' as const,
    }));

    const summary = summarizeNoHardcodedRealityState({
      artifact: 'PULSE_NO_HARDCODED_REALITY',
      version: 1,
      generatedAt: '2026-04-30T00:00:00.000Z',
      operationalIdentity: 'dynamic_hardcode_evidence_event',
      scannedFiles: 3,
      totalEvents: 101,
      summary: {
        totalFindings: 101,
        byKind: {
          fixed_product_route_collection: 101,
        },
        topFiles: [
          {
            filePath: 'scripts/pulse/top-hotspot.ts',
            findings: 80,
          },
          {
            filePath: 'scripts/pulse/second-hotspot.ts',
            findings: 21,
          },
        ],
      },
      hardcodeEvents: events.slice(0, 100),
      policy: {
        fixedClassifierIsOperationalTruth: false,
        regexCanDetectButCannotDecide: true,
        parserCanObserveButCannotCondemn: true,
        diagnosticMustBeGeneratedFromEvidence: true,
      },
    });

    expect(summary.totalEvents).toBe(101);
    expect(summary.topFiles).toEqual([
      'scripts/pulse/top-hotspot.ts',
      'scripts/pulse/second-hotspot.ts',
    ]);
    expect(formatNoHardcodedRealityBlocker(summary)).toContain(
      'Top files: scripts/pulse/top-hotspot.ts, scripts/pulse/second-hotspot.ts.',
    );
  });
});
