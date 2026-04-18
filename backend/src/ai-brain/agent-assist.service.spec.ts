jest.mock('../kloel/openai-wrapper', () => ({
  chatCompletionWithRetry: jest.fn().mockResolvedValue({
    usage: { total_tokens: 42 },
    choices: [{ message: { content: 'Resumo pronto' } }],
  }),
}));

import { ConfigService } from '@nestjs/config';
import { AgentAssistService } from './agent-assist.service';

describe('AgentAssistService', () => {
  let prisma: any;
  let planLimits: any;
  let service: AgentAssistService;

  beforeEach(() => {
    prisma = {
      conversation: {
        findUnique: jest.fn(),
      },
    };
    planLimits = {
      ensureTokenBudget: jest.fn().mockResolvedValue(undefined),
      trackAiUsage: jest.fn().mockResolvedValue(undefined),
    };
    service = new AgentAssistService(
      { get: jest.fn().mockReturnValue(undefined) } as unknown as ConfigService,
      prisma,
      planLimits,
    );
    (service as any).openai = {};
  });

  it('uses the conversation workspace id when it is a valid string', async () => {
    prisma.conversation.findUnique.mockResolvedValue({
      workspaceId: 'ws-1',
      messages: [{ direction: 'INBOUND', content: 'oi' }],
    });

    await service.summarizeConversation('conv-1');

    expect(planLimits.ensureTokenBudget).toHaveBeenCalledWith('ws-1');
    expect(planLimits.trackAiUsage).toHaveBeenCalledWith('ws-1', 42);
  });

  it('ignores malformed conversation workspace ids in budget tracking', async () => {
    prisma.conversation.findUnique.mockResolvedValue({
      workspaceId: { broken: true },
      messages: [{ direction: 'INBOUND', content: 'oi' }],
    });

    await service.summarizeConversation('conv-1');

    expect(planLimits.ensureTokenBudget).not.toHaveBeenCalled();
    expect(planLimits.trackAiUsage).not.toHaveBeenCalled();
  });
});
