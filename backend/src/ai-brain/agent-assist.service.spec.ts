jest.mock('../kloel/openai-wrapper', () => ({
  chatCompletionWithRetry: jest.fn().mockResolvedValue({
    usage: { total_tokens: 42 },
    choices: [{ message: { content: 'Resumo pronto' } }],
  }),
}));

import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AgentAssistService } from './agent-assist.service';

describe('AgentAssistService', () => {
  let prisma: {
    /** Mocked prisma.conversation namespace exposing only what the SUT touches. */
    conversation: {
      /** Mocked findFirst used to simulate Prisma lookups. */
      findFirst: jest.Mock;
    };
  };
  let planLimits: {
    /** Mocked plan-limits gate ensuring workspace token budget. */
    ensureTokenBudget: jest.Mock;
    /** Mocked AI usage tracker for billing. */
    trackAiUsage: jest.Mock;
  };
  let walletService: {
    /** Mocked wallet pre-authorization charge handle. */
    chargeForUsage: jest.Mock;
    /** Mocked wallet settlement after successful AI call. */
    settleUsageCharge: jest.Mock;
    /** Mocked wallet refund used on failed AI calls. */
    refundUsageCharge: jest.Mock;
  };
  let service: AgentAssistService;

  beforeEach(() => {
    prisma = {
      conversation: {
        findFirst: jest.fn(),
      },
    };
    planLimits = {
      ensureTokenBudget: jest.fn().mockResolvedValue(undefined),
      trackAiUsage: jest.fn().mockResolvedValue(undefined),
    };
    walletService = {
      chargeForUsage: jest.fn().mockResolvedValue(undefined),
      settleUsageCharge: jest.fn().mockResolvedValue(undefined),
      refundUsageCharge: jest.fn().mockResolvedValue(undefined),
    };
    const configStub: Pick<ConfigService, 'get'> = {
      get: jest.fn().mockReturnValue(undefined),
    };
    service = new AgentAssistService(
      configStub as ConfigService,
      prisma as never as PrismaService,
      planLimits as never,
      walletService as never,
    );
    Object.defineProperty(service, 'openai', {
      value: {},
      writable: true,
    });
  });

  it('uses the conversation workspace id when it is a valid string', async () => {
    prisma.conversation.findFirst.mockResolvedValue({
      workspaceId: 'ws-1',
      messages: [{ direction: 'INBOUND', content: 'oi' }],
    });

    await service.summarizeConversation('conv-1', 'ws-1');

    expect(planLimits.ensureTokenBudget).toHaveBeenCalledWith('ws-1');
    expect(planLimits.trackAiUsage).toHaveBeenCalledWith('ws-1', 42);
  });

  it('skips budget tracking entirely when conversation is not found within workspace', async () => {
    prisma.conversation.findFirst.mockResolvedValue(undefined);

    await service.summarizeConversation('conv-1', 'ws-1');

    expect(planLimits.ensureTokenBudget).not.toHaveBeenCalled();
    expect(planLimits.trackAiUsage).not.toHaveBeenCalled();
  });
});
