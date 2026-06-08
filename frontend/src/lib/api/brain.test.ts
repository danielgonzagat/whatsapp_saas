import { describe, expect, it } from 'vitest';

import { detectOperatorIntent, isUnsupportedFallback } from './brain';

describe('detectOperatorIntent', () => {
  it('does not hijack long analytical prompts that mention conversations', () => {
    const prompt = [
      'quero que diga tudo sabendo de tudo que ja conversamos e formalizamos',
      'em todo complexo total de conversas nossas e no codebase completo.',
      'Nao execute listagem: explique o estado atual completo do sistema e o que falta.',
    ].join(' ');

    expect(detectOperatorIntent(prompt)).toBeNull();
  });

  it('detects explicit short operator commands', () => {
    expect(detectOperatorIntent('liste minhas conversas recentes')).toBe('list_conversations');
    expect(detectOperatorIntent('procure nas minhas conversas sobre PDRN')).toBe('list_conversations');
    expect(detectOperatorIntent('quais produtos tenho?')).toBe('list_products');
    expect(detectOperatorIntent('analise a si mesmo')).toBe('inspect_self');
  });

  it('does not hijack creation prompts before they reach the chat runtime', () => {
    const artifactPrompt =
      'Crie um arquivo Markdown chamado prova-harvest.md com 3 bullets sobre pesquisa web, dashboard de dados e validacao browser.';

    expect(detectOperatorIntent('crie uma landing para PDRN')).toBeNull();
    expect(detectOperatorIntent(artifactPrompt)).toBeNull();
    expect(isUnsupportedFallback(detectOperatorIntent(artifactPrompt))).toBe(false);
    expect(detectOperatorIntent('quero discutir a landing e o dashboard completo')).toBeNull();
  });
});
