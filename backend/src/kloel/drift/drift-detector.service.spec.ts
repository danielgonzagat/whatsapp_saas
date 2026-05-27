import { DriftDetectorService } from './drift-detector.service';
import type { WeeklyBehaviorSnapshot } from './drift.types';

describe('DriftDetectorService', () => {
  const svc = new DriftDetectorService();

  const makeSnapshot = (overrides: Partial<WeeklyBehaviorSnapshot> = {}): WeeklyBehaviorSnapshot => ({
    snapshotId: 'snap-1',
    workspaceId: 'ws-1',
    weekStart: '2026-05-18',
    messagesSent: 100,
    decisionsRanked: ['buy', 'sell'],
    conversionsAttributed: 10,
    narrativeStyleHash: 'abc123',
    toneClassification: { assertivo: 5, consultivo: 2, empatico: 1, analitico: 1, urgente: 0, neutro: 1 },
    decisionPatterns: [{ pattern: 'discount' }, { pattern: 'urgency' }],
    ...overrides,
  });

  describe('compare', () => {
    it('returns drift result with dimensions', () => {
      const current = makeSnapshot({ snapshotId: 'snap-2', weekStart: '2026-05-25', messagesSent: 200 });
      const previous = makeSnapshot();
      const r = svc.compare(current, previous);
      expect(r.snapshotId).toBe('snap-2');
      expect(r.comparedSnapshotId).toBe('snap-1');
      expect(r.workspaceId).toBe('ws-1');
      expect(r.details).toHaveLength(6);
      expect(r.magnitude).toBeGreaterThanOrEqual(0);
      expect(r.magnitude).toBeLessThanOrEqual(1);
      expect(typeof r.narrative).toBe('string');
    });

    it('detects drift when messagesSent changes significantly', () => {
      const current = makeSnapshot({ snapshotId: 'snap-2', messagesSent: 200 });
      const previous = makeSnapshot({ messagesSent: 100 });
      const r = svc.compare(current, previous);
      const msgDim = r.details.find((d) => d.dimension === 'messagesSent');
      expect(msgDim?.drifted).toBe(true);
      expect(msgDim?.score).toBeGreaterThan(0.3);
    });

    it('reports no drift when snapshots are identical', () => {
      const snap = makeSnapshot();
      const r = svc.compare(snap, snap);
      expect(r.driftedDimensions).toHaveLength(0);
      expect(r.magnitude).toBe(0);
    });

    it('detects narrative style change', () => {
      const current = makeSnapshot({ snapshotId: 'snap-2', narrativeStyleHash: 'xyz789' });
      const previous = makeSnapshot({ narrativeStyleHash: 'abc123' });
      const r = svc.compare(current, previous);
      expect(r.driftedDimensions).toContain('narrativeStyleHash');
    });

    it('detects tone classification drift', () => {
      const current = makeSnapshot({
        snapshotId: 'snap-2',
        toneClassification: { assertivo: 1, consultivo: 1, empatico: 5, analitico: 1, urgente: 1, neutro: 1 },
      });
      const previous = makeSnapshot();
      const r = svc.compare(current, previous);
      const toneDim = r.details.find((d) => d.dimension === 'toneClassification');
      expect(toneDim?.drifted).toBe(true);
    });

    it('detects decision pattern changes', () => {
      const current = makeSnapshot({
        snapshotId: 'snap-2',
        decisionPatterns: [{ pattern: 'freebie' }, { pattern: 'scarcity' }],
      });
      const previous = makeSnapshot();
      const r = svc.compare(current, previous);
      const patDim = r.details.find((d) => d.dimension === 'decisionPatterns');
      expect(patDim?.drifted).toBe(true);
    });

    it('detects conversion drift', () => {
      const current = makeSnapshot({ snapshotId: 'snap-2', conversionsAttributed: 30 });
      const previous = makeSnapshot({ conversionsAttributed: 10 });
      const r = svc.compare(current, previous);
      const convDim = r.details.find((d) => d.dimension === 'conversionsAttributed');
      expect(convDim?.drifted).toBe(true);
    });

    it('handles zero baseline values gracefully', () => {
      const current = makeSnapshot({ snapshotId: 'snap-2', messagesSent: 10 });
      const previous = makeSnapshot({ messagesSent: 0 });
      const r = svc.compare(current, previous);
      const msgDim = r.details.find((d) => d.dimension === 'messagesSent');
      expect(msgDim?.drifted).toBe(true);
      expect(msgDim?.score).toBe(1);
    });

    it('handles both zero gracefully', () => {
      const current = makeSnapshot({ snapshotId: 'snap-2', messagesSent: 0, conversionsAttributed: 0 });
      const previous = makeSnapshot({ messagesSent: 0, conversionsAttributed: 0 });
      const r = svc.compare(current, previous);
      const msgDim = r.details.find((d) => d.dimension === 'messagesSent');
      expect(msgDim?.drifted).toBe(false);
      expect(msgDim?.score).toBe(0);
    });

    it('handles empty tone classifications', () => {
      const empty = makeSnapshot({
        snapshotId: 'snap-2',
        toneClassification: { assertivo: 0, consultivo: 0, empatico: 0, analitico: 0, urgente: 0, neutro: 0 },
      });
      const r = svc.compare(empty, empty);
      const toneDim = r.details.find((d) => d.dimension === 'toneClassification');
      expect(toneDim?.drifted).toBe(false);
    });

    it('handles empty decision patterns', () => {
      const current = makeSnapshot({ snapshotId: 'snap-2', decisionPatterns: [] });
      const previous = makeSnapshot({ decisionPatterns: [] });
      const r = svc.compare(current, previous);
      const patDim = r.details.find((d) => d.dimension === 'decisionPatterns');
      expect(patDim?.drifted).toBe(false);
    });

    it('includes stable dimensions in narrative', () => {
      const snap = makeSnapshot();
      const r = svc.compare(snap, snap);
      expect(r.narrative).toContain('estável');
    });

    it('includes computedAt timestamp', () => {
      const r = svc.compare(makeSnapshot({ snapshotId: 'snap-2' }), makeSnapshot());
      expect(r.computedAt).toBeDefined();
      expect(new Date(r.computedAt).getTime()).not.toBeNaN();
    });
  });
});
