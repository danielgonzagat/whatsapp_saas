import { ConfigService } from '@nestjs/config';
import { UnifiedAgentActionsCommerceService } from './unified-agent-actions-commerce.service';
import { UnifiedAgentActionsMessagingService } from './unified-agent-actions-messaging.service';
import { UnifiedAgentActionsService } from './unified-agent-actions.service';
import { UnifiedAgentContextDataService } from './unified-agent-context-data.service';
import { UnifiedAgentContextService } from './unified-agent-context.service';
import { UnifiedAgentResponseService } from './unified-agent-response.service';
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

  it('UnifiedAgentService is instantiable', () => {
    expect(service).toBeInstanceOf(UnifiedAgentService);
  });
});
