import { ConfigService } from '@nestjs/config';
import { UnifiedAgentService } from './unified-agent.service';

describe('UnifiedAgentService', () => {
  let prisma: any;
  let whatsappService: any;
  let service: UnifiedAgentService;

  beforeEach(() => {
    process.env.NODE_ENV = 'test';

    prisma = {
      workspace: {
        findUnique: jest.fn().mockResolvedValue({
          name: 'Workspace Test',
          providerSettings: {},
        }),
      },
      contact: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      message: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      kloelMemory: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
      product: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    whatsappService = {
      sendMessage: jest
        .fn()
        .mockResolvedValue({ error: false, delivery: 'sent', direct: true }),
    };

    service = new UnifiedAgentService(
      prisma,
      {
        get: jest.fn((key: string) => {
          if (key === 'OPENAI_API_KEY') return undefined;
          if (key === 'OPENAI_MODEL') return 'gpt-4o-mini';
          if (key === 'FRONTEND_URL') return 'https://app.kloel.test';
          return undefined;
        }),
      } as unknown as ConfigService,
      {} as any,
      {} as any,
      whatsappService,
      {} as any,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('send_product_info always sends the generated product answer to WhatsApp', async () => {
    prisma.product.findFirst.mockResolvedValue({
      id: 'prod-1',
      name: 'PDRN',
      description: 'Bioestimulador regenerativo',
      price: 890,
      paymentLink: 'https://pay.kloel.test/pdrn',
      active: true,
    });

    const result = await service.executeTool(
      'send_product_info',
      {
        productName: 'PDRN',
        includePrice: true,
        includeLink: false,
      },
      {
        workspaceId: 'ws-1',
        phone: '5511999999999',
      },
    );

    expect(whatsappService.sendMessage).toHaveBeenCalledWith(
      'ws-1',
      '5511999999999',
      expect.stringContaining('PDRN'),
      {
        complianceMode: 'proactive',
        forceDirect: false,
      },
    );
    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        sent: true,
        message: expect.stringContaining('Preço: R$ 890.00'),
      }),
    );
  });

  it('uses the configured OPENAI_MODEL for the primary agent model', () => {
    expect((service as any).primaryModel).toBe('gpt-4o-mini');
    expect((service as any).fallbackModel).toBe('gpt-4o-mini');
  });

  it('loads conversation history by phone when contactId is missing', async () => {
    prisma.message.findMany.mockResolvedValue([
      {
        content: 'Oi',
        direction: 'INBOUND',
      },
      {
        content: 'Claro, te explico agora.',
        direction: 'OUTBOUND',
      },
    ]);

    const history = await (service as any).getConversationHistory(
      'ws-1',
      '',
      10,
      '5511999999999',
    );

    expect(prisma.message.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId: 'ws-1',
          contact: { phone: '5511999999999' },
        },
        take: 10,
      }),
    );
    expect(history).toEqual([
      { role: 'user', content: 'Oi' },
      { role: 'assistant', content: 'Claro, te explico agora.' },
    ]);
  });

  it('compresses long replies to mirror short customer messages', () => {
    const reply = (service as any).finalizeReplyStyle(
      'quanto custa?',
      'Claro! O produto custa R$ 890. Posso te explicar os benefícios, formas de pagamento e próximos passos se você quiser 😊',
    );

    expect(reply).toBe('Claro! O produto custa R$ 890.');
    expect(reply).not.toContain('😊');
  });
});
