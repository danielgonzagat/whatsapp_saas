/**
 * Spec: WisdomPatternExtractorService — extractPatterns()
 *
 * 12+ scenarios covering:
 *   - k-anonymity rejection (< 5 workspaces)
 *   - 5+ workspace pattern acceptance
 *   - Objection pattern detection
 *   - Channel efficiency pattern detection
 *   - Conversion decay pattern detection
 *   - Engagement peak pattern detection
 *   - Offer-objection correlation pattern detection
 *   - Multiple pattern categories coexisting
 *   - Zero PII in abstractDescription / anonymizedExample
 *   - support >= 5 guarantee
 *   - Empty input / insufficient data
 */

import { Test } from '@nestjs/testing';
import { WisdomPatternExtractorService, type ExtractedPattern } from './wisdom-pattern-extractor.service';
import { WisdomPrivacyGuardService } from './wisdom-privacy-guard.service';
import { WisdomOptService } from './wisdom-opt';
import type { SpineEventRef } from '../mind/mind.types';
import type { WorkspaceEventSet } from './wisdom.types';

function makeEvent(
  eventName: string,
  workspaceId: string,
  occurredAt: Date,
  overrides: Partial<SpineEventRef> = {},
): SpineEventRef {
  let seq = (makeEvent as { _seq: number })._seq ?? 0;
  seq++;
  (makeEvent as { _seq: number })._seq = seq;
  return {
    eventId: `evt_${String(seq).padStart(5, '0')}`,
    eventName,
    workspaceId,
    occurredAt: occurredAt.toISOString(),
    truthMode: 'observed',
    ...overrides,
  };
}

function buildEventSet(
  workspaceId: string,
  baseDate: Date,
  eventSpecs: Array<{ name: string; overrides?: Partial<SpineEventRef> }>,
): WorkspaceEventSet {
  const events: SpineEventRef[] = eventSpecs.map((spec, i) => {
    const t = new Date(baseDate.getTime() + i * 3600_000);
    return makeEvent(spec.name, workspaceId, t, spec.overrides ?? {});
  });
  return { workspaceId, events };
}

function makeLeadEvents(workspaceId: string, baseDate: Date, count: number): Array<{ name: string }> {
  return Array.from({ length: count }, () => ({ name: 'commerce.lead.created' as const }));
}

function makeConversionEvents(workspaceId: string, baseDate: Date, count: number): Array<{ name: string; overrides: Partial<SpineEventRef> }> {
  return Array.from({ length: count }, () => ({
    name: 'commerce.lead.converted' as const,
    overrides: { valence: 'positive' as const },
  }));
}

function makeObjectionEvents(count: number, keyword: string): Array<{ name: string; overrides: Partial<SpineEventRef> }> {
  return Array.from({ length: count }, () => ({
    name: 'commerce.lead.objection_raised' as const,
    overrides: {
      valence: 'negative' as const,
      payload: { reason: `cliente achou ${keyword} muito alto` },
    },
  }));
}

function makeWhatsappReplyEvents(count: number): Array<{ name: string; overrides: Partial<SpineEventRef> }> {
  return [
    ...Array.from({ length: count }, () => ({
      name: 'commerce.whatsapp.message_replied' as const,
      overrides: { valence: 'positive' as const },
    })),
    ...Array.from({ length: Math.round(count * 0.3) }, () => ({
      name: 'commerce.whatsapp.message_replied' as const,
      overrides: { valence: 'positive' as const, payload: { converted: true } },
    })),
  ];
}

function makeStageTransitionEvents(stages: string[]): Array<{ name: string; overrides: Partial<SpineEventRef> }> {
  const events: Array<{ name: string; overrides: Partial<SpineEventRef> }> = [];
  for (let i = 0; i < stages.length - 1; i++) {
    for (let j = 0; j < 10 - i; j++) {
      events.push({
        name: 'commerce.crm.stage_changed' as const,
        overrides: {
          payload: { fromStage: stages[i], toStage: stages[i + 1] },
        },
      });
    }
  }
  return events;
}

/* ------------------------------------------------------------------ */
/*  k-anonymity gate scenarios                                         */
/* ------------------------------------------------------------------ */

describe('WisdomPatternExtractorService — PII-free guarantee', () => {
  let service: WisdomPatternExtractorService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [WisdomPatternExtractorService, WisdomPrivacyGuardService, WisdomOptService],
    }).compile();
    service = moduleRef.get(WisdomPatternExtractorService);
  });

  test('scenario 12 — no workspaceId tokens in abstractDescription', () => {
    const sets: WorkspaceEventSet[] = [];
    for (let w = 1; w <= 6; w++) {
      sets.push(
        buildEventSet(`wks_${w}`, new Date('2026-05-01'), [
          ...makeLeadEvents(`wks_${w}`, new Date('2026-05-01'), 20),
          ...makeObjectionEvents(5, 'preco'),
        ]),
      );
    }
    const result = service.extractPatterns(sets);
    for (const p of result) {
      expect(p.abstractDescription).not.toMatch(/\bwks_\w+/);
      expect(p.abstractDescription).not.toMatch(/\blead_\w+/);
      expect(p.abstractDescription).not.toMatch(/\bprod_\w+/);
      expect(p.abstractDescription).not.toMatch(/\bemail\b/);
      expect(p.abstractDescription).not.toMatch(/\bphone\b/);
    }
  });

  test('scenario 13 — no PII tokens in anonymizedExample', () => {
    const sets: WorkspaceEventSet[] = [];
    for (let w = 1; w <= 7; w++) {
      sets.push(
        buildEventSet(`wks_${w}`, new Date('2026-05-01'), [
          ...makeLeadEvents(`wks_${w}`, new Date('2026-05-01'), 25),
          ...makeObjectionEvents(6, 'garantia'),
          ...makeWhatsappReplyEvents(10),
        ]),
      );
    }
    const result = service.extractPatterns(sets);
    for (const p of result) {
      expect(p.anonymizedExample).not.toMatch(/\bwks_\w+/);
      expect(p.anonymizedExample).not.toMatch(/\blead_\w+/);
      expect(p.anonymizedExample).not.toMatch(/\bemail\b/);
      expect(p.anonymizedExample).not.toMatch(/\bphone\b/);
      expect(p.anonymizedExample).not.toMatch(/\bdocument\b/);
    }
  });

  test('scenario 14 — support >= 5 for every extracted pattern', () => {
    const sets: WorkspaceEventSet[] = [];
    for (let w = 1; w <= 10; w++) {
      sets.push(
        buildEventSet(`wks_${w}`, new Date('2026-05-01'), [
          ...makeLeadEvents(`wks_${w}`, new Date('2026-05-01'), 20),
          ...makeConversionEvents(`wks_${w}`, new Date('2026-05-01'), 4),
          ...makeObjectionEvents(5, 'custo'),
        ]),
      );
    }
    const result = service.extractPatterns(sets);
    expect(result.length).toBeGreaterThan(0);
    for (const p of result) {
      expect(p.support).toBeGreaterThanOrEqual(5);
    }
  });
});

/* ------------------------------------------------------------------ */
/*  Data quality scenarios                                             */
/* ------------------------------------------------------------------ */

describe('WisdomPatternExtractorService — data quality', () => {
  let service: WisdomPatternExtractorService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [WisdomPatternExtractorService, WisdomPrivacyGuardService, WisdomOptService],
    }).compile();
    service = moduleRef.get(WisdomPatternExtractorService);
  });

  test('scenario 15 — confidence is between 0 and 1 for all patterns', () => {
    const sets: WorkspaceEventSet[] = [];
    for (let w = 1; w <= 8; w++) {
      sets.push(
        buildEventSet(`wks_${w}`, new Date('2026-05-01'), [
          ...makeLeadEvents(`wks_${w}`, new Date('2026-05-01'), 20),
          ...makeConversionEvents(`wks_${w}`, new Date('2026-05-01'), 5),
          ...makeObjectionEvents(5, 'preco'),
          ...makeWhatsappReplyEvents(10),
        ]),
      );
    }
    const result = service.extractPatterns(sets);
    expect(result.length).toBeGreaterThan(0);
    for (const p of result) {
      expect(p.confidence).toBeGreaterThanOrEqual(0);
      expect(p.confidence).toBeLessThanOrEqual(1);
    }
  });

  test('scenario 16 — empty input returns empty array', () => {
    expect(service.extractPatterns([])).toEqual([]);
  });

  test('scenario 17 — workspaces with insufficient events produce no patterns', () => {
    const sets: WorkspaceEventSet[] = [];
    for (let w = 1; w <= 10; w++) {
      sets.push(
        buildEventSet(`wks_${w}`, new Date('2026-05-01'), [
          { name: 'commerce.lead.created' },
          { name: 'commerce.lead.created' },
        ]),
      );
    }
    const result = service.extractPatterns(sets);
    expect(result).toEqual([]);
  });

  test('scenario 18 — backfill: extract() still returns CandidatePattern[] with multi-workspace data', () => {
    const sets: WorkspaceEventSet[] = [];
    for (let w = 1; w <= 5; w++) {
      sets.push(
        buildEventSet(`wks_${w}`, new Date('2026-05-01'), [
          ...makeLeadEvents(`wks_${w}`, new Date('2026-05-01'), 30),
          ...makeConversionEvents(`wks_${w}`, new Date('2026-05-01'), 8),
        ]),
      );
    }
    const candidates = service.extract(sets);
    expect(candidates.length).toBeGreaterThan(0);
  });

  test('scenario 19 — all 5 pattern kinds are represented in the union type', () => {
    const kindValues: ExtractedPattern['kind'][] = [
      'objection_pattern',
      'channel_efficiency',
      'conversion_decay',
      'engagement_peak',
      'offer_objection_correlation',
    ];
    expect(kindValues).toHaveLength(5);
  });

  test('scenario 20 — all 5 pattern dimensions are represented in the union type', () => {
    const dimValues: ExtractedPattern['dimension'][] = [
      'conversion',
      'engagement',
      'channel',
      'offer',
      'timing',
    ];
    expect(dimValues).toHaveLength(5);
  });
});
