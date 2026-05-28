import { buildMindSignals } from './build-mind-signals.helper';
import { mockLogger, mockPrisma } from './build-mind-signals.helper.fixtures';

describe('buildMindSignals — case memory priorCases (PI-K15-B)', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  const makeCase = (situation: string, outcome: string, similarity: number) => ({
    situation,
    outcome,
    similarity,
  });

  it('attaches priorCases when service returns matches', async () => {
    const findSimilarCases = jest.fn().mockResolvedValue([
      makeCase('Cliente pediu desconto após 30 dias', '10% concedido, lead converteu', 0.82),
      makeCase('Cliente reclamou de preço', 'ofereceu parcelamento, lead sumiu', 0.61),
    ]);

    const result = await buildMindSignals(
      {
        prisma: mockPrisma(),
        mindCaseMemoryService: { findSimilarCases },
        logger: mockLogger,
      },
      'ws-1',
      'esse preço tá muito alto',
    );

    expect(findSimilarCases).toHaveBeenCalledWith('ws-1', { userMessage: 'esse preço tá muito alto' }, 3);
    expect(result.priorCases).toEqual([
      { situation: 'Cliente pediu desconto após 30 dias', outcome: '10% concedido, lead converteu', similarity: 0.82 },
      { situation: 'Cliente reclamou de preço', outcome: 'ofereceu parcelamento, lead sumiu', similarity: 0.61 },
    ]);
  });

  it('attaches empty array when service returns no matches', async () => {
    const findSimilarCases = jest.fn().mockResolvedValue([]);

    const result = await buildMindSignals(
      {
        prisma: mockPrisma(),
        mindCaseMemoryService: { findSimilarCases },
        logger: mockLogger,
      },
      'ws-1',
      'mensagem qualquer',
    );

    expect(result.priorCases).toEqual([]);
  });

  it('omits priorCases key when mindCaseMemoryService is absent', async () => {
    const result = await buildMindSignals(
      {
        prisma: mockPrisma(),
        logger: mockLogger,
      },
      'ws-1',
      'hello',
    );

    expect(result.priorCases).toBeUndefined();
  });

  it('omits priorCases key when findSimilarCases is absent', async () => {
    const result = await buildMindSignals(
      {
        prisma: mockPrisma(),
        mindCaseMemoryService: {},
        logger: mockLogger,
      },
      'ws-1',
      'hello',
    );

    expect(result.priorCases).toBeUndefined();
  });

  it('logs warn and omits key when service throws', async () => {
    const findSimilarCases = jest.fn().mockRejectedValue(new Error('db offline'));

    const result = await buildMindSignals(
      {
        prisma: mockPrisma(),
        mindCaseMemoryService: { findSimilarCases },
        logger: mockLogger,
      },
      'ws-1',
      'hello',
    );

    expect(mockLogger.warn).toHaveBeenCalledWith(
      'kloel_mind_case_memory_skipped',
      expect.objectContaining({ reason: 'db offline' }),
    );
    expect(result.priorCases).toBeUndefined();
  });

  it('coexists with other mind signals (riskClass still populates)', async () => {
    const findSimilarCases = jest.fn().mockResolvedValue([
      makeCase('Cliente feliz', 'comprou de novo', 0.95),
    ]);
    const classify = jest.fn().mockReturnValue({
      class: 'R1' as const,
      autonomyMode: 'allowed_alone' as const,
      requiredEvidenceLevel: 'N1' as const,
      rollback: ['revert_locally'],
    });

    const result = await buildMindSignals(
      {
        prisma: mockPrisma(),
        mindCaseMemoryService: { findSimilarCases },
        riskClassService: { classify },
        logger: mockLogger,
      },
      'ws-1',
      'preciso de ajuda',
    );

    expect(result.priorCases).toBeDefined();
    expect(result.riskClass).toBeDefined();
    expect(result.priorCases).toHaveLength(1);
    expect(result.riskClass!.tier).toBe('R1');
  });
});
