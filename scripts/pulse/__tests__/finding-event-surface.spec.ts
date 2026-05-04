import { describe, expect, it } from 'vitest';

import { buildFindingEventSurface } from '../finding-event-surface';
import type { Break } from '../types';

function pulseBreak(overrides: Partial<Break> = {}): Break {
  return {
    type: 'API_NO_ROUTE',
    severity: 'high',
    file: 'backend/src/example.controller.ts',
    line: 12,
    description: 'API_NO_ROUTE checkout submission has no reachable backend route.',
    detail: 'Parser emitted API_NO_ROUTE for a missing route.',
    source: 'ast-route-graph',
    ...overrides,
  };
}

function eventText(surface: ReturnType<typeof buildFindingEventSurface>): string {
  return surface.topEvents.map((event) => `${event.eventName}\n${event.summary}`).join('\n');
}

describe('finding event surface', () => {
  it('builds dynamic event summaries from Break entries without exposing uppercase BreakType names', () => {
    const surface = buildFindingEventSurface([
      pulseBreak({
        description: 'API_NO_ROUTE checkout submission has no reachable backend route.',
        detail: 'Static route graph confirmed API_NO_ROUTE.',
      }),
      pulseBreak({
        file: 'frontend/src/Checkout.tsx',
        line: 44,
        type: 'DTO_NO_VALIDATION',
        severity: 'medium',
        description: 'DTO_NO_VALIDATION checkout payload lacks validated schema.',
        detail: 'Regex-only DTO_NO_VALIDATION signal needs a probe.',
        source: 'regex-string scan',
      }),
      pulseBreak({
        file: 'scripts/pulse/runtime-check.ts',
        line: 7,
        type: 'TEST_FAILURE',
        severity: 'critical',
        description: 'TEST_FAILURE checkout smoke failed in runtime probe.',
        detail: 'Observed runtime probe failed.',
        source: 'playwright-runtime-probe',
      }),
    ]);

    expect(surface.totalBreaks).toBe(3);
    expect(surface.uniqueEvents).toBe(3);
    expect(surface.truthModeCounts).toEqual({
      observed: 1,
      confirmed_static: 1,
      inferred: 0,
      weak_signal: 1,
    });
    expect(surface.actionabilityCounts).toEqual({
      fix_now: 2,
      needs_probe: 1,
      needs_context: 0,
      ignore: 0,
    });
    expect(surface.topEvents).toHaveLength(3);
    expect(eventText(surface)).not.toMatch(/\b[A-Z][A-Z0-9]+(?:_[A-Z0-9]+)+\b/);
  });

  it('sorts top events by count and keeps sample locations bounded', () => {
    const repeatedBreak = pulseBreak({
      description: 'Checkout submission has no reachable backend route.',
      detail: 'Static route graph confirmed the missing route.',
      source: 'ast-route-graph',
    });
    const surface = buildFindingEventSurface(
      [
        repeatedBreak,
        { ...repeatedBreak, line: 13 },
        { ...repeatedBreak, line: 14 },
        { ...repeatedBreak, line: 15 },
        pulseBreak({
          file: 'worker/src/jobs.ts',
          line: 2,
          type: 'JOB_NO_RETRY',
          description: 'Worker job has no retry policy.',
          detail: 'Static worker graph confirmed missing retry configuration.',
          source: 'ast-worker-graph',
        }),
      ],
      1,
    );

    expect(surface.topEvents).toEqual([
      expect.objectContaining({
        eventName: 'Checkout submission has no reachable backend route',
        count: 4,
        sampleLocations: [
          'backend/src/example.controller.ts:12',
          'backend/src/example.controller.ts:13',
          'backend/src/example.controller.ts:14',
        ],
      }),
    ]);
    expect(surface.topEvents[0]?.summary).toBe(
      'Checkout submission has no reachable backend route - 4 findings, confirmed_static, fix_now',
    );
  });
});
