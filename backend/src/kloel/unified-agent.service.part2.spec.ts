import { expectValueOf } from '../../test/expect-value-of';
jest.mock('./openai-wrapper', () => ({
  chatCompletionWithFallback: jest.fn(),
}));

import { ConfigService } from '@nestjs/config';
import { UnifiedAgentActionsCommerceService } from './unified-agent-actions-commerce.service';
import { UnifiedAgentActionsMessagingService } from './unified-agent-actions-messaging.service';
import { UnifiedAgentActionsService } from './unified-agent-actions.service';
import { UnifiedAgentContextDataService } from './unified-agent-context-data.service';
import { UnifiedAgentContextService } from './unified-agent-context.service';
import { chatCompletionWithFallback } from './openai-wrapper';
import { UnifiedAgentResponseService } from './unified-agent-response.service';
import { chatCompletionWithFallback } from './openai-wrapper';
import { UnifiedAgentService } from './unified-agent.service';

jest.mock('./openai-wrapper', () => ({
  chatCompletionWithFallback: jest.fn(),
}));

type UnifiedAgentPrismaMock = {
  $transaction: jest.Mock;
  workspace: { findUnique: jest.Mock };
  contact: { findUnique: jest.Mock; findFirst: jest.Mock };
  message: { findMany: jest.Mock };
  kloelMemory: { findFirst: jest.Mock; findMany: jest.Mock; upsert: jest.Mock };
  product: { findFirst: jest.Mock; findMany: jest.Mock };
  autopilotEvent: { create: jest.Mock };
};

const BLOCKED_PAYMENT_LINK_COMPLETION = {
  choices: [
    {
      message: {
        content: null,
        tool_calls: [
          {
            id: 'call-1',
            type: 'function',
            function: { name: 'create_payment_link', arguments: '{"amount":100}' },
          },
        ],
      },
    },
  ],
  usage: { total_tokens: 12 },
};

const BLOCKED_PAYMENT_LINK_ACTION = {
  tool: 'create_payment_link',
  args: {},
  result: { blocked: true, reason: 'capability_not_allowed' },
};

function mockBlockedToolCallCompletion() {
  (chatCompletionWithFallback as jest.Mock)
    .mockResolvedValueOnce(BLOCKED_PAYMENT_LINK_COMPLETION)
    .mockResolvedValueOnce({
      choices: [{ message: { content: 'Posso te ajudar por aqui.' } }],
      usage: { total_tokens: 8 },
    });
}

function blockedPaymentLinkEventExpectation() {
  return expect.objectContaining({
    data: expect.objectContaining({
      action: 'create_payment_link',
      contactId: 'contact-1',
      status: 'failed',
      workspaceId: 'ws-1',
    }),
  });
}

function expectPaymentLinkToolBlocked(
  result: { actions: unknown[] },
  prisma: UnifiedAgentPrismaMock,
  paymentService: { createPayment: jest.Mock },
  planLimits: { trackAiUsage: jest.Mock },
) {
  expect(paymentService.createPayment).not.toHaveBeenCalled();
  expect(chatCompletionWithFallback).toHaveBeenCalledTimes(2);
  expect(planLimits.trackAiUsage).toHaveBeenCalledWith('ws-1', 12);
  expect(planLimits.trackAiUsage).toHaveBeenCalledWith('ws-1', 8);
  expect(prisma.autopilotEvent.create).toHaveBeenCalledWith(blockedPaymentLinkEventExpectation());
  expect(result.actions).toEqual([BLOCKED_PAYMENT_LINK_ACTION]);
}

describe('UnifiedAgentService', () => {
  let prisma: UnifiedAgentPrismaMock;
  let whatsappService: { sendMessage: jest.Mock };
  let transportRegistry: { send: jest.Mock };
  let paymentService: { createPayment: jest.Mock };
  let configMock: ConfigService;
  let planLimits: { ensureTokenBudget: jest.Mock; trackAiUsage: jest.Mock };
  let dailyLimit: { ensureProactiveDailyLimit: jest.Mock };
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
        upsert: jest.fn().mockResolvedValue({ id: 'memory-1' }),
      },
      product: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      autopilotEvent: {
        create: jest.fn().mockResolvedValue({ id: 'event-1' }),
      },
    };

    // messageLimit: enforced via PlanLimitsService.trackMessageSend
    whatsappService = {
      sendMessage: jest.fn().mockResolvedValue({ error: false, delivery: 'sent', direct: true }),
    };
    transportRegistry = {
      send: jest.fn().mockResolvedValue({ success: true, blocked: false, messageId: 'msg-1' }),
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
        if (key === 'OPENAI_API_KEY') {
          return 'test-openai-key';
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
    } as never as ConfigService;
    planLimits = {
      ensureTokenBudget: jest.fn().mockResolvedValue(undefined),
      trackAiUsage: jest.fn().mockResolvedValue(undefined),
    };
    dailyLimit = {
      ensureProactiveDailyLimit: jest.fn().mockResolvedValue({
        allowed: true,
        capAtDay: 100,
        remaining: 99,
      }),
    };

    const contextData = new UnifiedAgentContextDataService(prisma as never);
    ctx = new UnifiedAgentContextService(contextData);
    response = new UnifiedAgentResponseService(planLimits as never);
    const messaging = new UnifiedAgentActionsMessagingService(
      whatsappService as never,
      {} as never,
      transportRegistry as never,
      dailyLimit as never,
    );
    const commerce = new UnifiedAgentActionsCommerceService(
      prisma as never,
      configMock,
      paymentService as never,
      {} as never,
      messaging,
    );
    const actions = new UnifiedAgentActionsService(
      prisma as never,
      {} as never,
      whatsappService as never,
      messaging,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      commerce,
      { logWithTx: jest.fn().mockResolvedValue(undefined) } as never,
    );

    service = new UnifiedAgentService(
      prisma as never,
      configMock,
      planLimits as never,
      { log: jest.fn().mockResolvedValue(undefined) } as never,
      ctx,
      response,
      actions,
    );
    Reflect.set(service, 'openai', {});
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

    expect(transportRegistry.send).toHaveBeenCalledWith(
      'ws-1',
      expect.objectContaining({
        channel: 'whatsapp',
        recipientId: '5511999999999',
        content: expect.stringContaining('Test Product'),
      }),
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

  it('executes predecided actions without delegating tool choice to the LLM', async () => {
    const result = await service.processMessage({
      workspaceId: 'ws-1',
      contactId: 'contact-1',
      phone: '5511999999999',
      message: 'manda o link',
      allowedTools: ['send_message'],
      predecidedActions: [
        {
          tool: 'send_message',
          args: { message: 'Aqui está o próximo passo.' },
        },
      ],
      context: { channel: 'whatsapp' },
    });

    expect(transportRegistry.send).toHaveBeenCalledWith(
      'ws-1',
      expect.objectContaining({
        content: 'Aqui está o próximo passo.',
        recipientId: '5511999999999',
      }),
    );
    expect(result.actions).toEqual([
      expect.objectContaining({
        tool: 'send_message',
        args: { message: 'Aqui está o próximo passo.' },
      }),
    ]);
    expect(result.intent).toBe('FOLLOW_UP');
    expect(result.confidence).toBe(0.85);
  });

  it('blocks predecided actions that are outside the Brain capability policy', async () => {
    const result = await service.processMessage({
      workspaceId: 'ws-1',
      contactId: 'contact-1',
      phone: '5511999999999',
      message: 'manda o link',
      allowedTools: ['send_message'],
      predecidedActions: [
        {
          tool: 'create_payment_link',
          args: { amount: 100, productName: 'Produto X' },
        },
      ],
    });

    expect(paymentService.createPayment).not.toHaveBeenCalled();
    expect(result.actions).toEqual([
      {
        tool: 'create_payment_link',
        args: { amount: 100, productName: 'Produto X' },
        result: {
          blocked: true,
          reason: 'capability_not_allowed',
          riskClass: 'R3',
          approvalRequired: true,
          escalation: 'human_operator_required',
          safeNextStep: 'redirect_to_manual_checkout',
          rollback: 'not_executed',
        },
      },
    ]);
  });
