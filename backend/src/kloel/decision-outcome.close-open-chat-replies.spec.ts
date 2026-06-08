import { Test, TestingModule } from '@nestjs/testing';
import { DecisionOutcomeService } from './decision-outcome.service';
import { PrismaService } from '../prisma/prisma.service';
import { MindBanditService } from './mind/policy/mind-bandit.service';
/**
 * Tests for the WON-on-continuation closer added for KLOEL_REAL_REWARD_SIGNAL:
 * DecisionOutcomeService.closeOpenChatReplies closes still-OPEN `chat_reply`
 * decisions as a real WIN and feeds the win to the bandit, symmetric with the
 * sweepExpired LOSS path.
 */
describe('DecisionOutcomeService.closeOpenChatReplies', () => {
  let service: DecisionOutcomeService;
  let prisma: {
    decisionOutcome: {
      findMany: jest.Mock;
      updateMany: jest.Mock;
      create: jest.Mock;
      findFirst: jest.Mock;
    };
  };
  let bandit: { recordOutcome: jest.Mock; register: jest.Mock };

  beforeEach(async () => {
    prisma = {
      decisionOutcome: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn().mockResolvedValue({ id: 'do-1' }),
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    bandit = {
      recordOutcome: jest.fn().mockResolvedValue(undefined),
      register: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DecisionOutcomeService,
        { provide: PrismaService, useValue: prisma },
        { provide: MindBanditService, useValue: bandit },
      ],
    }).compile();

    service = module.get(DecisionOutcomeService);
  });

  afterEach(() => jest.clearAllMocks());

  it('returns 0 and writes nothing when there is no open chat_reply', async () => {
    prisma.decisionOutcome.findMany.mockResolvedValueOnce([]);

    const closed = await service.closeOpenChatReplies('ws-1', {
      outcomeName: 'chat.continued',
      wonVsBaseline: true,
    });

    expect(closed).toBe(0);
    expect(prisma.decisionOutcome.updateMany).not.toHaveBeenCalled();
    expect(bandit.recordOutcome).not.toHaveBeenCalled();
  });

  it('queries ONLY open chat_reply rows for the workspace', async () => {
    await service.closeOpenChatReplies('ws-1', {
      outcomeName: 'chat.continued',
      wonVsBaseline: true,
    });

    expect(prisma.decisionOutcome.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId: 'ws-1', decisionType: 'chat_reply', outcomeAt: null },
      }),
    );
  });

  it('closes open chat_reply rows as a WIN and feeds the bandit outcome=1', async () => {
    prisma.decisionOutcome.findMany.mockResolvedValueOnce([
      {
        id: 'd1',
        outcomeKey: 'chat:ws-1:1:aaaaaa',
        decisionType: 'chat_reply',
        chosenAction: 'engage',
      },
      {
        id: 'd2',
        outcomeKey: 'chat:ws-1:2:bbbbbb',
        decisionType: 'chat_reply',
        chosenAction: 'engage',
      },
    ]);

    const closed = await service.closeOpenChatReplies('ws-1', {
      outcomeName: 'chat.continued',
      wonVsBaseline: true,
    });

    expect(closed).toBe(2);

    // updateMany stamps the WIN onto exactly the open rows.
    expect(prisma.decisionOutcome.updateMany).toHaveBeenCalledTimes(1);
    const updateCalls = prisma.decisionOutcome.updateMany.mock.calls as Array<
      [
        {
          where: { id: { in: string[] }; workspaceId: string };
          data: { outcomeName: string; wonVsBaseline: boolean };
        },
      ]
    >;
    const updateArg = updateCalls[0]?.[0];
    expect(updateArg?.where.id.in).toEqual(['d1', 'd2']);
    expect(updateArg?.where.workspaceId).toBe('ws-1');
    expect(updateArg?.data.outcomeName).toBe('chat.continued');
    expect(updateArg?.data.wonVsBaseline).toBe(true);

    // Symmetric bandit feed: outcome=1 (WIN) per closed row.
    expect(bandit.recordOutcome).toHaveBeenCalledTimes(2);
    const banditCalls = bandit.recordOutcome.mock.calls as Array<
      [{ workspaceId: string; decisionType: string; arm: string; outcome: number }]
    >;
    for (const call of banditCalls) {
      expect(call[0]).toEqual(
        expect.objectContaining({
          workspaceId: 'ws-1',
          decisionType: 'chat_reply',
          arm: 'engage',
          outcome: 1,
        }),
      );
    }
  });

  it('feeds outcome=0 to the bandit when wonVsBaseline is false (LOSS polarity)', async () => {
    prisma.decisionOutcome.findMany.mockResolvedValueOnce([
      {
        id: 'd1',
        outcomeKey: 'chat:ws-1:1:aaaaaa',
        decisionType: 'chat_reply',
        chosenAction: 'engage',
      },
    ]);

    await service.closeOpenChatReplies('ws-1', {
      outcomeName: 'chat.abandoned',
      wonVsBaseline: false,
    });

    expect(bandit.recordOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ arm: 'engage', outcome: 0 }),
    );
  });

  it('is fail-open per row: a bandit error does not throw and still returns the count', async () => {
    prisma.decisionOutcome.findMany.mockResolvedValueOnce([
      {
        id: 'd1',
        outcomeKey: 'chat:ws-1:1:aaaaaa',
        decisionType: 'chat_reply',
        chosenAction: 'engage',
      },
    ]);
    bandit.recordOutcome.mockRejectedValueOnce(new Error('bandit down'));

    await expect(
      service.closeOpenChatReplies('ws-1', { outcomeName: 'chat.continued', wonVsBaseline: true }),
    ).resolves.toBe(1);

    // The row was still stamped closed even though the bandit feed failed.
    expect(prisma.decisionOutcome.updateMany).toHaveBeenCalledTimes(1);
  });
});
