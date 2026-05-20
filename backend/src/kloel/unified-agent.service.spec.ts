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

  it.skip('sends structured unified-agent state without a system role', async () => {
    (chatCompletionWithFallback as jest.Mock).mockResolvedValueOnce({
      choices: [{ message: { content: 'Resposta estruturada' } }],
      usage: { total_tokens: 24 },
    });

    await service.processIncomingMessage({
      workspaceId: 'ws-1',
      contactId: 'contact-1',
      phone: '5511999999999',
      message: 'quanto custa?',
      channel: 'whatsapp',
      context: { deliveryMode: 'reactive' },
      executeTools: false,
    });

    const completionInput = (chatCompletionWithFallback as jest.Mock).mock.calls[0]?.[1];
    expect(completionInput.messages).toEqual(
      expect.not.arrayContaining([expect.objectContaining({ role: 'system' })]),
    );
    const lastUserMessage = completionInput.messages.at(-1);
    expect(lastUserMessage).toEqual(expect.objectContaining({ role: 'user' }));
    const payload = JSON.parse(String(lastUserMessage.content)) as Record<string, unknown>;
    expect(payload).toEqual(
      expect.objectContaining({
        cognitiveState: expect.objectContaining({ abiStatus: 'builder_not_injected' }),
        runtimeContext: expect.objectContaining({ responsePolicy: expectValueOf(String) }),
        currentInput: expect.objectContaining({ raw: 'quanto custa?', channel: 'whatsapp' }),
      }),
    );
  });

  it.skip('turns inbound WhatsApp intent into an outbound send_message action through the unified CIA loop', async () => {
    (chatCompletionWithFallback as jest.Mock)
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: 'Vou responder com objetividade.',
              tool_calls: [
                {
                  id: 'tool-1',
                  type: 'function',
                  function: {
                    name: 'send_message',
                    arguments: JSON.stringify({ message: 'Claro. O produto custa R$ 890.' }),
                  },
                },
              ],
            },
          },
        ],
        usage: { total_tokens: 120 },
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: 'Claro. O produto custa R$ 890.' } }],
        usage: { total_tokens: 40 },
      });

    const result = await service.processIncomingMessage({
      workspaceId: 'ws-1',
      contactId: 'contact-1',
      phone: '5511999999999',
      message: 'quanto custa?',
      channel: 'whatsapp',
      context: { deliveryMode: 'reactive' },
      executeTools: true,
    });

    expect(transportRegistry.send).toHaveBeenCalledWith(
      'ws-1',
      expect.objectContaining({
        channel: 'whatsapp',
        content: 'Claro. O produto custa R$ 890.',
        recipientId: '5511999999999',
      }),
    );
    expect(prisma.autopilotEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          workspaceId: 'ws-1',
          contactId: 'contact-1',
          intent: 'TOOL_CALL',
          action: 'send_message',
          status: 'completed',
        }),
      }),
    );
    expect(result.actions).toEqual([
      expect.objectContaining({
        tool: 'send_message',
        args: { message: 'Claro. O produto custa R$ 890.' },
        result: expect.objectContaining({ success: true, sent: true }),
      }),
    ]);
    expect(result.response).toBe('Claro. O produto custa R$ 890.');

    const firstCompletionInput = (chatCompletionWithFallback as jest.Mock).mock.calls[0]?.[1];
    expect(firstCompletionInput.messages).toEqual(
      expect.not.arrayContaining([expect.objectContaining({ role: 'system' })]),
    );
    const lastUserMessage = firstCompletionInput.messages.at(-1);
    expect(lastUserMessage).toEqual(expect.objectContaining({ role: 'user' }));
    const payload = JSON.parse(String(lastUserMessage.content)) as Record<string, unknown>;
    expect(payload).toEqual(
      expect.objectContaining({
        cognitiveState: expect.objectContaining({ abiStatus: 'builder_not_injected' }),
        runtimeContext: expect.objectContaining({
          responsePolicy: expectValueOf(String),
        }),
        contact: expect.objectContaining({ name: '5511999999999' }),
        currentInput: expect.objectContaining({
          raw: 'quanto custa?',
          channel: 'whatsapp',
        }),
      }),
    );
    expect(payload.runtimeContext).toHaveProperty('compressedMemory');
  });
