import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { SmartRoutingService } from './smart-routing.service';

const REDIS_TOKEN = 'default_IORedisModuleConnectionToken';

describe('SmartRoutingService', () => {
  let service: SmartRoutingService;
  let prisma: {
    queue: { findFirst: jest.Mock };
    routingRule: { findMany: jest.Mock };
    agentQueue: { findMany: jest.Mock };
    conversation: { update: jest.Mock };
  };
  let redis: { get: jest.Mock; set: jest.Mock; expire: jest.Mock };

  beforeEach(async () => {
    prisma = {
      queue: { findFirst: jest.fn().mockResolvedValue(null) },
      routingRule: { findMany: jest.fn().mockResolvedValue([]) },
      agentQueue: { findMany: jest.fn().mockResolvedValue([]) },
      conversation: { update: jest.fn().mockResolvedValue({}) },
    };
    redis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      expire: jest.fn().mockResolvedValue(1),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SmartRoutingService,
        { provide: PrismaService, useValue: prisma },
        { provide: REDIS_TOKEN, useValue: redis },
      ],
    }).compile();
    service = module.get(SmartRoutingService);
  });

  it('returns null when no rules and no default queue exist', async () => {
    const result = await service.routeConversation('ws-1', 'conv-1');
    expect(result).toBeNull();
    expect(prisma.queue.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId: 'ws-1', name: 'General' },
      }),
    );
  });

  it('falls back to General queue when no rule matches', async () => {
    prisma.queue.findFirst.mockResolvedValue({ id: 'q-general' });
    await service.routeConversation('ws-1', 'conv-1');
    expect(prisma.conversation.update).toHaveBeenCalledWith({
      where: { id: 'conv-1' },
      data: { queueId: 'q-general', status: 'OPEN' },
    });
  });

  it('skips rule when channel does not match the conversation context', async () => {
    prisma.routingRule.findMany.mockResolvedValue([
      {
        id: 'r1',
        channel: 'whatsapp',
        keyword: null,
        queueId: 'q1',
        targetId: 'q1',
        actionType: 'ASSIGN_TO_QUEUE',
      },
    ]);
    prisma.queue.findFirst.mockResolvedValue(null);
    await service.routeConversation('ws-1', 'conv-1', { channel: 'email' });
    expect(prisma.conversation.update).not.toHaveBeenCalled();
  });

  it('routes by keyword (case-insensitive)', async () => {
    prisma.routingRule.findMany.mockResolvedValue([
      {
        id: 'r1',
        channel: null,
        keyword: 'refund',
        queueId: 'q1',
        targetId: 'q1',
        actionType: 'ASSIGN_TO_QUEUE',
      },
    ]);
    await service.routeConversation('ws-1', 'conv-1', {
      messageBody: 'I want a REFUND please',
    });
    expect(prisma.conversation.update).toHaveBeenCalledWith({
      where: { id: 'conv-1' },
      data: { queueId: 'q1', status: 'OPEN' },
    });
  });

  it('assigns to specific agent when rule actionType is ASSIGN_TO_AGENT', async () => {
    prisma.routingRule.findMany.mockResolvedValue([
      {
        id: 'r2',
        channel: null,
        keyword: null,
        targetId: 'agent-7',
        actionType: 'ASSIGN_TO_AGENT',
      },
    ]);
    await service.routeConversation('ws-1', 'conv-1', {});
    expect(prisma.conversation.update).toHaveBeenCalledWith({
      where: { id: 'conv-1' },
      data: { assignedAgentId: 'agent-7', status: 'OPEN', mode: 'HUMAN' },
    });
  });

  it('round-robin distributes via Redis last-index + TTL', async () => {
    redis.get.mockResolvedValue('0'); // last assigned index = 0; next = 1
    prisma.agentQueue.findMany.mockResolvedValue([
      { agent: { id: 'a0', email: 'a0@x.com' } },
      { agent: { id: 'a1', email: 'a1@x.com' } },
    ]);
    prisma.queue.findFirst.mockResolvedValue({ id: 'q-general' });
    await service.routeConversation('ws-1', 'conv-1');
    // first update queueId, then update assignedAgentId
    expect(prisma.conversation.update.mock.calls[1][0].data.assignedAgentId).toBe('a1');
    expect(redis.set).toHaveBeenCalledWith('queue:q-general:rr_index', 1);
    expect(redis.expire).toHaveBeenCalledWith('queue:q-general:rr_index', 86400);
  });
});
