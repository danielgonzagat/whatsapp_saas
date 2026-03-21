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
          if (key === 'OPENAI_BRAIN_MODEL') return 'gpt-5.4';
          if (key === 'OPENAI_BRAIN_FALLBACK_MODEL') return 'gpt-4.1';
          if (key === 'OPENAI_WRITER_MODEL')
            return 'gpt-5.4-nano-2026-03-17';
          if (key === 'OPENAI_WRITER_FALLBACK_MODEL') return 'gpt-4.1';
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

  it('uses the configured brain/writer model split', () => {
    expect((service as any).primaryBrainModel).toBe('gpt-5.4');
    expect((service as any).fallbackBrainModel).toBe('gpt-4.1');
    expect((service as any).writerModel).toBe('gpt-5.4-nano-2026-03-17');
    expect((service as any).fallbackWriterModel).toBe('gpt-4.1');
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
      { role: 'assistant', content: 'Claro, te explico agora.' },
      { role: 'user', content: 'Oi' },
    ]);
  });

  it('compresses long replies to mirror short customer messages', () => {
    const reply = (service as any).finalizeReplyStyle(
      'quanto custa?',
      'Claro! O produto custa R$ 890. Posso te explicar os benefícios, formas de pagamento e próximos passos se você quiser 😊',
    );

    expect(reply).toBe(
      'Claro! O produto custa R$ 890. Posso te explicar os benefícios, formas de pagamento e próximos passos se você quiser',
    );
    expect(reply).not.toContain('😊');
  });

  it('never exposes Guest Workspace as the company identity in the system prompt', () => {
    const prompt = (service as any).buildSystemPrompt(
      {
        name: 'Guest Workspace',
        providerSettings: {
          whatsappApiSession: {
            pushName: 'Branding Caps',
          },
        },
      },
      [],
    );

    expect(prompt).toContain('EMPRESA: Branding Caps');
    expect(prompt).not.toContain('EMPRESA: Guest Workspace');
    expect(prompt).toContain('Nunca se apresente como "Guest Workspace"');
  });

  it('does not cut the reply in the middle of a sentence', () => {
    const reply = (service as any).finalizeReplyStyle(
      'me explica o pdrn',
      'O PDRN ajuda na regeneração da pele. Ele melhora a qualidade do tecido e pode ser usado em protocolos de rejuvenescimento. Também posso te explicar indicação, preço e próximos passos.',
    );

    expect(reply).toBe(
      'O PDRN ajuda na regeneração da pele. Ele melhora a qualidade do tecido e pode ser usado em protocolos de rejuvenescimento.',
    );
    expect(reply?.endsWith('.')).toBe(true);
    expect(reply).not.toMatch(/pr[óo]ximos$/i);
  });
});
