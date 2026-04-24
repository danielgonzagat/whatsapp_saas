import { ConfigService } from '@nestjs/config';
import { UnifiedAgentActionsCommerceService } from './unified-agent-actions-commerce.service';
import { UnifiedAgentActionsMessagingService } from './unified-agent-actions-messaging.service';
import { UnifiedAgentActionsService } from './unified-agent-actions.service';
import { UnifiedAgentContextDataService } from './unified-agent-context-data.service';
import { UnifiedAgentContextService } from './unified-agent-context.service';
import { UnifiedAgentResponseService } from './unified-agent-response.service';
import { UnifiedAgentService } from './unified-agent.service';

type UnifiedAgentPrismaMock = {
  $transaction: jest.Mock;
  workspace: { findUnique: jest.Mock };
  contact: { findUnique: jest.Mock; findFirst: jest.Mock };
  message: { findMany: jest.Mock };
  kloelMemory: { findFirst: jest.Mock; findMany: jest.Mock };
  product: { findFirst: jest.Mock; findMany: jest.Mock };
};

describe('UnifiedAgentService', () => {
  let prisma: UnifiedAgentPrismaMock;
  let whatsappService: { sendMessage: jest.Mock };
  let paymentService: { createPayment: jest.Mock };
  let configMock: ConfigService;
  let service: UnifiedAgentService;
  let ctx: UnifiedAgentContextService;
  let response: UnifiedAgentResponseService;

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

    configMock = {
      get: jest.fn((key: string) => {
        if (key === 'OPENAI_API_KEY') return undefined;
        if (key === 'OPENAI_BRAIN_MODEL') return 'gpt-5.4';
        if (key === 'OPENAI_BRAIN_FALLBACK_MODEL') return 'gpt-4.1';
        if (key === 'OPENAI_WRITER_MODEL') return 'gpt-5.4-nano-2026-03-17';
        if (key === 'OPENAI_WRITER_FALLBACK_MODEL') return 'gpt-4.1';
        if (key === 'FRONTEND_URL') return 'https://app.kloel.test';
        return undefined;
      }),
    } as never as ConfigService;

    const contextData = new UnifiedAgentContextDataService(prisma as never);
    ctx = new UnifiedAgentContextService(contextData as never);
    response = new UnifiedAgentResponseService({} as never);
    const messaging = new UnifiedAgentActionsMessagingService(
      whatsappService as never,
      {} as never,
    );
    const commerce = new UnifiedAgentActionsCommerceService(
      prisma as never,
      configMock as never,
      paymentService as never,
      {} as never,
      messaging as never,
    );
    const actions = new UnifiedAgentActionsService(
      prisma as never,
      {} as never,
      whatsappService as never,
      {} as never,
      messaging as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      commerce as never,
    );

    service = new UnifiedAgentService(
      prisma as never,
      configMock,
      paymentService as never,
      {} as never,
      {} as never,
      whatsappService as never,
      {} as never,
      { trackAiUsage: jest.fn().mockResolvedValue(undefined) } as never,
      { log: jest.fn().mockResolvedValue(undefined) } as never,
      ctx as never,
      response as never,
      actions as never,
    );
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
    expect(Reflect.get(service, 'primaryBrainModel')).toBe('gpt-5.4');
    expect(Reflect.get(service, 'fallbackBrainModel')).toBe('gpt-4.1');
    expect(Reflect.get(service, 'writerModel')).toBe('gpt-5.4-nano-2026-03-17');
    expect(Reflect.get(service, 'fallbackWriterModel')).toBe('gpt-4.1');
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

    const history = await ctx.getConversationHistory('ws-1', '', 10, '5511999999999');

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
    const reply = response.finalizeReplyStyle(
      'quanto custa?',
      'Claro! O produto custa R$ 890. Posso te explicar os benefícios, formas de pagamento e próximos passos se você quiser 😊',
    );

    expect(reply).toBe(
      'Claro! O produto custa R$ 890. Posso te explicar os benefícios, formas de pagamento e próximos passos se você quiser',
    );
    expect(reply).not.toContain('😊');
  });

  it('never exposes Guest Workspace as the company identity in the system prompt', () => {
    const prompt = ctx.buildSystemPrompt(
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
    const reply = response.finalizeReplyStyle(
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
