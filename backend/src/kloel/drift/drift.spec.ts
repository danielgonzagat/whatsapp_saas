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

  describe('BehaviorSnapshotService.snapshot', () => {
    it('01 produces snapshotId with workspaceId and weekStart', () => {
      const events = makeWeek(wsId, [11, 12, 13]);
      const snap = snapshotSvc.snapshot(wsId, '2026-05-11', events);

      expect(snap.snapshotId).toBe('snap_ws_drift_test_2026-05-11');
      expect(snap.workspaceId).toBe(wsId);
      expect(snap.weekStart).toBe('2026-05-11');
      expect(snap.weekEnd).toBeTruthy();
      expect(snap.computedAt).toBeTruthy();
    });

    it('02 counts messages sent (replies + received) correctly', () => {
      const events = makeWeek(wsId, [11, 12, 13]);
      const snap = snapshotSvc.snapshot(wsId, '2026-05-11', events);

      expect(snap.messagesSent).toBe(6);
    });

    it('03 ranks decisions by frequency', () => {
      const events = makeWeek(wsId, [11, 12]);
      const snap = snapshotSvc.snapshot(wsId, '2026-05-11', events);

      expect(snap.decisionsRanked.length).toBeGreaterThan(0);
      expect(snap.decisionsRanked[0]).toMatch(/commerce\./);
    });

    it('04 counts conversions attributed', () => {
      const events = makeWeek(wsId, [11, 12, 13]);
      const snap = snapshotSvc.snapshot(wsId, '2026-05-11', events);

      expect(snap.conversionsAttributed).toBe(3);
    });

    it('05 computes a non-empty narrativeStyleHash', () => {
      const events = makeWeek(wsId, [11]);
      const snap = snapshotSvc.snapshot(wsId, '2026-05-11', events);

      expect(snap.narrativeStyleHash).toBeTruthy();
      expect(snap.narrativeStyleHash).not.toBe('empty');
    });

    it('06 different event sequences produce different hashes', () => {
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
          eventName: 'commerce.lead.created',
          occurredAt: iso(11, 10),
          workspaceId: wsId,
          valence: 'negative',
        }),
        makeEvent({
          eventName: 'commerce.post_sale.churn_risk_detected',
          occurredAt: iso(11, 14),
          workspaceId: wsId,
          valence: 'negative',
        }),
      ];

      const snapA = snapshotSvc.snapshot(wsId, '2026-05-11', evA);
      const snapB = snapshotSvc.snapshot(wsId, '2026-05-11', evB);

      expect(snapA.narrativeStyleHash).not.toBe(snapB.narrativeStyleHash);
    });

    it('07 classifies tones correctly for positive events', () => {
      const events = [
        makeEvent({
          eventName: 'commerce.lead.converted',
          occurredAt: iso(11, 10),
          workspaceId: wsId,
          valence: 'positive',
        }),
        makeEvent({
          eventName: 'commerce.payment.approved',
          occurredAt: iso(11, 11),
          workspaceId: wsId,
          valence: 'positive',
        }),
      ];
      const snap = snapshotSvc.snapshot(wsId, '2026-05-11', events);

      expect(snap.toneClassification.assertivo).toBe(2);
    });

    it('08 classifies negative events as urgente', () => {
      const events = [
        makeEvent({
          eventName: 'commerce.payment.declined',
          occurredAt: iso(11, 10),
          workspaceId: wsId,
          valence: 'negative',
        }),
        makeEvent({
          eventName: 'commerce.post_sale.churn_risk_detected',
          occurredAt: iso(11, 11),
          workspaceId: wsId,
          valence: 'negative',
        }),
      ];
      const snap = snapshotSvc.snapshot(wsId, '2026-05-11', events);

      expect(snap.toneClassification.urgente).toBe(2);
    });

    it('09 detects decision patterns from sequential events', () => {
      const events = [
        makeEvent({
          eventName: 'commerce.lead.converted',
          occurredAt: iso(11, 10),
          workspaceId: wsId,
          valence: 'positive',
        }),
        makeEvent({
          eventName: 'commerce.payment.approved',
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
        makeEvent({
          eventName: 'commerce.payment.approved',
          occurredAt: iso(11, 13),
          workspaceId: wsId,
          valence: 'positive',
        }),
      ];
      const snap = snapshotSvc.snapshot(wsId, '2026-05-11', events);

      expect(snap.decisionPatterns.length).toBeGreaterThan(0);
      expect(snap.decisionPatterns[0]!.pattern).toContain('commerce.lead.converted');
      expect(snap.decisionPatterns[0]!.count).toBe(2);
    });

    it('10 returns zero messagesSent when no message events exist', () => {
      const events = [
        makeEvent({
          eventName: 'commerce.lead.created',
          occurredAt: iso(11, 10),
          workspaceId: wsId,
        }),
        makeEvent({
          eventName: 'commerce.lead.converted',
          occurredAt: iso(11, 11),
          workspaceId: wsId,
          valence: 'positive',
        }),
      ];
      const snap = snapshotSvc.snapshot(wsId, '2026-05-11', events);

      expect(snap.messagesSent).toBe(0);
    });

    it('11 returns empty decisionsRanked when no decision events', () => {
      const events = [
        makeEvent({
          eventName: 'commerce.lead.created',
          occurredAt: iso(11, 10),
          workspaceId: wsId,
        }),
        makeEvent({
          eventName: 'commerce.whatsapp.message_received',
          occurredAt: iso(11, 10, 5),
          workspaceId: wsId,
        }),
      ];
      const snap = snapshotSvc.snapshot(wsId, '2026-05-11', events);

      expect(snap.decisionsRanked.length).toBe(0);
      expect(snap.conversionsAttributed).toBe(0);
    });

    it('12 filters events strictly by workspaceId and week boundaries', () => {
      const evIn = makeWeek(wsId, [11, 12]);
      const evOut = makeWeek('ws_other', [11, 12]);
      const evAfter = makeWeek(wsId, [18, 19]);
      const all = [...evIn, ...evOut, ...evAfter];
      const snap = snapshotSvc.snapshot(wsId, '2026-05-11', all);

      expect(snap.messagesSent).toBe(4);
      expect(snap.conversionsAttributed).toBe(2);
    });

    it('13 empty events produce valid snapshot with zero values', () => {
      const snap = snapshotSvc.snapshot(wsId, '2026-05-11', []);

      expect(snap.messagesSent).toBe(0);
      expect(snap.decisionsRanked).toEqual([]);
      expect(snap.conversionsAttributed).toBe(0);
      expect(snap.narrativeStyleHash).toBe('empty');
      expect(snap.decisionPatterns).toEqual([]);
      for (const t of Object.keys(snap.toneClassification)) {
        expect(snap.toneClassification[t as keyof typeof snap.toneClassification]).toBe(0);
      }
    });
  });

  // ─── DriftDetectorService ────────────────────────────────
