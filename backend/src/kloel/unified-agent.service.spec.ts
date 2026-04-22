import { ConfigService } from '@nestjs/config';
import { UnifiedAgentService } from './unified-agent.service';

type LeadChannel = 'whatsapp' | 'instagram' | 'messenger';
type ServiceTestProxy = {
  primaryBrainModel: string;
  fallbackBrainModel: string;
  writerModel: string;
  fallbackWriterModel: string;
  buildSystemPrompt: (
    workspace: Record<string, unknown>,
    products: unknown[],
    aiConfigs?: Array<Record<string, unknown>>,
    channel?: LeadChannel,
  ) => string;
  buildLeadTacticalHint: (params: {
    leadName?: string | null;
    currentMessage: string;
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
    contactSummary?: string | null;
    nextBestAction?: string | null;
  }) => string;
  computeReplyStyleBudget: (
    message: string,
    historyTurns?: number,
    channel?: LeadChannel,
  ) => { maxWords: number; maxSentences: number };
  finalizeReplyStyle: (
    customerMessage: string,
    reply?: string | null,
    historyTurns?: number,
    channel?: LeadChannel,
  ) => string | undefined;
  getConversationHistory: (
    workspaceId: string,
    contactId: string,
    limit: number,
    phone?: string,
  ) => Promise<Array<{ role: string; content: string }>>;
};

type PrismaTestMock = {
  $transaction: jest.Mock;
  workspace: {
    findUnique: jest.Mock;
  };
  contact: {
    findUnique: jest.Mock;
    findFirst: jest.Mock;
  };
  message: {
    findMany: jest.Mock;
  };
  kloelMemory: {
    findFirst: jest.Mock;
    findMany: jest.Mock;
  };
  product: {
    findFirst: jest.Mock;
    findMany: jest.Mock;
  };
};

describe('UnifiedAgentService', () => {
  let prisma: PrismaTestMock;
  let whatsappService: { sendMessage: jest.Mock };
  let paymentService: { createPayment: jest.Mock };
  let service: UnifiedAgentService;
  let serviceProxy: ServiceTestProxy;

  beforeEach(() => {
    process.env.NODE_ENV = 'test';

    prisma = {
      $transaction: jest.fn(async (cb: (tx: unknown) => unknown) => cb({})),
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

    // messageLimit: enforced via PlanLimitsService.trackMessageSend
    whatsappService = {
      sendMessage: jest.fn().mockResolvedValue({ error: false, delivery: 'sent', direct: true }),
    };

    paymentService = {
      createPayment: jest.fn().mockResolvedValue({
        id: 'pi_pix_1',
        paymentLink: 'https://pay.stripe.com/pix/pi_pix_1',
        pixQrCodeUrl: 'data:image/png;base64,qr',
        pixCopyPaste: '000201pixcopy',
        status: 'requires_action',
      }),
    };

    service = new UnifiedAgentService(
      prisma as unknown as ConstructorParameters<typeof UnifiedAgentService>[0],
      {
        get: jest.fn((key: string) => {
          if (key === 'OPENAI_API_KEY') {
            return undefined;
          }
          if (key === 'OPENAI_BRAIN_MODEL') {
            return 'gpt-5.4';
          }
          if (key === 'OPENAI_BRAIN_FALLBACK_MODEL') {
            return 'gpt-4.1';
          }
          if (key === 'OPENAI_WRITER_MODEL') {
            return 'gpt-5.4-nano-2026-03-17';
          }
          if (key === 'OPENAI_WRITER_FALLBACK_MODEL') {
            return 'gpt-4.1';
          }
          if (key === 'FRONTEND_URL') {
            return 'https://app.kloel.test';
          }
          return undefined;
        }),
      } as unknown as ConfigService,
      paymentService as unknown as ConstructorParameters<typeof UnifiedAgentService>[2],
      {} as unknown as ConstructorParameters<typeof UnifiedAgentService>[3],
      {} as unknown as ConstructorParameters<typeof UnifiedAgentService>[4],
      whatsappService as unknown as ConstructorParameters<typeof UnifiedAgentService>[5],
      {} as unknown as ConstructorParameters<typeof UnifiedAgentService>[6],
      {
        trackAiUsage: jest.fn().mockResolvedValue(undefined),
      } as unknown as ConstructorParameters<typeof UnifiedAgentService>[7],
      {
        log: jest.fn().mockResolvedValue(undefined),
      } as unknown as ConstructorParameters<typeof UnifiedAgentService>[8],
    );
    serviceProxy = service as unknown as ServiceTestProxy;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('send_product_info always sends the generated product answer to WhatsApp', async () => {
    prisma.product.findFirst.mockResolvedValue({
      id: 'prod-1',
      name: 'Test Product',
      description: 'Bioestimulador regenerativo',
      price: 890,
      paymentLink: 'https://pay.kloel.test/serum-premium',
      active: true,
    });

    const result = await service.executeTool(
      'send_product_info',
      {
        productName: 'Test Product',
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
      expect.stringContaining('Test Product'),
      {
        complianceMode: 'proactive',
        forceDirect: false,
      },
    );
    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        sent: true,
        message: expect.stringMatching(/Preço:\sR\$\s?890(?:,00)?/),
      }),
    );
  });

  it('uses the configured brain/writer model split', () => {
    expect(serviceProxy.primaryBrainModel).toBe('gpt-5.4');
    expect(serviceProxy.fallbackBrainModel).toBe('gpt-4.1');
    expect(serviceProxy.writerModel).toBe('gpt-5.4-nano-2026-03-17');
    expect(serviceProxy.fallbackWriterModel).toBe('gpt-4.1');
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

    const history = await serviceProxy.getConversationHistory('ws-1', '', 10, '5511999999999');

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
    const reply = serviceProxy.finalizeReplyStyle(
      'quanto custa?',
      'Claro! O produto custa R$ 890. Posso te explicar os benefícios, formas de pagamento e próximos passos se você quiser 😊',
    );

    expect(reply).toBe(
      'Claro! O produto custa R$ 890. Posso te explicar os benefícios, formas de pagamento e próximos passos se você quiser',
    );
    expect(reply).not.toContain('😊');
  });

  it('never exposes Guest Workspace as the company identity in the system prompt', () => {
    const prompt = serviceProxy.buildSystemPrompt(
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

  it('keeps AI identity disclosure honest even when legacy hideAiIdentity is enabled', () => {
    const prompt = serviceProxy.buildSystemPrompt(
      {
        name: 'Workspace Test',
        providerSettings: {},
      },
      [],
      [
        {
          salesArguments: {
            hideAiIdentity: true,
          },
        },
      ],
    );

    expect(prompt).toContain('Se perguntarem diretamente se você é IA');
    expect(prompt).toContain(
      'responda com transparência curta que você é a assistente virtual da empresa',
    );
    expect(prompt).not.toContain('desvie naturalmente para o atendimento sem confirmar ou negar');
    expect(prompt).not.toContain('Aja como uma atendente humana da empresa');
  });

  it('does not push lead capture when the customer asks directly if it is AI or human', () => {
    const hint = serviceProxy.buildLeadTacticalHint({
      leadName: 'Marina',
      currentMessage: 'antes de continuar, voce e ia ou humano?',
      conversationHistory: [
        { role: 'user', content: 'Oi' },
        { role: 'assistant', content: 'Oi! Me diz como posso te ajudar.' },
      ],
      contactSummary: 'Lead novo em fase inicial.',
    });

    expect(hint).toContain('Responda isso primeiro');
    expect(hint).toContain('Não peça nome');
    expect(hint).not.toContain('Posso salvar seu contato como Marina?');
  });

  it('forces contextual follow-up messages to reuse the active topic instead of resetting the conversation', () => {
    const hint = serviceProxy.buildLeadTacticalHint({
      leadName: 'Larissa',
      currentMessage: 'e o prazo pra eu conseguir fazer isso?',
      conversationHistory: [
        { role: 'user', content: 'Oi, queria saber da harmonização full face' },
        {
          role: 'assistant',
          content: 'Claro. A harmonização full face aqui está em R$ 2.400.',
        },
      ],
      contactSummary:
        'Interesse alto em harmonização full face, objeção principal é resultado artificial.',
      nextBestAction: 'reduzir risco e convidar para avaliação',
    });

    expect(hint).toContain('Resumo comercial salvo');
    expect(hint).toContain('harmonização full face');
    expect(hint).toContain('Cite explicitamente o assunto ativo');
    expect(hint).toContain('Próxima melhor ação recomendada');
  });

  it('does not force name confirmation when the lead asks a concrete commercial question', () => {
    const hint = serviceProxy.buildLeadTacticalHint({
      leadName: 'Rafael',
      currentMessage: 'Oi, queria entender como funciona a avaliacao e valores',
      conversationHistory: [],
    });

    expect(hint).toContain('Use esse nome com naturalidade');
    expect(hint).not.toContain('Posso salvar seu contato como Rafael?');
  });

  it('adds real channel adaptation instructions for instagram and messenger', () => {
    const instagramPrompt = serviceProxy.buildSystemPrompt(
      {
        name: 'Workspace Test',
        providerSettings: {},
      },
      [],
      [],
      'instagram',
    );
    const messengerPrompt = serviceProxy.buildSystemPrompt(
      {
        name: 'Workspace Test',
        providerSettings: {},
      },
      [],
      [],
      'messenger',
    );

    expect(instagramPrompt).toContain('AJUSTE DE CANAL: Instagram Direct.');
    expect(instagramPrompt).toContain('Menor tolerância a textão.');
    expect(messengerPrompt).toContain('AJUSTE DE CANAL: Facebook Messenger.');
    expect(messengerPrompt).toContain('contexto de atendimento');
  });

  it('changes reply budgets by channel instead of treating every channel like WhatsApp', () => {
    const instagramBudget = serviceProxy.computeReplyStyleBudget(
      'quero saber preço e prazo do produto porque vi no anúncio',
      0,
      'instagram',
    );
    const whatsappBudget = serviceProxy.computeReplyStyleBudget(
      'quero saber preço e prazo do produto porque vi no anúncio',
      0,
      'whatsapp',
    );
    const messengerBudget = serviceProxy.computeReplyStyleBudget(
      'quero saber preço e prazo do produto porque vi no anúncio',
      0,
      'messenger',
    );

    expect(instagramBudget.maxWords).toBeLessThan(whatsappBudget.maxWords);
    expect(instagramBudget.maxSentences).toBeLessThanOrEqual(whatsappBudget.maxSentences);
    expect(messengerBudget.maxWords).toBeGreaterThan(whatsappBudget.maxWords);
    expect(messengerBudget.maxSentences).toBeGreaterThanOrEqual(whatsappBudget.maxSentences);
  });

  it('does not cut the reply in the middle of a sentence', () => {
    const reply = serviceProxy.finalizeReplyStyle(
      'me explica o serum',
      'O serum ajuda na regeneração da pele. Ele melhora a qualidade do tecido e pode ser usado em protocolos de rejuvenescimento. Também posso te explicar indicação, preço e próximos passos.',
    );

    expect(reply).toBe(
      'O serum ajuda na regeneração da pele. Ele melhora a qualidade do tecido e pode ser usado em protocolos de rejuvenescimento.',
    );
    expect(reply?.endsWith('.')).toBe(true);
    expect(reply).not.toMatch(/pr[óo]ximos$/i);
  });

  it('creates payment links through the payment kernel and sends the pix payload to WhatsApp', async () => {
    prisma.contact.findFirst.mockResolvedValue({
      id: 'contact-1',
      name: 'Cliente Pix',
      email: 'cliente@example.com',
    });

    const result = await service.executeTool(
      'create_payment_link',
      {
        amount: 139.9,
        productName: 'Produto X',
      },
      {
        workspaceId: 'ws-1',
        phone: '5511999999999',
      },
    );

    expect(paymentService.createPayment).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      leadId: 'contact-1',
      customerName: 'Cliente Pix',
      customerPhone: '5511999999999',
      customerEmail: 'cliente@example.com',
      amount: 139.9,
      description: 'Pagamento - Produto X',
    });
    expect(whatsappService.sendMessage).toHaveBeenCalledWith(
      'ws-1',
      '5511999999999',
      expect.stringContaining('000201pixcopy'),
      expect.objectContaining({
        complianceMode: 'proactive',
        forceDirect: false,
      }),
    );
    expect(result).toMatchObject({
      success: true,
      paymentId: 'pi_pix_1',
      paymentLink: 'https://pay.stripe.com/pix/pi_pix_1',
      pixCopyPaste: '000201pixcopy',
      sent: true,
    });
  });
});
