import { WisdomPatternExtractorService } from './wisdom-pattern-extractor.service';
import { applyKAnonymity, applyDiffPrivacyNoise, anonymizePatterns, toWisdomPattern } from './wisdom-anonymizer';
import { validateByNWorkspaces, classifyByNWorkspaces } from './wisdom-validator';
import { deriveTaxonomy, taxonomyForSignalKind, ALL_VERTICAL_HINTS, ALL_TICKET_HINTS, ALL_STAGE_HINTS, ALL_CHANNEL_HINTS } from './wisdom-taxonomy';
import { WisdomProjectorService } from './wisdom-projector.service';
import { relevanceScore, filterByRelevance, filterIrrelevant } from './wisdom-relevance-filter';
import { WisdomOptService } from './wisdom-opt';
import { validateAttribution, assertNoAttributionLeak, patternDescriptionIsClean } from './wisdom-attribution.guard';
import type { SpineEventRef } from '../mind/mind.types';
import type { CandidatePattern, WorkspaceEventSet, TargetWorkspaceContext, WisdomPattern } from './wisdom.types';

function makeEvent(
  eventName: string,
  workspaceId: string,
  occurredAt: string,
  overrides: Partial<SpineEventRef> = {},
): SpineEventRef {
  let seq = (makeEvent as { _seq: number })._seq ?? 0;
  seq++;
  (makeEvent as { _seq: number })._seq = seq;
  return {
    eventId: `evt_${String(seq).padStart(5, '0')}`,
    eventName,
    workspaceId,
    occurredAt,
    truthMode: 'observed',
    ...overrides,
  };
}

function buildEventSet(
  workspaceId: string,
  count: number,
  baseDate: Date,
  overrides: Partial<SpineEventRef> = {},
): WorkspaceEventSet {
  const events: SpineEventRef[] = [];
  for (let i = 0; i < count; i++) {
    const t = new Date(baseDate.getTime() + i * 3600_000);
    events.push(makeEvent(
      overrides.eventName ?? 'commerce.lead.created',
      workspaceId,
      t.toISOString(),
      { ...overrides, eventName: overrides.eventName ?? 'commerce.lead.created' },
    ));
  }
  return { workspaceId, events };
}

function multiWorkspaceSets(): WorkspaceEventSet[] {
  const base = new Date('2026-05-01T00:00:00.000Z');
  const sets: WorkspaceEventSet[] = [];

  for (let w = 0; w < 5; w++) {
    const wsId = `wks_${String(w + 1).padStart(3, '0')}`;
    const events: SpineEventRef[] = [];
    for (let i = 0; i < 30; i++) {
      const t = new Date(base.getTime() + i * 7200_000 + w * 86_400_000);
      events.push(makeEvent('commerce.lead.created', wsId, t.toISOString()));
    }
    for (let i = 0; i < 8; i++) {
      const t = new Date(base.getTime() + 50_000_000 + i * 86_400_000 + w * 86_400_000);
      events.push(makeEvent('commerce.lead.converted', wsId, t.toISOString(), { valence: 'positive' }));
    }
    for (let i = 0; i < 12; i++) {
      const t = new Date(base.getTime() + 30_000_000 + i * 36_000_000 + w * 86_400_000);
      events.push(makeEvent('commerce.payment.approved', wsId, t.toISOString(), { valence: 'positive' }));
    }
    for (let i = 0; i < 5; i++) {
      const t = new Date(base.getTime() + 40_000_000 + i * 72_000_000 + w * 86_400_000);
      events.push(makeEvent('commerce.whatsapp.message_replied', wsId, t.toISOString(), { valence: 'positive' }));
    }
    for (let i = 0; i < 2; i++) {
      const t = new Date(base.getTime() + 45_000_000 + i * 100_000_000 + w * 86_400_000);
      events.push(makeEvent('commerce.crm.deal_won', wsId, t.toISOString(), { valence: 'positive' }));
    }
    sets.push({ workspaceId: wsId, events });
  }
  return sets;
}

describe('WISDOM-007 — Opt-In/Out Registry', () => {
  let opt: WisdomOptService;

  beforeEach(() => {
    opt = new WisdomOptService();
  });

  test('default is not opted in', () => {
    expect(opt.isOptedIn('wks_001', 'produtor')).toBe(false);
  });

  test('optIn enables a workspace-role pair', () => {
    opt.optIn('wks_001', 'produtor');
    expect(opt.isOptedIn('wks_001', 'produtor')).toBe(true);
  });

  test('optOut disables a workspace-role pair', () => {
    opt.optIn('wks_001', 'produtor');
    opt.optOut('wks_001', 'produtor');
    expect(opt.isOptedIn('wks_001', 'produtor')).toBe(false);
  });

  test('isWorkspaceOptedIn returns true when an opted-in role opted in', () => {
    opt.optIn('wks_001', 'produtor');
    expect(opt.isWorkspaceOptedIn('wks_001')).toBe(true);
  });

  test('optedInEntries returns only opted-in entries', () => {
    opt.optIn('wks_001', 'produtor');
    opt.optOut('wks_001', 'afiliado');
    opt.optIn('wks_002', 'gestor');
    const entries = opt.optedInEntries();
    expect(entries).toHaveLength(2);
  });

  test('remove deletes a workspace-role entry', () => {
    opt.optIn('wks_001', 'produtor');
    opt.remove('wks_001', 'produtor');
    expect(opt.isOptedIn('wks_001', 'produtor')).toBe(false);
  });

  test('removeWorkspace deletes all entries for a workspace', () => {
    opt.optIn('wks_001', 'produtor');
    opt.optIn('wks_001', 'gestor');
    opt.optIn('wks_002', 'produtor');
    const removed = opt.removeWorkspace('wks_001');
    expect(removed).toBe(2);
    expect(opt.isOptedIn('wks_001', 'produtor')).toBe(false);
    expect(opt.isOptedIn('wks_002', 'produtor')).toBe(true);
  });
});

describe('WISDOM-008 — Attribution Guard', () => {
  test('patternDescriptionIsClean passes for templated descriptions', () => {
    expect(patternDescriptionIsClean('Conversion rate averages 25% across 3 workspaces')).toBe(true);
    expect(patternDescriptionIsClean('Reply rate averages 70% across 5 workspaces')).toBe(true);
    expect(patternDescriptionIsClean('Lead volume pattern detected across 4 workspaces')).toBe(true);
  });

  test('patternDescriptionIsClean fails for descriptions with workspaceId-like tokens', () => {
    expect(patternDescriptionIsClean('Pattern for wks_001 shows high conversion')).toBe(false);
    expect(patternDescriptionIsClean('Pattern for lead_abc123 shows high conversion')).toBe(false);
    expect(patternDescriptionIsClean('email: test@test.com pattern')).toBe(false);
  });

  test('validateAttribution returns ok=true for clean patterns', () => {
    const patterns: WisdomPattern[] = [
      { patternId: 'p1', description: 'Conversion rate averages 25%', applicableConditions: ['conversion_rate > 0'], evidenceWorkspacesCount: 3, confidence: 0.7, signalKind: 'conversion_rate', taxonomy: {} },
    ];
    const result = validateAttribution(patterns);
    expect(result.ok).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  test('validateAttribution returns ok=false for patterns with PII', () => {
    const patterns: WisdomPattern[] = [
      { patternId: 'p_leak', description: 'Pattern for wks_001 shows high conversion', applicableConditions: [], evidenceWorkspacesCount: 2, confidence: 0.5, signalKind: 'conversion_rate', taxonomy: {} },
    ];
    const result = validateAttribution(patterns);
    expect(result.ok).toBe(false);
    expect(result.violations.length).toBeGreaterThan(0);
  });

  test('assertNoAttributionLeak throws on violation', () => {
    const patterns: WisdomPattern[] = [
      { patternId: 'p_bad', description: 'Pattern contains lead_xyz in description', applicableConditions: [], evidenceWorkspacesCount: 2, confidence: 0.5, signalKind: 'conversion_rate', taxonomy: {} },
    ];
    expect(() => assertNoAttributionLeak(patterns)).toThrow('Attribution guard failed');
  });

  test('assertNoAttributionLeak does not throw for clean patterns', () => {
    const patterns: WisdomPattern[] = [
      { patternId: 'p_good', description: 'Conversion rate averages 25% across 3 workspaces', applicableConditions: ['conversion_rate > 0'], evidenceWorkspacesCount: 3, confidence: 0.7, signalKind: 'conversion_rate', taxonomy: {} },
    ];
    expect(() => assertNoAttributionLeak(patterns)).not.toThrow();
  });

  test('validateAttribution checks applicableConditions too', () => {
    const patterns: WisdomPattern[] = [
      { patternId: 'p1', description: 'Clean description', applicableConditions: ['wks_evil'], evidenceWorkspacesCount: 2, confidence: 0.5, signalKind: 'conversion_rate', taxonomy: {} },
    ];
    const result = validateAttribution(patterns);
    expect(result.ok).toBe(false);
  });
});
