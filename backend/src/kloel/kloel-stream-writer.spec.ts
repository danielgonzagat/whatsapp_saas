import {
  detectDeliverableFileCards,
  detectRequestedDeliverableFileCards,
} from './kloel-stream-writer';
import { Response } from 'express';
import OpenAI from 'openai';
import { KloelStreamWriter } from './kloel-stream-writer';
import type { KloelLLME2EGuard } from './kloel-llm-e2e-guard';

const fence = '```';
type ParsedStreamPayload = { type?: string; text?: string };

function buildLongBlock(title: string, marker: string): string {
  return [
    `# ${title}`,
    '',
    ...Array.from(
      { length: 12 },
      (_, index) =>
        `${marker} item ${index + 1}: conteudo operacional suficiente para virar um arquivo real.`,
    ),
  ].join('\n');
}
async function* streamChunks(
  chunks: Array<{ reasoning_content?: string; content?: string }>,
): AsyncIterable<OpenAI.ChatCompletionChunk> {
  for (const delta of chunks) {
    yield { choices: [{ delta }] } as OpenAI.ChatCompletionChunk;
  }
}

function createResponseMock() {
  const writes: string[] = [];
  const res = {
    write: jest.fn((chunk: string) => {
      writes.push(chunk);
      return true;
    }),
    end: jest.fn(),
    setHeader: jest.fn(),
  } as unknown as Response;

  return { res, writes };
}

function parseStreamPayloads(writes: readonly string[]): ParsedStreamPayload[] {
  const payloads: ParsedStreamPayload[] = [];
  for (const chunk of writes) {
    if (!chunk.startsWith('data: ')) {
      continue;
    }
    const parsed: unknown = JSON.parse(chunk.slice('data: '.length).trim());
    if (parsed && typeof parsed === 'object') {
      payloads.push(parsed);
    }
  }
  return payloads;
}

describe('detectDeliverableFileCards', () => {
  it('ignores short fenced snippets', () => {
    expect(detectDeliverableFileCards(`${fence}ts\nconsole.log("x");\n${fence}`)).toEqual([]);
  });

  it('synthesizes the exact requested markdown file when the model emits no artifact bytes', () => {
    const [card] = detectRequestedDeliverableFileCards(
      'Crie um arquivo Markdown chamado prova-harvest.md com 3 bullets sobre pesquisa web, dashboard de dados e validacao browser. Nao mencione ferramentas internas.',
      'Pesquisa web: Realizada coleta de informacoes em fontes online.',
    );

    expect(card).toBeDefined();
    expect(card?.name).toBe('prova-harvest.md');
    expect(card?.kind).toBe('markdown');
    expect(card?.content).toContain('Pesquisa Web');
    expect(card?.content).toContain('Dashboard De Dados');
    expect(card?.content).toContain('Validacao Browser');
    expect(card?.downloadUrl).toMatch(/^data:text\/markdown;charset=utf-8;base64,/);
  });

  it('synthesizes requested professional document formats as binary downloads', () => {
    const cases = [
      {
        fileName: 'relatorio.pdf',
        kind: 'pdf',
        mime: 'application/pdf',
        magic: '%PDF-',
      },
      {
        fileName: 'relatorio.docx',
        kind: 'docx',
        mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        magic: 'PK',
      },
      {
        fileName: 'apresentacao.pptx',
        kind: 'pptx',
        mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        magic: 'PK',
      },
      {
        fileName: 'planilha.xlsx',
        kind: 'xlsx',
        mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        magic: 'PK',
      },
    ] as const;

    for (const testCase of cases) {
      const [card] = detectRequestedDeliverableFileCards(
        `Crie um arquivo ${testCase.fileName} com 3 bullets sobre pesquisa web, dashboard de dados e validacao browser.`,
        'Conteudo resumido do documento.',
      );
      const encoded = card?.downloadUrl.split(',')[1] || '';
      const bytes = Buffer.from(encoded, 'base64');

      expect(card?.name).toBe(testCase.fileName);
      expect(card?.kind).toBe(testCase.kind);
      expect(card?.content).toBeUndefined();
      expect((card as { editable?: boolean } | undefined)?.editable).toBe(false);
      expect(card?.downloadUrl).toMatch(new RegExp(`^data:${testCase.mime};base64,`));
      expect(bytes.toString('latin1', 0, testCase.magic.length)).toBe(testCase.magic);
    }
  });

  it('keeps late content in synthesized professional documents instead of truncating them', () => {
    const marker = 'FINALMARKERPERSISTED';
    const answer = [
      ...Array.from(
        { length: 55 },
        (_, index) =>
          `Linha ${index + 1}: conteúdo operacional que deve sobreviver dentro do arquivo profissional baixável.`,
      ),
      marker,
    ].join('\n');
    const cases = ['pdf', 'docx', 'pptx', 'xlsx'] as const;

    for (const ext of cases) {
      const [card] = detectRequestedDeliverableFileCards(
        `Crie um arquivo documento.${ext} com todo o conteúdo abaixo, sem truncar.`,
        answer,
      );
      const encoded = card?.downloadUrl.split(',')[1] || '';
      const bytes = Buffer.from(encoded, 'base64');

      expect(card?.name).toBe(`documento.${ext}`);
      expect(bytes.toString('utf-8')).toContain(marker);
    }
  });

  it('emits a short markdown card when the answer explicitly labels it as a file', () => {
    const markdownTable = [
      '# Resumo',
      '',
      '| Item | Valor |',
      '| --- | ---: |',
      '| Leads | 12 |',
      '| Vendas | 3 |',
    ].join('\n');
    const [card] = detectDeliverableFileCards(
      `Arquivo 1: tabela.md\n\n${fence}markdown\n${markdownTable}\n${fence}`,
    );

    expect(card).toBeDefined();
    expect(card?.name).toBe('tabela.md');
    expect(card?.kind).toBe('markdown');
    expect(card?.content).toBe(markdownTable);
    expect(card?.downloadUrl).toMatch(/^data:text\/markdown;charset=utf-8;base64,/);
  });

  it('emits a short markdown card when the filename is the heading immediately before the fence', () => {
    const markdownTable = [
      '| Produto | Preco |',
      '| --- | ---: |',
      '| Caneta | 2,50 |',
      '| Caderno | 18,90 |',
    ].join('\n');
    const [card] = detectDeliverableFileCards(
      `### 📄 \`tabela.md\`\n${fence}markdown\n${markdownTable}\n${fence}`,
    );

    expect(card).toBeDefined();
    expect(card?.name).toBe('tabela.md');
    expect(card?.kind).toBe('markdown');
    expect(card?.content).toBe(markdownTable);
  });

  it('emits real cards from internal artifact protocol blocks', () => {
    const markdownTable = [
      '| Produto | Preco |',
      '| --- | ---: |',
      '| Caneta | 2,50 |',
      '| Caderno | 18,90 |',
    ].join('\n');
    const html = '<!doctype html><html><body><button>Somar</button></body></html>';
    const cards = detectDeliverableFileCards(
      [
        'Aqui estão os arquivos:',
        '__artifact',
        JSON.stringify({
          type: 'artifact',
          artifact: {
            name: 'tabela.md',
            content: markdownTable,
            'content-type': 'text/markdown',
          },
        }),
        '__artifact',
        JSON.stringify({
          type: 'artifact',
          artifact: {
            name: 'contador.html',
            content: html,
            'content-type': 'text/html',
          },
        }),
        'Pronto.',
      ].join('\n'),
    );

    expect(cards).toHaveLength(2);
    expect(cards[0]).toMatchObject({
      name: 'tabela.md',
      kind: 'markdown',
      content: markdownTable,
      meta: 'Documento · MD',
    });
    expect(cards[0]?.downloadUrl).toMatch(/^data:text\/markdown;charset=utf-8;base64,/);
    expect(cards[1]).toMatchObject({
      name: 'contador.html',
      kind: 'html',
      content: html,
      meta: 'Página HTML · HTML',
    });
    expect(cards[1]?.downloadUrl).toMatch(/^data:text\/html;charset=utf-8;base64,/);
  });

  it('converts artifact protocol binary names into binary downloads', () => {
    const [card] = detectDeliverableFileCards(
      [
        '__artifact',
        JSON.stringify({
          type: 'artifact',
          artifact: {
            name: 'relatorio-protocolo.pdf',
            content: [
              '- **Pesquisa web**: coleta online.',
              '- **Dashboard de dados**: indicadores.',
              '- **Validação browser**: navegador real.',
            ].join('\n'),
            'content-type': 'application/pdf',
          },
        }),
        '__artifact',
      ].join('\n'),
    );
    const encoded = card?.downloadUrl.split(',')[1] || '';
    const bytes = Buffer.from(encoded, 'base64');

    expect(card?.name).toBe('relatorio-protocolo.pdf');
    expect(card?.kind).toBe('pdf');
    expect(card?.content).toBeUndefined();
    expect((card as { editable?: boolean } | undefined)?.editable).toBe(false);
    expect(card?.downloadUrl).toMatch(/^data:application\/pdf;base64,/);
    expect(bytes.toString('latin1', 0, 5)).toBe('%PDF-');
  });

  it('does not materialize anonymous internal artifact payloads as document fallback cards', () => {
    const cards = detectDeliverableFileCards(
      [
        '__artifact',
        JSON.stringify({
          type: 'artifact',
          artifact: {
            content: [
              '- **Pesquisa web**: coleta online.',
              '- **Dashboard de dados**: indicadores.',
              '- **Validação browser**: navegador real.',
            ].join('\n'),
            'content-type': 'text/markdown',
          },
        }),
        '__artifact',
      ].join('\n'),
    );

    expect(cards).toEqual([]);
  });

  it('uses professional MIME types for titled artifact protocol payloads', () => {
    const [card] = detectDeliverableFileCards(
      [
        '__artifact',
        JSON.stringify({
          type: 'artifact',
          artifact: {
            title: 'Relatorio Executivo',
            content: [
              '- **Pesquisa web**: coleta online.',
              '- **Dashboard de dados**: indicadores.',
              '- **Validação browser**: navegador real.',
            ].join('\n'),
            contentType: 'application/pdf',
          },
        }),
        '__artifact',
      ].join('\n'),
    );
    const encoded = card?.downloadUrl.split(',')[1] || '';
    const bytes = Buffer.from(encoded, 'base64');

    expect(card?.name).toBe('relatorio-executivo.pdf');
    expect(card?.kind).toBe('pdf');
    expect(card?.downloadUrl).toMatch(/^data:application\/pdf;base64,/);
    expect(bytes.toString('latin1', 0, 5)).toBe('%PDF-');
  });

  it('filters anonymous markdown substrates when a professional document is explicitly requested', async () => {
    const module = await import('./kloel-stream-writer');
    const filter = (
      module as unknown as {
        filterCollateralDeliverableFileCards: (
          cards: ReturnType<typeof detectDeliverableFileCards>,
          context: string,
        ) => ReturnType<typeof detectDeliverableFileCards>;
      }
    ).filterCollateralDeliverableFileCards;
    const body = Array.from(
      { length: 8 },
      (_, index) =>
        `- item ${index + 1}: conteudo suficiente para representar o substrato markdown interno do documento profissional.`,
    ).join('\n');
    const [markdownCard] = detectDeliverableFileCards(
      `Conteudo intermediario:\n\n${fence}markdown\n${body}\n${fence}`,
    );
    if (!markdownCard) {
      throw new Error('expected anonymous markdown substrate card');
    }

    expect(markdownCard.name).toBe('documento-1.md');
    expect(filter([markdownCard], 'Crie um arquivo PDF chamado relatorio.pdf')).toEqual([]);
    expect(filter([markdownCard], 'Crie um arquivo Markdown chamado relatorio.md')).toEqual([
      markdownCard,
    ]);
  });

  it('filters non-requested markdown and data substrates when professional documents are explicit', async () => {
    const module = await import('./kloel-stream-writer');
    const filter = (
      module as unknown as {
        filterCollateralDeliverableFileCards: (
          cards: ReturnType<typeof detectDeliverableFileCards>,
          context: string,
        ) => ReturnType<typeof detectDeliverableFileCards>;
      }
    ).filterCollateralDeliverableFileCards;
    const professionalCard = {
      name: 'validacao.docx',
      kind: 'docx' as const,
      meta: 'Word · DOCX',
      downloadUrl:
        'data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,UEs=',
      editable: false,
    } satisfies ReturnType<typeof detectDeliverableFileCards>[number];
    const markdownCollateral = {
      name: 'slide-1-pesquisa-web.md',
      kind: 'markdown' as const,
      meta: 'Documento · MD',
      downloadUrl: 'data:text/markdown;charset=utf-8;base64,IyBTbGlkZQ==',
    } satisfies ReturnType<typeof detectDeliverableFileCards>[number];
    const dataCollateral = {
      name: 'documento-3.csv',
      kind: 'data' as const,
      meta: 'Planilha CSV · CSV',
      downloadUrl: 'data:text/csv;charset=utf-8;base64,YTti',
    } satisfies ReturnType<typeof detectDeliverableFileCards>[number];
    const explicitSource = {
      ...dataCollateral,
      name: 'source.csv',
    } satisfies ReturnType<typeof detectDeliverableFileCards>[number];

    expect(
      filter(
        [professionalCard, markdownCollateral, dataCollateral],
        'Crie um arquivo DOCX chamado validacao.docx',
      ),
    ).toEqual([professionalCard]);
    expect(
      filter(
        [professionalCard, explicitSource],
        'Crie um arquivo DOCX chamado validacao.docx e um CSV chamado source.csv',
      ),
    ).toEqual([professionalCard, explicitSource]);
  });

  it('synthesizes named files when the final answer promises downloads but emits no bytes', async () => {
    const module = await import('./kloel-stream-writer');
    const detector = (
      module as unknown as {
        detectPromisedDeliverableFileCards: (
          answer: string,
        ) => ReturnType<typeof detectDeliverableFileCards>;
      }
    ).detectPromisedDeliverableFileCards;
    const answer = [
      'Aqui estão seus dois arquivos, Dev:',
      '1. **tabela.md** – uma tabela curta com produtos.',
      '2. **contador.html** – um contador interativo simples que você pode abrir no navegador.',
      'Você pode baixar cada um clicando nos links abaixo.',
    ].join('\n');

    const cards = detector(answer);

    expect(cards.map((card) => card.name)).toEqual(['tabela.md', 'contador.html']);
    expect(cards[0]?.content).toContain('| Produto | Preço |');
    expect(cards[1]?.content).toContain('function alterar');
  });

  it('recovers named deliverable cards from reasoning when the final answer only references files', async () => {
    const module = await import('./kloel-stream-writer');
    const detector = (
      module as unknown as {
        detectReasoningBackedDeliverableFileCards: (
          reasoning: string,
          answer: string,
        ) => ReturnType<typeof detectDeliverableFileCards>;
      }
    ).detectReasoningBackedDeliverableFileCards;
    const reasoning = [
      'A tabela markdown:',
      '',
      '| Produto | Preço |',
      '| --- | ---: |',
      '| Produto A | R$ 10,00 |',
      '| Produto B | R$ 20,00 |',
      '| Produto C | R$ 30,00 |',
      '',
      'O HTML do contador:',
      fence + 'html',
      '<!doctype html>',
      '<html lang="pt-BR"><body><button onclick="contador++">+</button><script>let contador=0;</script></body></html>',
      fence,
    ].join('\n');
    const answer = [
      'Aqui estão seus dois arquivos prontos para baixar:',
      '- **tabela.md** — uma tabela markdown curta com produtos de exemplo.',
      '- **contador.html** — um contador interativo simples em HTML.',
    ].join('\n');

    const cards = detector(reasoning, answer);

    expect(cards.map((card) => card.name)).toEqual(['tabela.md', 'contador.html']);
    expect(cards[0]?.kind).toBe('markdown');
    expect(cards[0]?.content).toContain('| Produto | Preço |');
    expect(cards[1]?.kind).toBe('html');
    expect(cards[1]?.content).toContain('<!doctype html>');
  });

  it('converts reasoning-backed explicit binary files into real binary downloads', async () => {
    const module = await import('./kloel-stream-writer');
    const detector = (
      module as unknown as {
        detectReasoningBackedDeliverableFileCards: (
          reasoning: string,
          answer: string,
        ) => ReturnType<typeof detectDeliverableFileCards>;
      }
    ).detectReasoningBackedDeliverableFileCards;
    const reasoning = [
      '- **Pesquisa web**: coleta e curadoria de fontes online.',
      '- **Dashboard de dados**: indicadores organizados para decisão.',
      '- **Validação browser**: conferência em navegador real.',
    ].join('\n');
    const answer = '- **relatorio-kloel-validacao.pdf** — arquivo PDF pronto para download.';

    const [card] = detector(reasoning, answer);
    const encoded = card?.downloadUrl.split(',')[1] || '';
    const bytes = Buffer.from(encoded, 'base64');

    expect(card?.name).toBe('relatorio-kloel-validacao.pdf');
    expect(card?.kind).toBe('pdf');
    expect(card?.content).toBeUndefined();
    expect((card as { editable?: boolean } | undefined)?.editable).toBe(false);
    expect(card?.downloadUrl).toMatch(/^data:application\/pdf;base64,/);
    expect(bytes.toString('latin1', 0, 5)).toBe('%PDF-');
  });

  it('emits a downloadable markdown card from a substantial fenced deliverable', () => {
    const body = buildLongBlock('Plano de Lancamento', 'Secao');
    const [card] = detectDeliverableFileCards(
      `Segue o documento:\n\n${fence}markdown\n${body}\n${fence}`,
    );

    expect(card).toBeDefined();
    expect(card.name).toBe('plano-de-lancamento.md');
    expect(card?.kind).toBe('markdown');
    expect(card.meta).toContain('Documento');
    expect(card.meta).toContain('MD');
    expect(card.downloadUrl).toMatch(/^data:text\/markdown;charset=utf-8;base64,/);

    const encoded = card.downloadUrl.split(',')[1] ?? '';
    expect(Buffer.from(encoded, 'base64').toString('utf-8')).toBe(body);
  });

  it('maps fenced languages to public artifact kinds for the stream contract', () => {
    const cases = [
      ['html', 'html'],
      ['svg', 'svg'],
      ['mermaid', 'mermaid'],
      ['tsx', 'react'],
      ['json', 'data'],
      ['python', 'code'],
    ] as const;

    for (const [lang, expectedKind] of cases) {
      const body = buildLongBlock(`Artifact ${lang}`, lang);
      const [card] = detectDeliverableFileCards(
        `Segue o artifact:\n\n${fence}${lang}\n${body}\n${fence}`,
      );

      expect(card?.kind).toBe(expectedKind);
    }
  });

  it('deduplicates repeated blocks and limits cards to three deliverables', () => {
    const blocks = [
      buildLongBlock('Plano A', 'Alpha'),
      buildLongBlock('Plano A', 'Alpha'),
      buildLongBlock('Plano B', 'Beta'),
      buildLongBlock('Plano C', 'Gamma'),
      buildLongBlock('Plano D', 'Delta'),
    ];
    const answer = blocks.map((block) => `\n${fence}md\n${block}\n${fence}`).join('\n');

    expect(detectDeliverableFileCards(answer).map((card) => card.name)).toEqual([
      'plano-a.md',
      'plano-b.md',
      'plano-c.md',
    ]);
  });

  describe('KloelStreamWriter public reasoning stream', () => {
    it('streams provider reasoning deltas publicly before reasoning_done while retaining text', async () => {
      const { res, writes } = createResponseMock();
      const llmE2EGuard: KloelLLME2EGuard = {
        isEnabled: () => true,
        buildStream: () =>
          streamChunks([
            { reasoning_content: 'Need to inspect ' },
            { reasoning_content: 'runtime context via inspect_self before answering.' },
            { content: 'Resposta final segura.' },
          ]),
      };
      const writer = new KloelStreamWriter(res, {
        logger: { warn: jest.fn() },
        llmE2EGuard,
      });

      await writer.streamModelResponse({
        openai: {} as OpenAI,
        writerMessages: [],
        temperature: 0.2,
        responseMaxTokens: 512,
      });

      const payloads = parseStreamPayloads(writes);
      const reasoningEvents = payloads.filter((event) => event.type === 'reasoning_delta');
      const firstReasoningIndex = payloads.findIndex((event) => event.type === 'reasoning_delta');
      const doneIndex = payloads.findIndex((event) => event.type === 'reasoning_done');

      expect(reasoningEvents.map((event) => event.text)).toEqual([
        'Need to inspect ',
        'runtime context via inspect_self before answering.',
      ]);
      expect(firstReasoningIndex).toBeGreaterThanOrEqual(0);
      expect(doneIndex).toBeGreaterThan(firstReasoningIndex);
      expect(writer.getLastReasoning().text).toContain('runtime context via inspect_self');
    });
  });
});
