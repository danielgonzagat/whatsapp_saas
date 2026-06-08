import { detectDeliverableFileCards } from './kloel-stream-writer';

const fence = '```';

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

describe('detectDeliverableFileCards', () => {
  it('ignores short fenced snippets', () => {
    expect(detectDeliverableFileCards(`${fence}ts\nconsole.log("x");\n${fence}`)).toEqual([]);
  });

  it('emits a downloadable markdown card from a substantial fenced deliverable', () => {
    const body = buildLongBlock('Plano de Lancamento', 'Secao');
    const [card] = detectDeliverableFileCards(
      `Segue o documento:\n\n${fence}markdown\n${body}\n${fence}`,
    );

    expect(card).toBeDefined();
    expect(card.name).toBe('plano-de-lancamento.md');
    expect(card.meta).toContain('Documento');
    expect(card.meta).toContain('MD');
    expect(card.downloadUrl).toMatch(/^data:text\/markdown;charset=utf-8;base64,/);

    const encoded = card.downloadUrl.split(',')[1] ?? '';
    expect(Buffer.from(encoded, 'base64').toString('utf-8')).toBe(body);
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
});
