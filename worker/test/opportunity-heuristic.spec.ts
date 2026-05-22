import { describe, it, expect } from 'vitest';
import {
  buildHeuristicCatalogScore,
  inferHeuristicDemographics,
} from '../processors/autopilot/opportunity-heuristic';

describe('buildHeuristicCatalogScore', () => {
  it('returns opted-out result when optedOutAt is set', () => {
    const result = buildHeuristicCatalogScore({
      joinedText: 'hello world',
      messages: [],
      unreadCount: 0,
      optedOutAt: new Date(),
    });
    expect(result.leadScore).toBe(0);
    expect(result.buyerStatus).toBe('UNKNOWN');
    expect(result.nextBestAction).toBe('DO_NOT_CONTACT');
    expect(result.reasons).toContain('opt_out_or_converted');
    expect(result.notPurchasedReason).toBe('opted_out');
  });

  it('returns BOUGHT result for won deal', () => {
    const result = buildHeuristicCatalogScore({
      joinedText: 'obrigado',
      messages: [{ direction: 'INBOUND', content: 'obrigado' }],
      unreadCount: 0,
      wonDealTitle: 'Curso Premium',
      wonDealValue: 997,
    });
    expect(result.buyerStatus).toBe('BOUGHT');
    expect(result.leadScore).toBeGreaterThan(0);
    expect(result.purchaseReason).toContain('won_deal');
    expect(result.purchasedProduct).toBe('Curso Premium');
    expect(result.purchaseValue).toBe(997);
  });

  it('returns BOUGHT result for payment confirmation text', () => {
    const result = buildHeuristicCatalogScore({
      joinedText: 'pagamento aprovado obrigada',
      messages: [{ direction: 'INBOUND', content: 'pagamento aprovado obrigada' }],
      unreadCount: 0,
    });
    expect(result.buyerStatus).toBe('BOUGHT');
    expect(result.purchaseReason).toBe('payment_or_access_confirmed_in_chat');
  });

  it('returns BOUGHT with positive sentiment for post-purchase signal', () => {
    const result = buildHeuristicCatalogScore({
      joinedText: 'obrigado perfeito vou comprar assinar',
      messages: [{ direction: 'INBOUND', content: 'obrigado perfeito' }],
      unreadCount: 0,
      wonDealValue: 500,
    });
    expect(result.buyerStatus).toBe('BOUGHT');
    expect(result.sentiment).toBe('POSITIVE');
    expect(result.purchaseProbability).toBe('HIGH');
    expect(result.nextBestAction).toBe('RETAIN_AND_UPSELL');
  });

  it('returns cold lead with buying signal scoring', () => {
    const result = buildHeuristicCatalogScore({
      joinedText: 'quero comprar ja',
      messages: [
        { direction: 'INBOUND', content: 'quero comprar ja', createdAt: new Date() },
        { direction: 'INBOUND', content: 'qual o preco?', createdAt: new Date() },
      ],
      unreadCount: 2,
    });
    expect(result.buyerStatus).toBe('NOT_BOUGHT');
    expect(result.leadScore).toBeGreaterThan(60);
    expect(result.intent).toBe('BUY');
    expect(result.reasons).toContain('buying_signal');
    expect(result.reasons).toContain('multiple_recent_inbounds');
    expect(result.reasons).toContain('has_unread_backlog');
  });

  it('returns cold lead with price inquiry', () => {
    const result = buildHeuristicCatalogScore({
      joinedText: 'preco valor quanto o curso',
      messages: [
        { direction: 'INBOUND', content: 'preco valor quanto o curso', createdAt: new Date() },
      ],
      unreadCount: 0,
    });
    expect(result.buyerStatus).toBe('NOT_BOUGHT');
    expect(result.reasons).toContain('asked_price');
  });

  it('returns cold lead with support/complaint penalty', () => {
    const result = buildHeuristicCatalogScore({
      joinedText: 'problema erro suporte ajuda',
      messages: [
        { direction: 'INBOUND', content: 'problema erro suporte ajuda', createdAt: new Date() },
      ],
      unreadCount: 0,
    });
    expect(result.buyerStatus).toBe('NOT_BOUGHT');
    expect(result.reasons).toContain('support_or_complaint');
  });

  it('penalizes stale interest (>7 days old)', () => {
    const oldDate = new Date(Date.now() - 10 * 24 * 3600000);
    const result = buildHeuristicCatalogScore({
      joinedText: 'oi',
      messages: [{ direction: 'INBOUND', content: 'oi', createdAt: oldDate }],
      unreadCount: 0,
    });
    expect(result.reasons).toContain('stale_interest');
  });

  it('handles empty messages without crashing', () => {
    const result = buildHeuristicCatalogScore({
      joinedText: '',
      messages: [],
      unreadCount: 0,
    });
    expect(result.buyerStatus).toBe('NOT_BOUGHT');
    expect(result.leadScore).toBeGreaterThanOrEqual(0);
    expect(result.leadScore).toBeLessThanOrEqual(100);
  });

  it('returns NEGATIVE sentiment for rude/problem text', () => {
    const result = buildHeuristicCatalogScore({
      joinedText: 'horrivel muito ruim nao gostei',
      messages: [{ direction: 'INBOUND', content: 'horrivel muito ruim', createdAt: new Date() }],
      unreadCount: 0,
    });
    expect(result.sentiment).toBe('NEGATIVE');
  });

  it('detects complaint intent', () => {
    const result = buildHeuristicCatalogScore({
      joinedText: 'cancelar minha conta reclama',
      messages: [
        { direction: 'INBOUND', content: 'cancelar minha conta reclama', createdAt: new Date() },
      ],
      unreadCount: 0,
    });
    expect(result.intent).toBe('COMPLAINT');
  });

  it('scores VERY_HIGH probability for high-score leads', () => {
    const result = buildHeuristicCatalogScore({
      joinedText: 'quero comprar ja me manda o link',
      messages: [
        { direction: 'INBOUND', content: 'quero comprar ja', createdAt: new Date() },
        { direction: 'INBOUND', content: 'me manda o link', createdAt: new Date() },
        { direction: 'INBOUND', content: 'ja fiz o pix', createdAt: new Date() },
      ],
      unreadCount: 3,
    });
    expect(result.purchaseProbability).toBe('VERY_HIGH');
    expect(result.nextBestAction).toBe('PRIORITIZE_MANUAL_FOLLOWUP');
  });

  it('includes demographics in result', () => {
    const result = buildHeuristicCatalogScore({
      joinedText: 'sou homem 30 anos moro em sao paulo',
      messages: [
        {
          direction: 'INBOUND',
          content: 'sou homem 30 anos moro em sao paulo',
          createdAt: new Date(),
        },
      ],
      unreadCount: 0,
    });
    expect(result.demographics.gender).toBe('MASCULINO');
    expect(result.demographics.ageRange).toBe('25-34');
    expect(result.demographics.location).toBe('sao paulo');
    expect(result.demographics.confidence).toBeGreaterThan(0.5);
  });
});

describe('inferHeuristicDemographics', () => {
  it('detects male gender', () => {
    const result = inferHeuristicDemographics('meu nome e joao sou homem');
    expect(result.gender).toBe('MASCULINO');
  });

  it('detects female gender', () => {
    const result = inferHeuristicDemographics('sou mulher meu marido e pedro');
    expect(result.gender).toBe('FEMININO');
  });

  it('returns UNKNOWN for gender when not mentioned', () => {
    const result = inferHeuristicDemographics('oi tudo bem');
    expect(result.gender).toBe('UNKNOWN');
  });

  it('detects age range 18-24', () => {
    const result = inferHeuristicDemographics('tenho 22 anos');
    expect(result.ageRange).toBe('18-24');
  });

  it('detects age range 35-44', () => {
    const result = inferHeuristicDemographics('minha idade 38 anos');
    expect(result.ageRange).toBe('35-44');
  });

  it('detects age range 55+', () => {
    const result = inferHeuristicDemographics('tenho 60 anos');
    expect(result.ageRange).toBe('55+');
  });

  it('returns UNKNOWN age when not mentioned', () => {
    const result = inferHeuristicDemographics('oi tudo bem');
    expect(result.ageRange).toBe('UNKNOWN');
  });

  it('extracts location', () => {
    const result = inferHeuristicDemographics('sou de rio de janeiro capital');
    expect(result.location).not.toBe('UNKNOWN');
  });

  it('returns UNKNOWN location when no match', () => {
    const result = inferHeuristicDemographics('oi');
    expect(result.location).toBe('UNKNOWN');
  });

  it('returns low confidence with no demographics detected', () => {
    const result = inferHeuristicDemographics('oi');
    expect(result.confidence).toBe(0);
  });

  it('returns high confidence when all demographics detected', () => {
    const result = inferHeuristicDemographics(
      'me chamo maria sou mulher tenho 28 anos sou de belo horizonte',
    );
    expect(result.confidence).toBeGreaterThanOrEqual(0.55);
  });

  it('handles empty string', () => {
    const result = inferHeuristicDemographics('');
    expect(result.gender).toBe('UNKNOWN');
    expect(result.confidence).toBe(0);
  });
});
