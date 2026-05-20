import type { SpineEventRef } from '../../mind/mind.types';
import { COMMERCIAL_DETECTORS } from './commercial.detectors';

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
  } as SpineEventRef;
}

describe('Commercial detectors', () => {
  it('exports COMMERCIAL_DETECTORS array with detectors', () => {
    expect(COMMERCIAL_DETECTORS).toBeDefined();
    expect(Array.isArray(COMMERCIAL_DETECTORS)).toBe(true);
    expect(COMMERCIAL_DETECTORS.length).toBeGreaterThan(0);
  });

  it('each detector has required name and dimension fields', () => {
    for (const d of COMMERCIAL_DETECTORS) {
      expect(d.name).toBeDefined();
      expect(typeof d.name).toBe('string');
      expect(d.dimension).toBe('commercial');
      expect(typeof d.detect).toBe('function');
    }
  });

  it('detectors accept events array and nowMs', () => {
    const events: SpineEventRef[] = [ev()];
    for (const d of COMMERCIAL_DETECTORS) {
      const result = d.detect(events, NOW);
      expect(Array.isArray(result)).toBe(true);
    }
  });

  it('detectors handle empty events gracefully', () => {
    for (const d of COMMERCIAL_DETECTORS) {
      const result = d.detect([], NOW);
      expect(Array.isArray(result)).toBe(true);
    }
  });
});
