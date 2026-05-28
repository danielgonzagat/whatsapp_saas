import { buildMindSignals } from './build-mind-signals.helper';
import { mockLogger, mockPrisma } from './build-mind-signals.helper.fixtures';

describe('buildMindSignals — knowledge base search (PI-K17-A)', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  const makeKbResult = (title: string, snippet: string, relevance: number) => ({
    title,
    snippet,
    relevance,
  });

  it('attaches knowledge when knowledgeBaseService returns results', async () => {
    const search = jest
      .fn()
      .mockResolvedValue([
        makeKbResult('FAQ: Preços', 'Nossos preços são calculados com base no plano...', 0.87),
        makeKbResult('Política de Reembolso', 'Reembolsos são processados em até 7 dias...', 0.72),
      ]);

    const result = await buildMindSignals(
      {
        prisma: mockPrisma(),
        knowledgeBaseService: { search } as any,
        logger: mockLogger,
      },
      'ws-1',
      'quanto custa o plano premium?',
    );

    expect(search).toHaveBeenCalledWith('ws-1', 'quanto custa o plano premium?', 3);
    expect(result.knowledge).toEqual([
      {
        title: 'FAQ: Preços',
        snippet: 'Nossos preços são calculados com base no plano...',
        relevance: 0.87,
      },
      {
        title: 'Política de Reembolso',
        snippet: 'Reembolsos são processados em até 7 dias...',
        relevance: 0.72,
      },
    ]);
  });

  it('does NOT attach knowledge when search returns empty array', async () => {
    const search = jest.fn().mockResolvedValue([]);

    const result = await buildMindSignals(
      {
        prisma: mockPrisma(),
        knowledgeBaseService: { search } as any,
        logger: mockLogger,
      },
      'ws-1',
      'alguma mensagem qualquer',
    );

    expect(result.knowledge).toBeUndefined();
  });

  it('omits knowledge key when knowledgeBaseService is absent', async () => {
    const result = await buildMindSignals(
      {
        prisma: mockPrisma(),
        logger: mockLogger,
      },
      'ws-1',
      'hello',
    );

    expect(result.knowledge).toBeUndefined();
    expect(mockLogger.warn).not.toHaveBeenCalledWith(
      'kloel_knowledge_base_skipped',
      expect.anything(),
    );
  });

  it('logs warn and omits key when service throws', async () => {
    const search = jest.fn().mockRejectedValue(new Error('vector db offline'));

    const result = await buildMindSignals(
      {
        prisma: mockPrisma(),
        knowledgeBaseService: { search } as any,
        logger: mockLogger,
      },
      'ws-1',
      'hello',
    );

    expect(mockLogger.warn).toHaveBeenCalledWith(
      'kloel_knowledge_base_skipped',
      expect.objectContaining({ reason: 'vector db offline' }),
    );
    expect(result.knowledge).toBeUndefined();
  });

  it('coexists with other mind signals (concepts still populate)', async () => {
    const search = jest.fn().mockResolvedValue([makeKbResult('FAQ', 'Texto de exemplo...', 0.91)]);
    const detect = jest.fn().mockResolvedValue([{ concept: 'pricing', confidence: 0.85 }]);

    const result = await buildMindSignals(
      {
        prisma: mockPrisma(),
        knowledgeBaseService: { search } as any,
        mindConceptService: { detect },
        logger: mockLogger,
      },
      'ws-1',
      'preço do produto',
    );

    expect(result.knowledge).toBeDefined();
    expect(result.concepts).toBeDefined();
    expect(result.knowledge).toHaveLength(1);
    expect(result.concepts).toHaveLength(1);
  });
});
