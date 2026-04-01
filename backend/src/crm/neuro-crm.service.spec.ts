import { NeuroCrmService } from './neuro-crm.service';

describe('NeuroCrmService', () => {
  let prisma: any;
  let config: any;
  let service: NeuroCrmService;

  beforeEach(() => {
    prisma = {
      contact: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    config = {
      get: jest.fn().mockReturnValue('test-openai-key'),
    };

    service = new NeuroCrmService(prisma, config, {
      trackAiUsage: jest.fn().mockResolvedValue(undefined),
    } as any);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('normalizes AI analysis and persists semantic CRM fields correctly', async () => {
    prisma.contact.findFirst.mockResolvedValue({
      id: 'contact-1',
      workspaceId: 'ws-1',
      phone: '5511999991111',
      name: 'Alice',
      leadScore: 12,
      sentiment: 'NEUTRAL',
      purchaseProbability: 'LOW',
      customFields: { existing: true },
      messages: [
        {
          direction: 'INBOUND',
          content: 'quanto custa no pix?',
          createdAt: new Date('2026-03-20T10:00:00.000Z'),
        },
      ],
      deals: [],
    });

    (service as any).openai = {
      chat: {
        completions: {
          create: jest.fn().mockResolvedValue({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    leadScore: 91,
                    purchaseProbability: 'VERY_HIGH',
                    purchaseProbabilityScore: 0.91,
                    sentiment: 'POSITIVE',
                    intent: 'BUY',
                    summary: 'Lead pediu preço e forma de pagamento.',
                    nextBestAction: 'SEND_OFFER',
                    cluster: 'VIP',
                    reasons: ['asking_price', 'payment_signal'],
                  }),
                },
              },
            ],
          }),
        },
      },
    };

    const result = await service.analyzeContact('ws-1', 'contact-1');

    expect(result).toEqual(
      expect.objectContaining({
        leadScore: 91,
        purchaseProbability: 'VERY_HIGH',
        purchaseProbabilityScore: 0.91,
        sentiment: 'POSITIVE',
        intent: 'BUY',
      }),
    );
    expect(prisma.contact.update).toHaveBeenCalledWith({
      where: { id: 'contact-1' },
      data: expect.objectContaining({
        leadScore: 91,
        sentiment: 'POSITIVE',
        purchaseProbability: 'VERY_HIGH',
        aiSummary: 'Lead pediu preço e forma de pagamento.',
        nextBestAction: 'SEND_OFFER',
        customFields: expect.objectContaining({
          existing: true,
          purchaseProbabilityScore: 0.91,
          probabilityReasons: ['asking_price', 'payment_signal'],
          intent: 'BUY',
          cluster: 'VIP',
          lastNeuroCrmAnalysisAt: expect.any(String),
        }),
      }),
    });
  });

  it('falls back to heuristic analysis when OpenAI is unavailable', async () => {
    prisma.contact.findFirst.mockResolvedValue({
      id: 'contact-2',
      workspaceId: 'ws-1',
      phone: '5511888888888',
      name: 'Bruno',
      leadScore: 5,
      sentiment: 'NEUTRAL',
      purchaseProbability: 'LOW',
      customFields: {},
      messages: [
        {
          direction: 'INBOUND',
          content: 'quero saber o valor',
          createdAt: new Date('2026-03-20T10:00:00.000Z'),
        },
      ],
      deals: [],
    });
    (service as any).openai = null;

    const result = await service.analyzeContact('ws-1', 'contact-2');

    expect(result).toEqual(
      expect.objectContaining({
        sentiment: 'POSITIVE',
        intent: 'BUY',
        purchaseProbability: expect.stringMatching(/HIGH|VERY_HIGH/),
      }),
    );
    expect(prisma.contact.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'contact-2' },
        data: expect.objectContaining({
          sentiment: 'POSITIVE',
          purchaseProbability: expect.stringMatching(/HIGH|VERY_HIGH/),
        }),
      }),
    );
  });
});
