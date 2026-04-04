import { describe, expect, it } from '@jest/globals';

import { extractThreadSearchTags, stripHtmlTags } from './thread-search.util';

describe('thread search util', () => {
  it('extracts ranked tags from query and matched content', () => {
    expect(
      extractThreadSearchTags(
        'Configuração do WhatsApp Business API',
        'Preciso validar o webhook da API do WhatsApp antes de subir a campanha.',
        'whatsapp api webhook',
      ),
    ).toEqual(expect.arrayContaining(['api', 'whatsapp', 'webhook']));
  });

  it('normalizes accents and removes duplicate low-signal tokens', () => {
    expect(
      extractThreadSearchTags(
        'Relatórios de vendas',
        'O relatório consolidado de vendas e pagamentos fechou hoje.',
        'relatorio vendas',
      ),
    ).toEqual(['relatorio', 'vendas', 'pagamentos']);
  });

  it('strips markup safely from highlighted previews', () => {
    expect(stripHtmlTags('Texto com <mark>destaque</mark> e <b>tag</b> extra')).toBe(
      'Texto com destaque e tag extra',
    );
  });
});
