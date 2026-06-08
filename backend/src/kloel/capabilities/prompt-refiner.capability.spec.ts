import { PromptRefinerCapability } from './prompt-refiner.capability';

describe('PromptRefinerCapability', () => {
  let cap: PromptRefinerCapability;

  beforeEach(() => {
    cap = new PromptRefinerCapability();
  });

  it('PROOF: runs and classifies a bug-fix prompt with a refined output', () => {
    const result = cap.refine({ prompt: 'Corrige o bug no fluxo de autenticação' });

    expect(result.capability).toBe('prompt_refiner');
    expect(result.intent).toBe('bug_fix');
    expect(result.intentConfidence).toBeGreaterThan(0.5);
    expect(result.refinedPrompt).toContain('correção de bug');
    expect(result.refinedPrompt).toContain('Diretrizes:');
  });

  it('detects missing context and recommends asking first', () => {
    const result = cap.refine({ prompt: 'Cria uma feature' });
    expect(result.intent).toBe('new_feature');
    expect(result.missingContext.length).toBeGreaterThanOrEqual(1);
    expect(result.needsClarification).toBe(true);
  });

  it('classifies a testing prompt', () => {
    const result = cap.refine({ prompt: 'Adiciona testes unitários para o carrinho no arquivo cart.ts' });
    expect(result.intent).toBe('testing');
  });

  it('classifies a research prompt', () => {
    const result = cap.refine({ prompt: 'Como integrar o gateway de pagamento?' });
    expect(result.intent).toBe('research');
  });

  it('escalates scope to epic on whole-system signals', () => {
    const result = cap.refine({
      prompt: 'Reescrever tudo: refator da arquitetura completa do sistema inteiro em várias sessões',
    });
    expect(result.scope).toBe('epic');
  });

  it('returns unknown intent with low confidence for empty prompts', () => {
    const result = cap.refine({ prompt: '' });
    expect(result.intent).toBe('unknown');
    expect(result.intentConfidence).toBeLessThan(0.4);
  });
});
