import { buildMindSignals } from './build-mind-signals.helper';
import { mockLogger, mockPrisma } from './build-mind-signals.helper.fixtures';
import type { AgentAssistService } from './knowledge/agent-assist.service';

describe('buildMindSignals — agent-assist suggestions (PI-K18-A)', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  const stubbedSuggestions = [
    { action: 'send_payment_link', reason: 'payment_intent_detected', confidence: 0.82 },
    { action: 'send_welcome_message', reason: 'greeting_opener', confidence: 0.9 },
  ];

  it('attaches agentAssist when agentAssistService is present and returns results', async () => {
    const suggestActions = jest.fn().mockResolvedValue(stubbedSuggestions);
    const result = await buildMindSignals(
      {
        prisma: mockPrisma(),
        agentAssistService: { suggestActions } as unknown as AgentAssistService,
        logger: mockLogger,
      },
      'ws-1',
      'quanto custa o plano e oi',
    );
    expect(suggestActions).toHaveBeenCalledWith('ws-1', 'quanto custa o plano e oi', {
      concepts: undefined,
      priorCases: undefined,
    });
    expect(result.agentAssist).toEqual(stubbedSuggestions);
  });

  it('omits agentAssist key when agentAssistService is absent', async () => {
    const result = await buildMindSignals(
      { prisma: mockPrisma(), logger: mockLogger },
      'ws-1',
      'oi tudo bem?',
    );
    expect(result.agentAssist).toBeUndefined();
  });

  it('logs warn and omits key when suggestActions throws', async () => {
    const suggestActions = jest.fn().mockRejectedValue(new Error('agent-assist unavailable'));
    const result = await buildMindSignals(
      {
        prisma: mockPrisma(),
        agentAssistService: { suggestActions } as unknown as AgentAssistService,
        logger: mockLogger,
      },
      'ws-1',
      'quero comprar',
    );
    expect(mockLogger.warn).toHaveBeenCalledWith(
      'kloel_agent_assist_skipped',
      expect.objectContaining({ reason: 'agent-assist unavailable' }),
    );
    expect(result.agentAssist).toBeUndefined();
  });

  it('omits agentAssist key when suggestActions returns empty array', async () => {
    const suggestActions = jest.fn().mockResolvedValue([]);
    const result = await buildMindSignals(
      {
        prisma: mockPrisma(),
        agentAssistService: { suggestActions } as unknown as AgentAssistService,
        logger: mockLogger,
      },
      'ws-1',
      'blah',
    );
    expect(result.agentAssist).toBeUndefined();
  });
});
