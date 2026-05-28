import { resolveCaseMemoryAction } from './mind-case-memory-decision.helper';
import type { CaseMemoryLookup } from './mind-case-memory-decision.helper';

describe('resolveCaseMemoryAction', () => {
  const mockCases = (rows: Array<Record<string, unknown>>): CaseMemoryLookup => ({
    similar: jest.fn().mockResolvedValue(rows),
  });

  it('returns null when fewer than minSimilarCases', async () => {
    const cases = mockCases([]);
    const result = await resolveCaseMemoryAction(cases, {
      workspaceId: 'ws-1',
      caseType: 'tom',
      text: 'channel whatsapp soldRate 0.05',
      features: { channel: 'whatsapp' },
      options: ['FRIENDLY', 'DIRECT'],
      minSimilarCases: 3,
      minSimilarityTotal: 1.2,
    });
    expect(result).toBeNull();
  });

  it('returns null when options do not match a stored case action', async () => {
    const cases = mockCases([
      { action: 'URGENT', similarity: 0.6, outcome: 0.5 },
      { action: 'URGENT', similarity: 0.5, outcome: 0.3 },
      { action: 'URGENT', similarity: 0.4, outcome: 0.7 },
    ]);
    const result = await resolveCaseMemoryAction(cases, {
      workspaceId: 'ws-1',
      caseType: 'tom',
      text: 'channel whatsapp',
      features: { channel: 'whatsapp' },
      options: ['FRIENDLY', 'DIRECT'],
      minSimilarCases: 1,
      minSimilarityTotal: 0,
    });
    expect(result).toBeNull();
  });

  it('returns the best action by similarity-weighted outcome score', async () => {
    const cases = mockCases([
      { action: 'FRIENDLY', similarity: 0.7, outcome: 1 },
      { action: 'FRIENDLY', similarity: 0.6, outcome: 0.8 },
      { action: 'DIRECT', similarity: 0.5, outcome: 0.2 },
    ]);
    const result = await resolveCaseMemoryAction(cases, {
      workspaceId: 'ws-1',
      caseType: 'tom',
      text: 'channel whatsapp repliedRate 0.5',
      features: { channel: 'whatsapp' },
      options: ['FRIENDLY', 'DIRECT'],
      minSimilarCases: 1,
      minSimilarityTotal: 0,
    });
    expect(result).toBe('FRIENDLY');
  });

  it('returns null when totalSimilarity is below minSimilarityTotal', async () => {
    const cases = mockCases([
      { action: 'FRIENDLY', similarity: 0.3, outcome: 0.5 },
      { action: 'DIRECT', similarity: 0.2, outcome: 0.5 },
      { action: 'CASUAL', similarity: 0.1, outcome: 0.5 },
    ]);
    const result = await resolveCaseMemoryAction(cases, {
      workspaceId: 'ws-1',
      caseType: 'tom',
      text: 'channel whatsapp',
      features: { channel: 'whatsapp' },
      options: ['FRIENDLY', 'DIRECT', 'CASUAL'],
      minSimilarCases: 1,
      minSimilarityTotal: 2.0,
    });
    expect(result).toBeNull();
  });

  it('handles cases with null outcome gracefully', async () => {
    const cases = mockCases([
      { action: 'audio', similarity: 0.8, outcome: null },
      { action: 'audio', similarity: 0.7, outcome: null },
      { action: 'text', similarity: 0.6, outcome: 0.3 },
    ]);
    const result = await resolveCaseMemoryAction(cases, {
      workspaceId: 'ws-1',
      caseType: 'audio_vs_text',
      text: 'channel whatsapp audioRatio 0.30',
      features: { channel: 'whatsapp' },
      options: ['audio', 'text'],
      minSimilarCases: 1,
      minSimilarityTotal: 0,
    });
    expect(result).toBe('audio');
  });

  it('prefers higher outcome rate over higher similarity sum', async () => {
    const cases = mockCases([
      { action: 'offer_coupon', similarity: 0.9, outcome: 0.1 },
      { action: 'no_coupon', similarity: 0.7, outcome: 1.0 },
      { action: 'no_coupon', similarity: 0.6, outcome: 0.9 },
    ]);
    const result = await resolveCaseMemoryAction(cases, {
      workspaceId: 'ws-1',
      caseType: 'cupom',
      text: 'priceBand over_500 soldRate 0.05',
      features: { priceBand: 'over_500' },
      options: ['offer_coupon', 'no_coupon'],
      minSimilarCases: 1,
      minSimilarityTotal: 0,
    });
    expect(result).toBe('no_coupon');
  });
});
