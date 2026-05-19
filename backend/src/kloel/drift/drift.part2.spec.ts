import { BehaviorSnapshotService } from './behavior-snapshot.service';
import { DriftDetectorService } from './drift-detector.service';
import type { SpineEventRef } from '../mind/mind.types';
import type { WeeklyBehaviorSnapshot } from './drift.types';

function makeEvent(
  override: Partial<SpineEventRef> & { eventName: string; occurredAt: string },
): SpineEventRef {
  const idx = makeEvent.seq++;
  return {
    eventId: `evt_${String(idx).padStart(5, '0')}`,
    workspaceId: 'ws_001',
    truthMode: 'observed',
    ...override,
  };
}
makeEvent.seq = 0;

function iso(day: number, hour: number, minute?: number): string {
  const d = String(day).padStart(2, '0');
  const h = String(hour).padStart(2, '0');
  const m = String(minute ?? 0).padStart(2, '0');
  return `2026-05-${d}T${h}:${m}:00.000Z`;
}

function makeWeek(
  wsId: string,
  days: readonly number[],
  valence?: 'positive' | 'negative' | 'neutral',
): SpineEventRef[] {
  const events: SpineEventRef[] = [];
  for (const day of days) {
    events.push(
      makeEvent({
        eventName: 'commerce.lead.created',
        occurredAt: iso(day, 10),
        workspaceId: wsId,
        entityRef: { entityType: 'lead', entityId: `L${day}` },
      }),
    );
    events.push(
      makeEvent({
        eventName: 'commerce.whatsapp.message_received',
        occurredAt: iso(day, 10, 5),
        workspaceId: wsId,
        entityRef: { entityType: 'lead', entityId: `L${day}` },
      }),
    );
    events.push(
      makeEvent({
        eventName: 'commerce.whatsapp.message_replied',
        occurredAt: iso(day, 10, 15),
        workspaceId: wsId,
        entityRef: { entityType: 'lead', entityId: `L${day}` },
      }),
    );
    events.push(
      makeEvent({
        eventName: 'commerce.lead.converted',
        occurredAt: iso(day, 14),
        workspaceId: wsId,
        entityRef: { entityType: 'lead', entityId: `L${day}` },
        valence: 'positive',
      }),
    );
    events.push(
      makeEvent({
        eventName: 'commerce.payment.approved',
        occurredAt: iso(day, 15),
        workspaceId: wsId,
        entityRef: { entityType: 'payment', entityId: `P${day}` },
        valence: 'positive',
      }),
    );
  }
  return events;
}

describe('DRIFT — Camada X (Behavioral Drift Observability)', () => {
  const snapshotSvc = new BehaviorSnapshotService();
  const driftSvc = new DriftDetectorService();
  const wsId = 'ws_drift_test';

  // ─── BehaviorSnapshotService ──────────────────────────────

  describe('DriftDetectorService.compare', () => {
    it('14 returns zero magnitude for identical snapshots', () => {
      const events = makeWeek(wsId, [11, 12]);
      const snap = snapshotSvc.snapshot(wsId, '2026-05-11', events);
      const result = driftSvc.compare(snap, snap);

      expect(result.magnitude).toBe(0);
      expect(result.driftedDimensions).toEqual([]);
      expect(result.narrative).toMatch(/estável|estavel/i);
    });

    it('15 detects drift when conversion volume changes significantly', () => {
      const few = makeWeek(wsId, [11]);
      const many = makeWeek(wsId, [11, 12, 13, 14, 15]);
      const snapA = snapshotSvc.snapshot(wsId, '2026-05-11', few);
      const snapB = snapshotSvc.snapshot(wsId, '2026-05-11', many);

      const result = driftSvc.compare(snapB, snapA);

      expect(result.magnitude).toBeGreaterThan(0);
      expect(result.driftedDimensions).toContain('conversionsAttributed');
    });

    it('16 detects drift when narrative style hash differs', () => {
      const evA = [
        makeEvent({
          eventName: 'commerce.lead.created',
          occurredAt: iso(11, 10),
          workspaceId: wsId,
        }),
        makeEvent({
          eventName: 'commerce.lead.converted',
          occurredAt: iso(11, 14),
          workspaceId: wsId,
          valence: 'positive',
        }),
      ];
      const evB = [
        makeEvent({
          eventName: 'commerce.payment.declined',
          occurredAt: iso(11, 10),
          workspaceId: wsId,
          valence: 'negative',
        }),
        makeEvent({
          eventName: 'commerce.crm.deal_lost',
          occurredAt: iso(11, 14),
          workspaceId: wsId,
          valence: 'negative',
        }),
      ];
      const snapA = snapshotSvc.snapshot(wsId, '2026-05-11', evA);
      const snapB = snapshotSvc.snapshot(wsId, '2026-05-11', evB);

      const result = driftSvc.compare(snapB, snapA);

      expect(result.driftedDimensions).toContain('narrativeStyleHash');
    });

    it('17 detects drift when tone distribution shifts', () => {
      const positive = [
        makeEvent({
          eventName: 'commerce.lead.converted',
          occurredAt: iso(11, 10),
          workspaceId: wsId,
          valence: 'positive',
        }),
        makeEvent({
          eventName: 'commerce.lead.converted',
          occurredAt: iso(11, 11),
          workspaceId: wsId,
          valence: 'positive',
        }),
        makeEvent({
          eventName: 'commerce.lead.converted',
          occurredAt: iso(11, 12),
          workspaceId: wsId,
          valence: 'positive',
        }),
      ];
      const negative = [
        makeEvent({
          eventName: 'commerce.payment.declined',
          occurredAt: iso(11, 10),
          workspaceId: wsId,
          valence: 'negative',
        }),
        makeEvent({
          eventName: 'commerce.payment.declined',
          occurredAt: iso(11, 11),
          workspaceId: wsId,
          valence: 'negative',
        }),
        makeEvent({
          eventName: 'commerce.payment.declined',
          occurredAt: iso(11, 12),
          workspaceId: wsId,
          valence: 'negative',
        }),
      ];

      const snapA = snapshotSvc.snapshot(wsId, '2026-05-11', positive);
      const snapB = snapshotSvc.snapshot(wsId, '2026-05-11', negative);

      const result = driftSvc.compare(snapB, snapA);

      expect(result.driftedDimensions).toContain('toneClassification');
    });

    it('18 magnitude is bounded between 0 and 1', () => {
      const evA = makeWeek(wsId, [11]);
      const evB = makeWeek(wsId, [12, 13, 14, 15, 16, 17, 18]);
      const snapA = snapshotSvc.snapshot(wsId, '2026-05-11', evA);
      const snapB = snapshotSvc.snapshot(wsId, '2026-05-11', evB);

      const result = driftSvc.compare(snapB, snapA);

      expect(result.magnitude).toBeGreaterThanOrEqual(0);
      expect(result.magnitude).toBeLessThanOrEqual(1);
    });

    it('19 narrative describes drifted dimensions when drift exists', () => {
      const evA = makeWeek(wsId, [11]);
      const evB = makeWeek(wsId, [12, 13, 14, 15]);
      const snapA = snapshotSvc.snapshot(wsId, '2026-05-11', evA);
      const snapB = snapshotSvc.snapshot(wsId, '2026-05-11', evB);

      const result = driftSvc.compare(snapB, snapA);

      expect(result.narrative).toMatch(/messagesSent|conversoes|mensagens|comportamento/i);
    });

    it('20 result includes details for all 6 dimensions', () => {
      const evA = makeWeek(wsId, [11]);
      const evB = makeWeek(wsId, [12, 13]);
      const snapA = snapshotSvc.snapshot(wsId, '2026-05-11', evA);
      const snapB = snapshotSvc.snapshot(wsId, '2026-05-11', evB);

      const result = driftSvc.compare(snapB, snapA);

      expect(result.details.length).toBe(6);
    });

    it('21 no drift when comparing snapshot to itself', () => {
      const events = makeWeek(wsId, [11, 12]);
      const snap = snapshotSvc.snapshot(wsId, '2026-05-11', events);
      const result = driftSvc.compare(snap, snap);

      expect(result.driftedDimensions.length).toBe(0);
      expect(result.magnitude).toBe(0);
    });

    // ─── Integration ────────────────────────────────────────
    it('22 full flow: snapshot two weeks and detect inter-week drift', () => {
      const week1 = [
        ...makeWeek(wsId, [11]),
        makeEvent({
          eventName: 'commerce.whatsapp.handoff_to_human',
          occurredAt: iso(11, 11),
          workspaceId: wsId,
          valence: 'negative',
        }),
      ];
      const week2 = [
        ...makeWeek(wsId, [18, 19, 20]),
        makeEvent({
          eventName: 'commerce.crm.deal_won',
          occurredAt: iso(18, 16),
          workspaceId: wsId,
          valence: 'positive',
        }),
        makeEvent({
          eventName: 'commerce.crm.deal_won',
          occurredAt: iso(19, 16),
          workspaceId: wsId,
          valence: 'positive',
        }),
      ];

      const snap1 = snapshotSvc.snapshot(wsId, '2026-05-11', week1);
      const snap2 = snapshotSvc.snapshot(wsId, '2026-05-18', week2);

      expect(snap1.snapshotId).not.toBe(snap2.snapshotId);
      expect(snap1.weekStart).not.toBe(snap2.weekStart);

      const result = driftSvc.compare(snap2, snap1);

      expect(result.workspaceId).toBe(wsId);
      expect(result.snapshotId).toBe(snap2.snapshotId);
      expect(result.comparedSnapshotId).toBe(snap1.snapshotId);
      expect(result.magnitude).toBeGreaterThanOrEqual(0);
      expect(result.magnitude).toBeLessThanOrEqual(1);
    });
  });
});
