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

describe('WisdomPatternExtractorService — k-anonymity rejection', () => {
  let service: WisdomPatternExtractorService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [WisdomPatternExtractorService, WisdomPrivacyGuardService, WisdomOptService],
    }).compile();
    service = moduleRef.get(WisdomPatternExtractorService);
  });

  test('scenario 01 — single workspace returns empty patterns', () => {
    const sets: WorkspaceEventSet[] = [
      buildEventSet('wks_a', new Date('2026-05-01'), [
        ...makeLeadEvents('wks_a', new Date('2026-05-01'), 20),
        ...makeConversionEvents('wks_a', new Date('2026-05-01'), 5),
        ...makeObjectionEvents(10, 'preco'),
      ]),
    ];
    const result = service.extractPatterns(sets);
    expect(result).toEqual([]);
  });

  test('scenario 02 — 3 workspaces with objection data rejected by k-anonymity (minK=5)', () => {
    const sets: WorkspaceEventSet[] = [];
    for (let w = 1; w <= 3; w++) {
      sets.push(
        buildEventSet(`wks_${w}`, new Date('2026-05-01'), [
          ...makeLeadEvents(`wks_${w}`, new Date('2026-05-01'), 20),
          ...makeObjectionEvents(5, 'preco'),
        ]),
      );
    }
    const result = service.extractPatterns(sets);
    expect(result).toEqual([]);
  });

  test('scenario 03 — 4 workspaces with channel data rejected by k-anonymity', () => {
    const sets: WorkspaceEventSet[] = [];
    for (let w = 1; w <= 4; w++) {
      sets.push(
        buildEventSet(`wks_${w}`, new Date('2026-05-01'), [
          ...makeLeadEvents(`wks_${w}`, new Date('2026-05-01'), 15),
          ...makeWhatsappReplyEvents(10),
        ]),
      );
    }
    const result = service.extractPatterns(sets);
    expect(result).toEqual([]);
  });

  test('scenario 04 — 5 workspaces with objection data accepted (k >= 5)', () => {
    const sets: WorkspaceEventSet[] = [];
    for (let w = 1; w <= 5; w++) {
      sets.push(
        buildEventSet(`wks_${w}`, new Date('2026-05-01'), [
          ...makeLeadEvents(`wks_${w}`, new Date('2026-05-01'), 20),
          ...makeObjectionEvents(5, 'preco'),
        ]),
      );
    }
    const result = service.extractPatterns(sets);
    expect(result.length).toBeGreaterThan(0);
    const objectionPatterns = result.filter((p) => p.kind === 'objection_pattern');
    expect(objectionPatterns.length).toBeGreaterThan(0);
  });

  test('scenario 05 — 7 workspaces with channel data accepted (k >= 5)', () => {
    const sets: WorkspaceEventSet[] = [];
    for (let w = 1; w <= 7; w++) {
      sets.push(
        buildEventSet(`wks_${w}`, new Date('2026-05-01'), [
          ...makeLeadEvents(`wks_${w}`, new Date('2026-05-01'), 15),
          ...makeWhatsappReplyEvents(10),
        ]),
      );
    }
    const result = service.extractPatterns(sets);
    const channelPatterns = result.filter((p) => p.kind === 'channel_efficiency');
    expect(channelPatterns.length).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------ */
/*  Pattern detection scenarios                                        */
/* ------------------------------------------------------------------ */

describe('WisdomPatternExtractorService — pattern detection', () => {
  let service: WisdomPatternExtractorService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [WisdomPatternExtractorService, WisdomPrivacyGuardService, WisdomOptService],
    }).compile();
    service = moduleRef.get(WisdomPatternExtractorService);
  });

  test('scenario 06 — detects objection pattern from 5+ workspaces with common objection keyword', () => {
    const sets: WorkspaceEventSet[] = [];
    for (let w = 1; w <= 6; w++) {
      sets.push(
        buildEventSet(`wks_${w}`, new Date('2026-05-01'), [
          ...makeLeadEvents(`wks_${w}`, new Date('2026-05-01'), 25),
          ...makeConversionEvents(`wks_${w}`, new Date('2026-05-01'), 3),
          ...makeObjectionEvents(4, 'concorrente'),
        ]),
      );
    }
    const result = service.extractPatterns(sets);
    const objection = result.filter((p) => p.kind === 'objection_pattern');
    expect(objection.length).toBeGreaterThan(0);
    for (const p of objection) {
      expect(p.support).toBeGreaterThanOrEqual(5);
      expect(p.dimension).toBe('conversion');
      expect(p.abstractDescription).toContain('concorrente');
    }
  });

  test('scenario 07 — detects channel efficiency pattern from 5+ workspaces with WhatsApp activity', () => {
    const sets: WorkspaceEventSet[] = [];
    for (let w = 1; w <= 8; w++) {
      sets.push(
        buildEventSet(`wks_${w}`, new Date('2026-05-01'), [
          ...makeLeadEvents(`wks_${w}`, new Date('2026-05-01'), 12),
          ...makeWhatsappReplyEvents(8),
        ]),
      );
    }
    const result = service.extractPatterns(sets);
    const channel = result.filter((p) => p.kind === 'channel_efficiency');
    expect(channel.length).toBeGreaterThan(0);
    for (const p of channel) {
      expect(p.support).toBeGreaterThanOrEqual(5);
      expect(p.dimension).toBe('channel');
      expect(p.abstractDescription.toLowerCase()).toMatch(/whatsapp|channel/);
    }
  });

  test('scenario 08 — detects engagement peak pattern from 5+ workspaces with activity peaks', () => {
    const sets: WorkspaceEventSet[] = [];
    for (let w = 1; w <= 6; w++) {
      sets.push(
        buildEventSet(`wks_${w}`, new Date('2026-05-01'), [
          ...makeLeadEvents(`wks_${w}`, new Date('2026-05-01'), 50),
          ...makeConversionEvents(`wks_${w}`, new Date('2026-05-01'), 5),
        ]),
      );
    }
    const result = service.extractPatterns(sets);
    const peaks = result.filter((p) => p.kind === 'engagement_peak');
    expect(peaks.length).toBeGreaterThan(0);
    for (const p of peaks) {
      expect(p.support).toBeGreaterThanOrEqual(5);
      expect(p.dimension).toBe('timing');
    }
  });

  test('scenario 09 — detects conversion decay pattern from 5+ workspaces with stage transitions', () => {
    const sets: WorkspaceEventSet[] = [];
    for (let w = 1; w <= 6; w++) {
      const events: Array<{ name: string; overrides: Partial<SpineEventRef> }> = [
        ...makeLeadEvents(`wks_${w}`, new Date('2026-05-01'), 20),
      ];
      for (let j = 0; j < 10; j++) {
        events.push({
          name: 'commerce.crm.stage_changed',
          overrides: { payload: { fromStage: 'lead', toStage: 'contato' } },
        });
      }
      for (let j = 0; j < 10; j++) {
        events.push({
          name: 'commerce.crm.stage_changed',
          overrides: { payload: { fromStage: 'contato', toStage: 'negociacao' } },
        });
      }
      for (let j = 0; j < 3; j++) {
        events.push({
          name: 'commerce.crm.stage_changed',
          overrides: { payload: { fromStage: 'negociacao', toStage: 'fechamento' } },
        });
      }
      sets.push(buildEventSet(`wks_${w}`, new Date('2026-05-01'), events));
    }
    const result = service.extractPatterns(sets);
    const decay = result.filter((p) => p.kind === 'conversion_decay');
    expect(decay.length).toBeGreaterThan(0);
    for (const p of decay) {
      expect(p.support).toBeGreaterThanOrEqual(5);
      expect(p.dimension).toBe('conversion');
    }
  });

  test('scenario 10 — detects offer-objection correlation from 5+ workspaces with both signals', () => {
    const sets: WorkspaceEventSet[] = [];
    for (let w = 1; w <= 7; w++) {
      sets.push(
        buildEventSet(`wks_${w}`, new Date('2026-05-01'), [
          ...makeLeadEvents(`wks_${w}`, new Date('2026-05-01'), 20),
          ...makeConversionEvents(`wks_${w}`, new Date('2026-05-01'), 3),
          ...makeObjectionEvents(4, 'preco'),
          {
            name: 'commerce.payment.approved',
            overrides: {
              valence: 'positive' as const,
              payload: { productId: `product_${w}` },
            },
          },
        ]),
      );
    }
    const result = service.extractPatterns(sets);
    const correlation = result.filter((p) => p.kind === 'offer_objection_correlation');
    expect(correlation.length).toBeGreaterThan(0);
    for (const p of correlation) {
      expect(p.support).toBeGreaterThanOrEqual(5);
      expect(p.dimension).toBe('offer');
    }
  });

  test('scenario 11 — multiple pattern categories coexist in output from rich dataset', () => {
    const sets: WorkspaceEventSet[] = [];
    for (let w = 1; w <= 10; w++) {
      sets.push(
        buildEventSet(`wks_${w}`, new Date('2026-05-01'), [
          ...makeLeadEvents(`wks_${w}`, new Date('2026-05-01'), 30),
          ...makeConversionEvents(`wks_${w}`, new Date('2026-05-01'), 6),
          ...makeWhatsappReplyEvents(12),
          ...makeObjectionEvents(5, w % 2 === 0 ? 'preco' : 'prazo'),
          ...makeStageTransitionEvents(['lead', 'qualificado', 'proposta', 'fechamento']),
          {
            name: 'commerce.payment.approved',
            overrides: {
              valence: 'positive' as const,
              payload: { productId: `product_${w}` },
            },
          },
        ]),
      );
    }
    const result = service.extractPatterns(sets);
    const kinds = new Set(result.map((p) => p.kind));
    expect(kinds.size).toBeGreaterThan(1);
  });
});

/* ------------------------------------------------------------------ */
/*  PII-free guarantee scenarios                                       */
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
