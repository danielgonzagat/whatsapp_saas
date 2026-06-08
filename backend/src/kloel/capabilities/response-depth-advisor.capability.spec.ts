import { ResponseDepthAdvisorCapability } from './response-depth-advisor.capability';

describe('ResponseDepthAdvisorCapability', () => {
  let cap: ResponseDepthAdvisorCapability;

  beforeEach(() => {
    cap = new ResponseDepthAdvisorCapability();
  });

  it('PROOF: runs and returns four ordered depth tiers', () => {
    const result = cap.advise({ prompt: 'Como funciona o checkout PIX no Kloel?' });

    expect(result.capability).toBe('response_depth_advisor');
    expect(result.options).toHaveLength(4);
    expect(result.options.map((o) => o.level)).toEqual([
      'essential',
      'moderate',
      'detailed',
      'exhaustive',
    ]);
    // Tokens must increase monotonically with depth.
    const tokens = result.options.map((o) => o.estimatedTokens);
    expect(tokens[0]).toBeLessThanOrEqual(tokens[1]);
    expect(tokens[1]).toBeLessThanOrEqual(tokens[2]);
    expect(tokens[2]).toBeLessThanOrEqual(tokens[3]);
    expect(result.inputTokens).toBeGreaterThan(0);
  });

  it('estimates prose tokens as words × 1.3', () => {
    // 10 words -> round(13) = 13
    const tokens = cap.estimateTokens('um dois tres quatro cinco seis sete oito nove dez', 'prose');
    expect(tokens).toBe(13);
  });

  it('estimates code tokens as chars / 4', () => {
    const code = 'const x = 1;'; // 12 chars -> 3
    const tokens = cap.estimateTokens(code, 'code');
    expect(tokens).toBe(3);
  });

  it('caps the exhaustive window at maxOutputTokens', () => {
    const result = cap.advise({
      prompt:
        'Compare detalhadamente as arquiteturas de pagamento e proponha uma migração completa entre múltiplos módulos com trade-offs.',
      maxOutputTokens: 50,
    });
    expect(result.window.maxTokens).toBeLessThanOrEqual(50);
    expect(result.options[3].estimatedTokens).toBeLessThanOrEqual(50);
  });

  it('classifies creative prompts into the creative band', () => {
    const result = cap.advise({ prompt: 'Escreva uma história curta sobre um vendedor.' });
    expect(result.complexity).toBe('creative');
  });

  it('always discloses the heuristic precision', () => {
    const result = cap.advise({ prompt: 'O que é PIX?' });
    expect(result.precisionNote).toContain('heurística');
  });
});
