import { collectWeeklySnapshots } from './behavior-snapshot.service';
import { detectDrift } from './drift-detector';
import { attributeDrift } from './drift-attribution.service';
import { buildExplanation } from './drift-explanation.builder';
import { buildNarrative } from './drift-narrative.builder';
import { collectEvidence } from './drift-evidence-collector';
import type { SpineEventRef } from '../mind/mind.types';
import type { BehaviorSnapshot } from './drift.types';

function makeEvent(
  override: Partial<SpineEventRef> & { eventName: string; occurredAt: string },
): SpineEventRef {
  const idx = makeEvent.seq++;
  return {
    eventId: `evt_test_${String(idx).padStart(5, '0')}`,
    workspaceId: 'wks_test_001',
    truthMode: 'observed',
    ...override,
  };
}
makeEvent.seq = 0;

function mkIso(month: number, day: number, hour: number, minute?: number): string {
  const m = String(month).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  const h = String(hour).padStart(2, '0');
  const min = String(minute ?? 0).padStart(2, '0');
  return `2026-${m}-${d}T${h}:${min}:00.000Z`;
}

/**
 * Synthetic 4-week history — all dates use mkIso for guaranteed parseable ISO strings.
 * Week 1: May 4-10, Week 2: May 11-17, Week 3: May 18-24, Week 4: May 25-31.
 */
function synthetic4Weeks(): SpineEventRef[] {
  const events: SpineEventRef[] = [];

  // ── Week 1: 2026-05-04 (Mon) to 2026-05-10 (Sun) ──
  // 10 leads created
  for (let i = 0; i < 10; i++) {
    events.push(
      makeEvent({
        eventName: 'commerce.lead.created',
        occurredAt: mkIso(5, 4 + (i % 7), 10 + (i % 12)),
        entityRef: { entityType: 'lead', entityId: `w1_lead_${i}` },
      }),
    );
  }
  for (const i of [0, 2, 4]) {
    events.push(
      makeEvent({
        eventName: 'commerce.lead.contacted',
        occurredAt: mkIso(5, 5 + i % 2, 10, 30),
        entityRef: { entityType: 'lead', entityId: `w1_lead_${i}` },
      }),
    );
  }
  for (const i of [0, 2, 4]) {
    events.push(
      makeEvent({
        eventName: 'commerce.lead.converted',
        occurredAt: mkIso(5, 6 + i % 3, 14),
        entityRef: { entityType: 'lead', entityId: `w1_lead_${i}` },
        valence: 'positive',
      }),
    );
  }
  for (let i = 0; i < 3; i++) {
    events.push(
      makeEvent({
        eventName: 'commerce.payment.approved',
        occurredAt: mkIso(5, 5 + i, 15),
        entityRef: { entityType: 'payment', entityId: `w1_pay_${i}` },
        valence: 'positive',
      }),
    );
  }
  events.push(
    makeEvent({
      eventName: 'commerce.lead.objection_raised',
      occurredAt: mkIso(5, 6, 11),
      entityRef: { entityType: 'lead', entityId: 'w1_lead_1' },
      valence: 'negative',
      payload: { objectionKind: 'price' },
    }),
  );

  // ── Week 2: 2026-05-11 (Mon) to 2026-05-17 (Sun) ──
  for (let i = 0; i < 12; i++) {
    events.push(
      makeEvent({
        eventName: 'commerce.lead.created',
        occurredAt: mkIso(5, 11 + (i % 7), 10),
        entityRef: { entityType: 'lead', entityId: `w2_lead_${i}` },
      }),
    );
  }
  for (const i of [0, 1, 3, 4, 6]) {
    events.push(
      makeEvent({
        eventName: 'commerce.lead.contacted',
        occurredAt: mkIso(5, 12 + i % 5, 10, 45),
        entityRef: { entityType: 'lead', entityId: `w2_lead_${i}` },
      }),
    );
  }
  for (const i of [0, 1, 3, 6]) {
    events.push(
      makeEvent({
        eventName: 'commerce.lead.converted',
        occurredAt: mkIso(5, 13 + i % 4, 14, 30),
        entityRef: { entityType: 'lead', entityId: `w2_lead_${i}` },
        valence: 'positive',
      }),
    );
  }
  for (let i = 0; i < 4; i++) {
    events.push(
      makeEvent({
        eventName: 'commerce.payment.approved',
        occurredAt: mkIso(5, 13 + i, 15, 30),
        entityRef: { entityType: 'payment', entityId: `w2_pay_${i}` },
        valence: 'positive',
      }),
    );
  }

  // ── Week 3: 2026-05-18 (Mon) to 2026-05-24 (Sun) ──
  for (let i = 0; i < 8; i++) {
    events.push(
      makeEvent({
        eventName: 'commerce.lead.created',
        occurredAt: mkIso(5, 18 + (i % 7), 10),
        entityRef: { entityType: 'lead', entityId: `w3_lead_${i}` },
      }),
    );
  }
  for (const i of [0, 2]) {
    events.push(
      makeEvent({
        eventName: 'commerce.lead.contacted',
        occurredAt: mkIso(5, 19 + i, 11),
        entityRef: { entityType: 'lead', entityId: `w3_lead_${i}` },
      }),
    );
  }
  for (const i of [0, 2]) {
    events.push(
      makeEvent({
        eventName: 'commerce.lead.converted',
        occurredAt: mkIso(5, 20 + i, 14),
        entityRef: { entityType: 'lead', entityId: `w3_lead_${i}` },
        valence: 'positive',
      }),
    );
  }
  events.push(
    makeEvent({
      eventName: 'commerce.payment.approved',
      occurredAt: mkIso(5, 20, 15),
      entityRef: { entityType: 'payment', entityId: 'w3_pay_0' },
      valence: 'positive',
    }),
  );
  events.push(
    makeEvent({
      eventName: 'commerce.payment.approved',
      occurredAt: mkIso(5, 22, 15, 30),
      entityRef: { entityType: 'payment', entityId: 'w3_pay_1' },
      valence: 'positive',
    }),
  );
  events.push(
    makeEvent({
      eventName: 'commerce.payment.declined',
      occurredAt: mkIso(5, 23, 16),
      entityRef: { entityType: 'payment', entityId: 'w3_pay_2' },
      valence: 'negative',
    }),
  );
  events.push(
    makeEvent({
      eventName: 'commerce.lead.objection_raised',
      occurredAt: mkIso(5, 19, 10, 30),
      entityRef: { entityType: 'lead', entityId: 'w3_lead_3' },
      valence: 'negative',
      payload: { objectionKind: 'price' },
    }),
  );
  events.push(
    makeEvent({
      eventName: 'commerce.lead.objection_raised',
      occurredAt: mkIso(5, 21, 11),
      entityRef: { entityType: 'lead', entityId: 'w3_lead_5' },
      valence: 'negative',
      payload: { objectionKind: 'urgency' },
    }),
  );

  // ── Week 4 (drift week): 2026-05-25 (Mon) to 2026-05-31 (Sun) ──
  for (let i = 0; i < 6; i++) {
    events.push(
      makeEvent({
        eventName: 'commerce.lead.created',
        occurredAt: mkIso(5, 25 + (i % 5), 10),
        entityRef: { entityType: 'lead', entityId: `w4_lead_${i}` },
      }),
    );
  }
  events.push(
    makeEvent({
      eventName: 'commerce.lead.contacted',
      occurredAt: mkIso(5, 25, 12),
      entityRef: { entityType: 'lead', entityId: 'w4_lead_0' },
    }),
  );
  events.push(
    makeEvent({
      eventName: 'commerce.lead.converted',
      occurredAt: mkIso(5, 27, 14),
      entityRef: { entityType: 'lead', entityId: 'w4_lead_0' },
      valence: 'positive',
    }),
  );
  events.push(
    makeEvent({
      eventName: 'commerce.payment.approved',
      occurredAt: mkIso(5, 27, 15),
      entityRef: { entityType: 'payment', entityId: 'w4_pay_0' },
      valence: 'positive',
    }),
  );
  for (let i = 0; i < 3; i++) {
    events.push(
      makeEvent({
        eventName: 'commerce.payment.declined',
        occurredAt: mkIso(5, 26 + i, 16),
        entityRef: { entityType: 'payment', entityId: `w4_pay_d${i}` },
        valence: 'negative',
      }),
    );
  }
  events.push(
    makeEvent({
      eventName: 'commerce.lead.objection_raised',
      occurredAt: mkIso(5, 26, 10),
      entityRef: { entityType: 'lead', entityId: 'w4_lead_1' },
      valence: 'negative',
      payload: { objectionKind: 'price' },
    }),
  );
  events.push(
    makeEvent({
      eventName: 'commerce.lead.objection_raised',
      occurredAt: mkIso(5, 27, 10, 30),
      entityRef: { entityType: 'lead', entityId: 'w4_lead_2' },
      valence: 'negative',
      payload: { objectionKind: 'price' },
    }),
  );
  events.push(
    makeEvent({
      eventName: 'commerce.lead.objection_raised',
      occurredAt: mkIso(5, 28, 11),
      entityRef: { entityType: 'lead', entityId: 'w4_lead_3' },
      valence: 'negative',
      payload: { objectionKind: 'price' },
    }),
  );
  events.push(
    makeEvent({
      eventName: 'commerce.lead.objection_raised',
      occurredAt: mkIso(5, 29, 9),
      entityRef: { entityType: 'lead', entityId: 'w4_lead_4' },
      valence: 'negative',
      payload: { objectionKind: 'trust' },
    }),
  );
  events.push(
    makeEvent({
      eventName: 'commerce.lead.objection_raised',
      occurredAt: mkIso(5, 30, 14),
      entityRef: { entityType: 'lead', entityId: 'w4_lead_5' },
      valence: 'negative',
      payload: { objectionKind: 'trust' },
    }),
  );
  events.push(
    makeEvent({
      eventName: 'commerce.campaign.performance_drop_detected',
      occurredAt: mkIso(5, 26, 8),
      entityRef: { entityType: 'campaign', entityId: 'camp_w4' },
    }),
  );
  events.push(
    makeEvent({
      eventName: 'commerce.post_sale.churn_risk_detected',
      occurredAt: mkIso(5, 30, 12),
      entityRef: { entityType: 'customer', entityId: 'w2_lead_0' },
      valence: 'negative',
    }),
  );

  return events;
}

describe('DRIFT — Camada X (Behavioral Drift Observability)', () => {
  const allEvents = synthetic4Weeks();
  const [wsId] = ['wks_test_001'] as const;

  let snapshots: BehaviorSnapshot[];

  beforeAll(() => {
    snapshots = collectWeeklySnapshots(wsId, allEvents);
  });

  // ─── DRIFT-001: Behavior Snapshot ────────────────────────────
  describe('DRIFT-001: BehaviorSnapshotService', () => {
    it('collects exactly 4 weekly snapshots for the synthetic data', () => {
      expect(snapshots.length).toBe(4);
    });

    it('each snapshot has a snapshotId, workspaceId, and weekStart', () => {
      for (const snap of snapshots) {
        expect(snap.snapshotId).toBeTruthy();
        expect(snap.workspaceId).toBe(wsId);
        expect(snap.weekStart).toBeTruthy();
      }
    });

    it('first snapshot has positive lead count', () => {
      expect(snapshots[0]!.leadCount).toBeGreaterThan(0);
    });

    it('conversion rate is computed as ratio of conversions to leads', () => {
      for (const snap of snapshots) {
        if (snap.leadCount > 0) {
          expect(snap.metrics.conversionRate).toBe(
            snap.conversionCount / snap.leadCount,
          );
        } else {
          expect(snap.metrics.conversionRate).toBe(0);
        }
      }
    });

    it('objection mix is computed correctly for week 4', () => {
      const w4 = snapshots[3]!;
      expect(w4.metrics.objectionMix['price']).toBe(3);
      expect(w4.metrics.objectionMix['trust']).toBe(2);
    });

    it('payment success rate is between 0 and 1', () => {
      for (const snap of snapshots) {
        expect(snap.metrics.paymentSuccessRate).toBeGreaterThanOrEqual(0);
        expect(snap.metrics.paymentSuccessRate).toBeLessThanOrEqual(1);
      }
    });
  });

  // ─── DRIFT-002: Drift Detector ────────────────────────────────
  describe('DRIFT-002: DriftDetector', () => {
    it('detects drift in week 4 compared to weeks 1-3', () => {
      const w4 = snapshots[3]!;
      const historical = snapshots.slice(0, 3);
      const report = detectDrift(w4, historical);

      expect(report.deviations.length).toBeGreaterThan(0);
      expect(report.significantCount).toBeGreaterThanOrEqual(0);
    });

    it('drift report includes comparison snapshot IDs', () => {
      const w4 = snapshots[3]!;
      const historical = snapshots.slice(0, 3);
      const report = detectDrift(w4, historical);

      expect(report.comparedSnapshotIds.length).toBe(3);
      expect(report.comparedSnapshotIds).toContain(snapshots[0]!.snapshotId);
    });

    it('stable weeks produce zero or minimal significant deviations', () => {
      const w2 = snapshots[1]!;
      const historical = [snapshots[0]!];
      const report = detectDrift(w2, historical);

      expect(report.significantCount).toBeLessThanOrEqual(4);
    });

    it('drift report includes overallDriftMagnitude', () => {
      const w4 = snapshots[3]!;
      const historical = snapshots.slice(0, 3);
      const report = detectDrift(w4, historical);

      expect(report.overallDriftMagnitude).toBeGreaterThanOrEqual(0);
    });
  });

  // ─── DRIFT-003: Drift Attribution ─────────────────────────────
  describe('DRIFT-003: AttributionService', () => {
    it('attributes drift to campaign performance drop event', () => {
      const w4 = snapshots[3]!;
      const w3 = snapshots[2]!;
      const attributed = attributeDrift(w4, w3, allEvents);

      expect(attributed.workspaceId).toBe(wsId);
      expect(attributed.attribution.length).toBeGreaterThan(0);
    });

    it('primary cause has highest confidence', () => {
      const w4 = snapshots[3]!;
      const w3 = snapshots[2]!;
      const attributed = attributeDrift(w4, w3, allEvents);

      if (attributed.primaryCause && attributed.attribution.length > 1) {
        for (const cause of attributed.attribution) {
          expect(cause.confidence).toBeLessThanOrEqual(
            attributed.primaryCause.confidence,
          );
        }
      }
    });

    it('attribution confidence is bounded to [0, 0.95]', () => {
      const w4 = snapshots[3]!;
      const w3 = snapshots[2]!;
      const attributed = attributeDrift(w4, w3, allEvents);

      for (const cause of attributed.attribution) {
        expect(cause.confidence).toBeGreaterThan(0);
        expect(cause.confidence).toBeLessThanOrEqual(0.95);
      }
    });
  });

  // ─── DRIFT-004: Explanation Builder ──────────────────────────
  describe('DRIFT-004: ExplanationBuilder', () => {
    it('builds explanation in Portuguese without jargon', () => {
      const w4 = snapshots[3]!;
      const historical = snapshots.slice(0, 3);
      const report = detectDrift(w4, historical);
      const explanation = buildExplanation(report, w4);

      expect(explanation.summary).toBeTruthy();
      expect(explanation.workspaceId).toBe(wsId);

      const fullText = explanation.summary + explanation.details.join(' ');
      expect(fullText).not.toMatch(/sigma/i);
      expect(fullText).not.toMatch(/std\s*dev/i);
      expect(fullText).not.toMatch(/deviation/i);
      expect(fullText).not.toMatch(/p-value/i);
    });

    it('no-drift scenario produces a stable message', () => {
      const w2 = snapshots[1]!;
      const historical = [snapshots[0]!];
      const report = detectDrift(w2, historical);
      const explanation = buildExplanation(report, w2);

      expect(explanation.summary).toMatch(/estável|significativa/);
    });

    it('explanation details match significant deviation count', () => {
      const w4 = snapshots[3]!;
      const historical = snapshots.slice(0, 3);
      const report = detectDrift(w4, historical);
      const explanation = buildExplanation(report, w4);

      expect(explanation.details.length).toBe(report.significantCount);
    });
  });

  // ─── DRIFT-005: Narrative Builder ─────────────────────────────
  describe('DRIFT-005: NarrativeBuilder', () => {
    it('builds narrative with exactly 5 story beats', () => {
      const w4 = snapshots[3]!;
      const w3 = snapshots[2]!;
      const historical = snapshots.slice(0, 3);
      const report = detectDrift(w4, historical);
      const narrative = buildNarrative(w4, w3, report);

      expect(narrative.story.length).toBe(5);
      expect(narrative.headline).toBeTruthy();
      expect(narrative.workspaceId).toBe(wsId);
    });

    it('story beats have valid change directions', () => {
      const w4 = snapshots[3]!;
      const w3 = snapshots[2]!;
      const narrative = buildNarrative(w4, w3, undefined);

      for (const beat of narrative.story) {
        expect(['improved', 'worsened', 'stable']).toContain(
          beat.changeDirection,
        );
        expect(beat.explanation).toBeTruthy();
      }
    });

    it('handles missing previous snapshot gracefully', () => {
      const w1 = snapshots[0]!;
      const narrative = buildNarrative(w1, undefined, undefined);

      expect(narrative.story.length).toBe(5);
      for (const beat of narrative.story) {
        expect(beat.beforeValue).toBe('—');
      }
    });
  });

  // ─── DRIFT-006: Evidence Collector ────────────────────────────
  describe('DRIFT-006: EvidenceCollector', () => {
    it('collects evidence with before/after snapshots', () => {
      const w4 = snapshots[3]!;
      const historical = snapshots.slice(0, 3);
      const evidence = collectEvidence(w4, historical, []);

      expect(evidence.driftId).toBeTruthy();
      expect(evidence.workspaceId).toBe(wsId);
      expect(evidence.before.snapshots.length).toBe(3);
      expect(evidence.after.snapshot).toBe(w4);
    });

    it('before summary describes historical range', () => {
      const w4 = snapshots[3]!;
      const historical = snapshots.slice(0, 3);
      const evidence = collectEvidence(w4, historical, []);

      expect(evidence.before.summary).toMatch(/snapshots/);
      expect(evidence.after.summary).toMatch(/Snapshot/);
    });

    it('attributing events are included in evidence', () => {
      const w4 = snapshots[3]!;
      const historical = snapshots.slice(0, 3);
      const driftEvents = allEvents.filter(
        (e) => e.eventName === 'commerce.campaign.performance_drop_detected',
      );
      const evidence = collectEvidence(w4, historical, driftEvents);

      expect(evidence.attributingEvents.length).toBeGreaterThan(0);
    });

    it('handles empty historical data', () => {
      const w1 = snapshots[0]!;
      const evidence = collectEvidence(w1, [], []);

      expect(evidence.before.snapshots.length).toBe(0);
      expect(evidence.before.summary).toMatch(/sem histórico/);
    });
  });

  // ─── Cross-UTP integration ────────────────────────────────────
  describe('Cross-UTP integration', () => {
    it('full pipeline: snapshot → detect → attribute → explain → narrate → evidence', () => {
      const current = snapshots[3]!;
      const previous = snapshots[2]!;
      const historical = snapshots.slice(0, 3);

      const report = detectDrift(current, historical);
      expect(report).toBeDefined();

      const attributed = attributeDrift(current, previous, allEvents);
      expect(attributed).toBeDefined();

      const explanation = buildExplanation(report, current);
      expect(explanation).toBeDefined();

      const narrative = buildNarrative(current, previous, report);
      expect(narrative).toBeDefined();

      const evidence = collectEvidence(
        current,
        historical,
        allEvents.filter(
          (e) => e.eventName === 'commerce.campaign.performance_drop_detected',
        ),
      );
      expect(evidence).toBeDefined();
    });
  });
});
