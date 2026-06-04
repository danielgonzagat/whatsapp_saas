import {
  codeNativeSearchWeb,
  extractTotalTokens,
  formatSearchDigestAsMarkdown,
  normalizeRefinementMarkdown,
  normalizeWebSearchSources,
  shouldTrackTokenUsage,
} from './kloel-composer.service.helpers';

describe('normalizeRefinementMarkdown', () => {
  it('splits inline Mesa sections and bullets into real markdown blocks', () => {
    const raw =
      '## Diagnóstico executivo - O texto base contém erros. - A frase original é compacta. ## Lacunas e riscos - Clareza conceitual: permanece abstrata. - Precisão sobre raciocínio: falta corte público. ## Versão refinada Documentação pública sugerida: - Reasoning summary – Resumo público. - Agent trace – Registro operacional. ## Próxima ação verificável - Submeter a revisão técnica. - Obter avaliação de compreensão.';

    const normalized = normalizeRefinementMarkdown(raw);

    expect(normalized).toContain('## Diagnóstico executivo\n\n- O texto base');
    expect(normalized).toContain('\n\n## Lacunas e riscos\n\n- Clareza conceitual');
    expect(normalized).toContain(
      '\n\n## Versão refinada\n\nDocumentação pública sugerida:\n- Reasoning summary',
    );
    expect(normalized).toContain('\n\n## Próxima ação verificável\n\n- Submeter');
    expect(normalized).not.toContain('## Diagnóstico executivo -');
    expect(normalized).not.toContain('## Lacunas e riscos -');
  });
});

describe('formatSearchDigestAsMarkdown', () => {
  it('renders body plus numbered sources block', () => {
    const md = formatSearchDigestAsMarkdown({
      answer: 'answer text',
      sources: [
        { title: 'First', url: 'https://a.test' },
        { title: 'Second', url: 'https://b.test' },
      ],
    });
    expect(md).toBe(
      'answer text\n\nFontes:\n- [1] First — https://a.test\n- [2] Second — https://b.test',
    );
  });

  it('falls back to URL when title is empty', () => {
    const md = formatSearchDigestAsMarkdown({
      answer: 'a',
      sources: [{ title: '', url: 'https://x.test' }],
    });
    expect(md).toContain('- [1] https://x.test — https://x.test');
  });

  it('returns just the body when sources is empty', () => {
    const md = formatSearchDigestAsMarkdown({ answer: 'just text', sources: [] });
    expect(md).toBe('just text');
  });

  it('substitutes default text for empty answer', () => {
    const md = formatSearchDigestAsMarkdown({ answer: '   ', sources: [] });
    expect(md).toBe('Nenhum resultado confiável foi encontrado.');
  });
});

describe('codeNativeSearchWeb', () => {
  it('returns an empty unavailable digest for empty queries', () => {
    expect(codeNativeSearchWeb('')).toEqual({ answer: '', sources: [], totalTokens: 0 });
    expect(codeNativeSearchWeb('   ')).toEqual({ answer: '', sources: [], totalTokens: 0 });
  });

  it('lists the queried terms (max 5, len > 2) in the unavailable answer', () => {
    const digest = codeNativeSearchWeb('como criar campanha de email no kloel hoje');
    expect(digest.sources).toEqual([]);
    expect(digest.totalTokens).toBe(0);
    expect(digest.answer).toContain('A busca na web está conectada');
    expect(digest.answer).toContain('configuração de pesquisa com IA');
    expect(digest.answer).not.toContain('provedor');
    expect(digest.answer).not.toContain('chave');
    expect(digest.answer).not.toContain('motor LLM');
    expect(digest.answer).not.toContain('API key');
    expect(digest.answer).toContain('"como"');
    expect(digest.answer).toContain('"criar"');
    // 'de' and 'no' filtered out (length <= 2); should be at most 5 quoted terms
    const quoted = digest.answer.match(/"[^"]+"/g) ?? [];
    expect(quoted.length).toBeLessThanOrEqual(5);
  });

  it('uses the fallback phrasing when every word is short', () => {
    const digest = codeNativeSearchWeb('a b c');
    expect(digest.answer).toContain('os termos informados');
  });
});

describe('normalizeWebSearchSources', () => {
  it('returns empty when output is not an array', () => {
    expect(normalizeWebSearchSources(undefined)).toEqual([]);
    expect(normalizeWebSearchSources({})).toEqual([]);
    expect(normalizeWebSearchSources('nope')).toEqual([]);
  });

  it('flattens nested action.sources, dedupes by URL, caps at 6', () => {
    const items = [
      {
        action: {
          sources: [
            { title: 'A', url: 'https://a.test' },
            { title: 'B', url: 'https://b.test' },
            { title: 'Adup', url: 'https://a.test' },
          ],
        },
      },
      {
        action: {
          sources: [
            { title: 'C', url: 'https://c.test' },
            { name: 'D', url: 'https://d.test' },
            { title: 'E', url: 'https://e.test' },
            { title: 'F', url: 'https://f.test' },
            { title: 'G', url: 'https://g.test' }, // 7th — should be dropped
          ],
        },
      },
    ];
    const result = normalizeWebSearchSources(items);
    expect(result).toHaveLength(6);
    expect(result.map((s) => s.url)).toEqual([
      'https://a.test',
      'https://b.test',
      'https://c.test',
      'https://d.test',
      'https://e.test',
      'https://f.test',
    ]);
    // name fallback wins when title absent
    expect(result[3]).toEqual({ title: 'D', url: 'https://d.test' });
  });

  it('drops sources with no URL', () => {
    const items = [{ action: { sources: [{ title: 'no-url' }, { url: '   ' }] } }];
    expect(normalizeWebSearchSources(items)).toEqual([]);
  });

  it('falls back to URL when title and name are both empty', () => {
    const items = [{ action: { sources: [{ url: 'https://only-url.test' }] } }];
    expect(normalizeWebSearchSources(items)).toEqual([
      { title: 'https://only-url.test', url: 'https://only-url.test' },
    ]);
  });
});

describe('extractTotalTokens', () => {
  it('reads numeric total_tokens', () => {
    expect(extractTotalTokens({ total_tokens: 42 })).toBe(42);
  });

  it('returns 0 for missing, null, or non-numeric values', () => {
    expect(extractTotalTokens(undefined)).toBe(0);
    expect(extractTotalTokens(null)).toBe(0);
    expect(extractTotalTokens({})).toBe(0);
    expect(extractTotalTokens({ total_tokens: null })).toBe(0);
    expect(extractTotalTokens({ total_tokens: 'lots' })).toBe(0);
  });
});

describe('shouldTrackTokenUsage', () => {
  it('returns true only for finite positive numbers', () => {
    expect(shouldTrackTokenUsage(1)).toBe(true);
    expect(shouldTrackTokenUsage(0.5)).toBe(true);
  });

  it('returns false for zero, negatives, NaN and Infinity', () => {
    expect(shouldTrackTokenUsage(0)).toBe(false);
    expect(shouldTrackTokenUsage(-1)).toBe(false);
    expect(shouldTrackTokenUsage(Number.NaN)).toBe(false);
    expect(shouldTrackTokenUsage(Number.POSITIVE_INFINITY)).toBe(false);
  });
});
