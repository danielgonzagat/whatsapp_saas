import type { SpineEventRef } from '../../mind/mind.types';
import { OPS_UX_DETECTORS } from './operational-ux.detectors';

const NOW = Date.now();

function ev(over: Partial<SpineEventRef> = {}): SpineEventRef {
  return {
    eventId: over.eventId ?? `e_${Math.random().toString(36).slice(2, 8)}`,
    eventName: over.eventName ?? 'commerce.lead.replied',
    workspaceId: over.workspaceId ?? 'wks_demo',
    occurredAt: over.occurredAt ?? new Date(NOW).toISOString(),
    truthMode: over.truthMode ?? 'observed',
    entityRef: over.entityRef ?? { entityType: 'lead', entityId: 'lead_1' },
    ...(over.valence !== undefined ? { valence: over.valence } : {}),
    ...(over.payload !== undefined ? { payload: over.payload } : {}),
  };
}

describe('Operational/UX detectors', () => {
  it('exports OPS_UX_DETECTORS array', () => {
    expect(OPS_UX_DETECTORS).toBeDefined();
    expect(Array.isArray(OPS_UX_DETECTORS)).toBe(true);
    expect(OPS_UX_DETECTORS.length).toBeGreaterThan(0);
  });

  it('each detector has required name and dimension fields', () => {
    for (const d of OPS_UX_DETECTORS) {
      expect(d.name).toBeDefined();
      expect(typeof d.name).toBe('string');
      expect(['operational', 'ux'].includes(d.dimension)).toBe(true);
      expect(typeof d.detect).toBe('function');
    }
  });

  it('detectors accept events and return Tension[]', () => {
    for (const d of OPS_UX_DETECTORS) {
      expect(Array.isArray(d.detect([ev()], NOW))).toBe(true);
      expect(Array.isArray(d.detect([], NOW))).toBe(true);
    }
  });
});
