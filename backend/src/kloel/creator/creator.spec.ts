/**
 * UTP-CREATOR-001..006 — Creator Intelligence Spec
 *
 * Contract tests for Camada XXVI creator layer: audience-partner fit
 * detection, mention timing advice, audience saturation detection,
 * authenticity protection, engagement-vs-conversion tracking, and
 * creator trust capital tracking (extends Camada IX trust).
 */

import { detectAudiencePartnerFit, type PartnerProfile } from './audience-partner-fit.detector';
import { adviseMentionTiming, type MentionHistoryEntry } from './mention-timing.advisor';
import { detectAudienceSaturation } from './audience-saturation.detector';
import { protectAuthenticity } from './authenticity.protector';
import { trackEngagementVsConversion } from './engagement-vs-conversion.tracker';
import { CreatorTrustCapitalTrackerService } from './creator-trust-capital.tracker';

import type { CreatorEvent } from './types';
import type { TrustState } from '../trust/trust.types';

const NOW = Date.parse('2026-05-14T00:00:00.000Z');

function baseCreatorEvent(
  over: Partial<CreatorEvent> = {},
): CreatorEvent {
  return {
    eventId: over.eventId ?? `evt_${Math.random().toString(36).slice(2, 8)}`,
    eventName: over.eventName ?? 'commerce.lead.replied',
    occurredAt: over.occurredAt ?? new Date(NOW).toISOString(),
    ...(over.valence !== undefined ? { valence: over.valence } : {}),
    ...(over.payload !== undefined ? { payload: over.payload } : {}),
  };
}

function trustState(over?: Partial<TrustState>): TrustState {
  return {
    trustScore: over?.trustScore ?? 0.75,
    fatigueLevel: over?.fatigueLevel ?? 0,
    desperationLevel: over?.desperationLevel ?? 0,
    lastInteractionAt: over?.lastInteractionAt ?? new Date(NOW).toISOString(),
    silentInteractionsCount: over?.silentInteractionsCount ?? 0,
    brandRiskFlags: over?.brandRiskFlags ?? [],
  };
}

// ─── CREATOR-001: Audience-Partner Fit Detection ────────────────────

describe('AudiencePartnerFitDetector (UTP-CREATOR-001)', () => {
  const partner: PartnerProfile = {
    partnerId: 'prt_001',
    partnerBrand: 'Marca Exemplo',
    workspaceId: 'wks_test',
    category: 'education',
    valueKeywords: ['aprender', 'conhecimento', 'curso'],
    authenticityRiskBaseline: 0.2,
  };

  it('returns weak fit with insufficient events', () => {
    const events: CreatorEvent[] = [
      baseCreatorEvent({ payload: { messageBody: 'Olá!' } }),
    ];
    const fit = detectAudiencePartnerFit(events, partner);
    expect(fit.verdict).toBe('weak_fit');
    expect(fit.reasons.some((r) => r.includes('insufficient'))).toBe(true);
  });

  it('detects strong fit when audience category matches partner', () => {
    const events: CreatorEvent[] = Array.from({ length: 10 }, () =>
      baseCreatorEvent({
        payload: { messageBody: 'Quero aprender mais sobre investimentos e conhecimento financeiro' },
      }),
    );
    const fit = detectAudiencePartnerFit(events, partner);
    expect(fit.fitScore).toBeGreaterThan(0.5);
    expect(fit.verdict).not.toBe('mismatch');
  });

  it('detects mismatch for unrelated categories', () => {
    const partnerHealth: PartnerProfile = {
      ...partner,
      category: 'health',
      valueKeywords: ['saúde', 'bem-estar'],
    };
    const events: CreatorEvent[] = Array.from({ length: 10 }, () =>
      baseCreatorEvent({
        payload: { messageBody: 'curso de marketing digital e vendas' },
      }),
    );
    const fit = detectAudiencePartnerFit(events, partnerHealth);
    expect(fit.audienceRelevance).toBeLessThan(0.5);
  });

  it('computes authenticity risk from negative signals', () => {
    const events: CreatorEvent[] = [
      ...Array.from({ length: 5 }, () =>
        baseCreatorEvent({
          payload: { messageBody: 'Quero aprender marketing' },
        }),
      ),
      baseCreatorEvent({
        eventName: 'commerce.lead.objection_raised',
        valence: 'negative',
      }),
      baseCreatorEvent({
        eventName: 'commerce.lead.went_silent',
      }),
    ];
    const fit = detectAudiencePartnerFit(events, partner);
    expect(fit.authenticityRisk).toBeGreaterThan(partner.authenticityRiskBaseline);
  });

  it('returns all verdict fields populated', () => {
    const events: CreatorEvent[] = Array.from({ length: 8 }, () =>
      baseCreatorEvent({
        payload: { messageBody: 'curso online de vendas e conversão' },
      }),
    );
    const fit = detectAudiencePartnerFit(events, partner);
    expect(fit.partnerId).toBe('prt_001');
    expect(fit.partnerBrand).toBe('Marca Exemplo');
    expect(fit.workspaceId).toBe('wks_test');
    expect(fit.generatedAt).toBeTruthy();
    expect(fit.reasons.length).toBeGreaterThan(0);
  });
});

// ─── CREATOR-002: Mention Timing Advisor ────────────────────────────

describe('MentionTimingAdvisor (UTP-CREATOR-002)', () => {
  it('recommends now with fresh engagement and no recent mentions', () => {
    const events: CreatorEvent[] = Array.from({ length: 10 }, () =>
      baseCreatorEvent({
        valence: 'positive',
        payload: { messageBody: 'Gostei muito do conteúdo!' },
      }),
    );
    const history: MentionHistoryEntry[] = [];
    const timing = adviseMentionTiming(events, history);
    expect(timing.mentionReady).toBe(true);
    expect(timing.recommendation).toBe('now');
  });

  it('recommends wait when too soon since last mention', () => {
    const events: CreatorEvent[] = Array.from({ length: 10 }, () =>
      baseCreatorEvent({
        valence: 'positive',
        payload: { messageBody: 'Excelente dica!' },
      }),
    );
    const history: MentionHistoryEntry[] = [
      {
        mentionedAt: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
        partnerId: 'prt_001',
        engagementCount: 5,
      },
    ];
    const timing = adviseMentionTiming(events, history);
    expect(timing.recommendation).toBe('wait');
  });

  it('recommends pause when saturation is high', () => {
    const events: CreatorEvent[] = [
      baseCreatorEvent({ payload: { messageBody: 'link na bio com cupom de desconto!' } }),
      baseCreatorEvent({ payload: { messageBody: 'oferta imperdível hoje!' } }),
      baseCreatorEvent({ payload: { messageBody: 'patrocinado pela marca X' } }),
      baseCreatorEvent({ payload: { messageBody: 'use meu código para desconto' } }),
      baseCreatorEvent({ payload: { messageBody: 'parceria com cupom exclusivo' } }),
      baseCreatorEvent({ payload: { messageBody: 'link de afiliado na bio' } }),
    ];
    const timing = adviseMentionTiming(events, []);
    expect(timing.recommendation).toBe('pause');
  });

  it('recommends wait when engagement is low', () => {
    const events: CreatorEvent[] = [
      baseCreatorEvent({ eventName: 'commerce.lead.went_silent' }),
    ];
    const timing = adviseMentionTiming(events, []);
    expect(timing.recommendation).toBe('wait');
  });
});

// ─── CREATOR-003: Audience Saturation Detector ──────────────────────

describe('AudienceSaturationDetector (UTP-CREATOR-003)', () => {
  it('returns not saturated for organic content', () => {
    const events: CreatorEvent[] = Array.from({ length: 10 }, () =>
      baseCreatorEvent({
        payload: { messageBody: 'Hoje quero compartilhar uma experiência...' },
      }),
    );
    const result = detectAudienceSaturation(events);
    expect(result.saturated).toBe(false);
    expect(result.promotionRatio).toBe(0);
  });

  it('detects saturation from high promotion ratio', () => {
    const events: CreatorEvent[] = Array.from({ length: 10 }, () =>
      baseCreatorEvent({
        payload: { messageBody: 'Use meu código de desconto! Link de afiliado na bio!' },
      }),
    );
    const result = detectAudienceSaturation(events);
    expect(result.promotionRatio).toBeGreaterThan(0);
    expect(result.recentMentions).toBeGreaterThan(0);
  });

  it('counts negative signals', () => {
    const events: CreatorEvent[] = [
      baseCreatorEvent({ eventName: 'commerce.lead.objection_raised' }),
      baseCreatorEvent({ eventName: 'commerce.lead.went_silent' }),
      baseCreatorEvent({ eventName: 'commerce.lead.replied', valence: 'negative' }),
    ];
    const result = detectAudienceSaturation(events);
    expect(result.negativeSignalCount).toBeGreaterThanOrEqual(2);
  });

  it('detects falling disengagement trend', () => {
    const olderEvents = Array.from({ length: 6 }, () =>
      baseCreatorEvent({
        eventName: 'commerce.lead.replied',
        valence: 'positive',
      }),
    );
    const newerEvents = Array.from({ length: 2 }, () =>
      baseCreatorEvent({
        eventName: 'commerce.lead.went_silent',
      }),
    );
    const result = detectAudienceSaturation([...olderEvents, ...newerEvents]);
    expect(result.disengagementTrend).toBe('falling');
  });

  it('returns stable for balanced events', () => {
    const events: CreatorEvent[] = Array.from({ length: 8 }, () =>
      baseCreatorEvent({
        eventName: 'commerce.lead.replied',
        valence: 'positive',
        payload: { messageBody: 'Conteúdo muito bom!' },
      }),
    );
    const result = detectAudienceSaturation(events);
    expect(result.saturated).toBe(false);
    expect(result.disengagementTrend).toBe('stable');
  });
});

// ─── CREATOR-004: Authenticity Protector ────────────────────────────

describe('AuthenticityProtector (UTP-CREATOR-004)', () => {
  it('reports high authenticity for clean messages', () => {
    const events: CreatorEvent[] = [
      baseCreatorEvent({
        payload: { messageBody: 'Hoje quero compartilhar uma reflexão sobre aprendizado.' },
      }),
      baseCreatorEvent({
        payload: { messageBody: 'Minha experiência com esse processo foi transformadora.' },
      }),
    ];
    const result = protectAuthenticity(events);
    expect(result.atRisk).toBe(false);
    expect(result.authenticityScore).toBeGreaterThan(0.5);
  });

  it('detects overselling patterns', () => {
    const events: CreatorEvent[] = [
      baseCreatorEvent({ payload: { messageBody: 'Só hoje! Última chance!' } }),
      baseCreatorEvent({ payload: { messageBody: 'Oportunidade única! Não perca!' } }),
      baseCreatorEvent({ payload: { messageBody: 'Vagas limitadas!' } }),
      baseCreatorEvent({ payload: { messageBody: 'acabando!' } }),
    ];
    const result = protectAuthenticity(events, { oversellingRatioThreshold: 0.3 });
    expect(result.atRisk).toBe(true);
    expect(result.warningFlags.some((f) => f.kind === 'overselling')).toBe(true);
  });

  it('detects misleading claims', () => {
    const events: CreatorEvent[] = [
      baseCreatorEvent({
        payload: { messageBody: 'Fature 10k por mês sem esforço, método secreto garantido!' },
      }),
    ];
    const result = protectAuthenticity(events);
    expect(result.warningFlags.some((f) => f.kind === 'misleading_claim')).toBe(true);
  });

  it('detects value misalignment', () => {
    const events: CreatorEvent[] = [
      baseCreatorEvent({
        payload: { messageBody: 'Não gosto mas recomendo mesmo assim!' },
      }),
    ];
    const result = protectAuthenticity(events);
    expect(result.warningFlags.some((f) => f.kind === 'value_misalignment')).toBe(true);
  });

  it('returns empty flags for empty events', () => {
    const result = protectAuthenticity([]);
    expect(result.warningFlags).toHaveLength(0);
    expect(result.atRisk).toBe(false);
    expect(result.authenticityScore).toBeGreaterThan(0);
  });
});

// ─── CREATOR-005: Engagement vs Conversion Tracker ──────────────────

describe('EngagementVsConversionTracker (UTP-CREATOR-005)', () => {
  it('returns healthy balance for engagement-heavy content', () => {
    const events: CreatorEvent[] = Array.from({ length: 10 }, () =>
      baseCreatorEvent({
        eventName: 'commerce.lead.replied',
        valence: 'positive',
        payload: { messageBody: 'Compartilhando uma história de aprendizado hoje.' },
      }),
    );
    const result = trackEngagementVsConversion(events);
    expect(result.balance).not.toBe('crisis');
  });

  it('detects crisis from high conversion pressure', () => {
    const events: CreatorEvent[] = Array.from({ length: 10 }, () =>
      baseCreatorEvent({
        payload: { messageBody: 'Compre agora! Link na bio! Cupom de desconto! Garantia total!' },
      }),
    );
    const result = trackEngagementVsConversion(events);
    expect(result.conversionPressure).toBeGreaterThan(0);
  });

  it('handles empty events gracefully', () => {
    const result = trackEngagementVsConversion([]);
    expect(result.balance).toBe('healthy');
    expect(result.reason).toContain('no recent');
  });

  it('computes interaction frequency from event spacing', () => {
    const events: CreatorEvent[] = [
      baseCreatorEvent({ occurredAt: new Date(NOW - 4 * 60 * 60 * 1000).toISOString() }),
      baseCreatorEvent({ occurredAt: new Date(NOW - 2 * 60 * 60 * 1000).toISOString() }),
      baseCreatorEvent({ occurredAt: new Date(NOW - 1 * 60 * 60 * 1000).toISOString() }),
      baseCreatorEvent({ occurredAt: new Date(NOW).toISOString() }),
    ];
    const result = trackEngagementVsConversion(events);
    expect(result.interactionFrequency).toBeGreaterThan(0);
  });

  it('computes organic ratio from keyword signals', () => {
    const organicEvents: CreatorEvent[] = Array.from({ length: 6 }, () =>
      baseCreatorEvent({
        payload: { messageBody: 'Hoje vou compartilhar minha experiência e reflexão sobre o processo de aprendizado.' },
      }),
    );
    const result = trackEngagementVsConversion(organicEvents);
    expect(result.organicRatio).toBeGreaterThan(0);
  });
});

// ─── CREATOR-006: Creator Trust Capital Tracker ─────────────────────
