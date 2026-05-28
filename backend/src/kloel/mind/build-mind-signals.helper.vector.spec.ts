import { buildMindSignals } from './build-mind-signals.helper';
import { mockLogger, mockPrisma } from './build-mind-signals.helper.fixtures';

describe('buildMindSignals — semantic vector similarity (PI-K17-B)', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  const stubbedMatches = [
    { text: 'Nosso plano Pro custa R$ 97/mês', score: 0.12 },
    { text: 'O plano básico inclui 100 leads por mês', score: 0.23 },
  ];

  it('attaches semanticMatches when vectorService is present and returns results', async () => {
    const similaritySearch = jest.fn().mockResolvedValue(stubbedMatches);
    const result = await buildMindSignals(
      {
        prisma: mockPrisma(),
        vectorService: { similaritySearch },
        logger: mockLogger,
      },
      'ws-1',
      'quanto custa o plano?',
    );
    expect(similaritySearch).toHaveBeenCalledWith('ws-1', 'quanto custa o plano?', 5);
    expect(result.semanticMatches).toEqual(stubbedMatches);
  });

  it('omits semanticMatches key when vectorService is absent', async () => {
    const result = await buildMindSignals(
      { prisma: mockPrisma(), logger: mockLogger },
      'ws-1',
      'oi tudo bem?',
    );
    expect(result.semanticMatches).toBeUndefined();
  });

  it('logs warn and omits key when similaritySearch throws', async () => {
    const similaritySearch = jest.fn().mockRejectedValue(new Error('vector db unreachable'));
    const result = await buildMindSignals(
      {
        prisma: mockPrisma(),
        vectorService: { similaritySearch },
        logger: mockLogger,
      },
      'ws-1',
      'quero comprar',
    );
    expect(mockLogger.warn).toHaveBeenCalledWith(
      'kloel_vector_search_skipped',
      expect.objectContaining({ reason: 'vector db unreachable' }),
    );
    expect(result.semanticMatches).toBeUndefined();
  });

  it('attaches empty array when similaritySearch returns empty results', async () => {
    const similaritySearch = jest.fn().mockResolvedValue([]);
    const result = await buildMindSignals(
      {
        prisma: mockPrisma(),
        vectorService: { similaritySearch },
        logger: mockLogger,
      },
      'ws-1',
      'produto inexistente xyz',
    );
    expect(result.semanticMatches).toEqual([]);
  });
});
