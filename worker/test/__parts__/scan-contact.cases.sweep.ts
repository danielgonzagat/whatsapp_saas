import { it, expect, vi } from 'vitest';
import type { Mock } from 'vitest';
import type * as QueueModule from '../../queue';
import type * as RedisClientModule from '../../redis-client';
import { runSweepUnreadConversations } from '../../processors/autopilot-processor';

type MockPrisma = Record<string, Record<string, Mock>>;

export function addSweepTests(
  mockPrisma: MockPrisma,
  queueModuleArg: typeof QueueModule,
  redisClientArg: typeof RedisClientModule,
) {
  const queueModule = { autopilotQueue: { add: vi.mocked(queueModuleArg.autopilotQueue.add) } };
  const redisClient = { redisPub: { publish: vi.mocked(redisClientArg.redisPub.publish) } };
  it('queues unread conversations for backlog sweep even when the last stored message is outbound', async () => {
    mockPrisma.conversation.findMany.mockResolvedValue([
      {
        id: 'conv-2',
        contactId: 'contact-2',
        status: 'OPEN',
        mode: 'AI',
        assignedAgentId: null,
        unreadCount: 1,
        lastMessageAt: new Date('2026-03-19T10:02:00.000Z'),
        messages: [
          {
            direction: 'INBOUND',
            createdAt: new Date('2026-03-19T10:02:00.000Z'),
          },
        ],
        contact: {
          id: 'contact-2',
          name: 'Marcos',
          phone: '5511888888888',
        },
      },
      {
        id: 'conv-1',
        contactId: 'contact-1',
        status: 'OPEN',
        mode: 'AI',
        assignedAgentId: null,
        unreadCount: 3,
        lastMessageAt: new Date('2026-03-19T10:01:00.000Z'),
        messages: [
          {
            direction: 'INBOUND',
            createdAt: new Date('2026-03-19T10:01:00.000Z'),
          },
        ],
        contact: {
          id: 'contact-1',
          name: 'Luiz',
          phone: '5511999999999',
        },
      },
      {
        id: 'conv-outbound',
        contactId: 'contact-3',
        status: 'OPEN',
        mode: 'AI',
        assignedAgentId: null,
        unreadCount: 8,
        lastMessageAt: new Date('2026-03-19T10:03:00.000Z'),
        messages: [
          {
            direction: 'OUTBOUND',
            createdAt: new Date('2026-03-19T10:03:00.000Z'),
          },
        ],
        contact: {
          id: 'contact-3',
          name: 'Ainda Pendente',
          phone: '5511777777777',
        },
      },
      {
        id: 'conv-human-owner',
        contactId: 'contact-4',
        status: 'OPEN',
        mode: 'AI',
        assignedAgentId: 'operator-9',
        unreadCount: 6,
        lastMessageAt: new Date('2026-03-19T10:04:00.000Z'),
        messages: [
          {
            direction: 'INBOUND',
            createdAt: new Date('2026-03-19T10:04:00.000Z'),
          },
        ],
        contact: {
          id: 'contact-4',
          name: 'Com Humano',
          phone: '5511666666666',
        },
      },
    ]);

    await runSweepUnreadConversations({
      workspaceId: 'ws-1',
      runId: 'run-123',
      mode: 'reply_all_recent_first',
      limit: 10,
    });

    expect(mockPrisma.conversation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: 'ws-1',
          status: { not: 'CLOSED' },
        }),
        orderBy: [{ lastMessageAt: 'desc' }],
        take: 50,
      }),
    );
    expect(queueModule.autopilotQueue.add).toHaveBeenNthCalledWith(
      1,
      'scan-contact',
      expect.objectContaining({
        workspaceId: 'ws-1',
        runId: 'run-123',
        deliveryMode: 'reactive',
        contactId: 'contact-3',
        contactName: 'Ainda Pendente',
        backlogIndex: 1,
        backlogTotal: 3,
      }),
      expect.objectContaining({
        jobId: 'scan-contact__ws-1__contact-3__run__run-123',
      }),
    );
    expect(queueModule.autopilotQueue.add).toHaveBeenNthCalledWith(
      2,
      'scan-contact',
      expect.objectContaining({
        workspaceId: 'ws-1',
        runId: 'run-123',
        deliveryMode: 'reactive',
        contactId: 'contact-2',
        contactName: 'Marcos',
        backlogIndex: 2,
        backlogTotal: 3,
      }),
      expect.objectContaining({
        jobId: 'scan-contact__ws-1__contact-2__run__run-123',
      }),
    );
    expect(queueModule.autopilotQueue.add).toHaveBeenNthCalledWith(
      3,
      'scan-contact',
      expect.objectContaining({
        workspaceId: 'ws-1',
        runId: 'run-123',
        deliveryMode: 'reactive',
        contactId: 'contact-1',
        contactName: 'Luiz',
        backlogIndex: 3,
        backlogTotal: 3,
      }),
      expect.objectContaining({
        jobId: 'scan-contact__ws-1__contact-1__run__run-123',
      }),
    );
    expect(redisClient.redisPub.publish).toHaveBeenCalledWith(
      'ws:agent',
      expect.stringContaining('"phase":"queue_start"'),
    );
  });

  it('filters the workspace own phone out of the backlog queue', async () => {
    mockPrisma.workspace.findUnique.mockResolvedValue({
      id: 'ws-1',
      providerSettings: {
        whatsappApiSession: {
          status: 'connected',
          phoneNumber: '5511777777777',
        },
      },
    });
    mockPrisma.conversation.findMany.mockResolvedValue([
      {
        id: 'conv-self',
        contactId: 'contact-self',
        status: 'OPEN',
        mode: 'AI',
        assignedAgentId: null,
        unreadCount: 7,
        lastMessageAt: new Date('2026-03-19T10:05:00.000Z'),
        messages: [
          {
            direction: 'INBOUND',
            createdAt: new Date('2026-03-19T10:05:00.000Z'),
          },
        ],
        contact: {
          id: 'contact-self',
          name: 'Eu Mesmo',
          phone: '5511777777777',
          customFields: {},
        },
      },
      {
        id: 'conv-customer',
        contactId: 'contact-customer',
        status: 'OPEN',
        mode: 'AI',
        assignedAgentId: null,
        unreadCount: 2,
        lastMessageAt: new Date('2026-03-19T10:04:00.000Z'),
        messages: [
          {
            direction: 'INBOUND',
            createdAt: new Date('2026-03-19T10:04:00.000Z'),
          },
        ],
        contact: {
          id: 'contact-customer',
          name: 'Cliente',
          phone: '5511666666666',
          customFields: {},
        },
      },
    ]);

    await runSweepUnreadConversations({
      workspaceId: 'ws-1',
      runId: 'run-self-filter',
      mode: 'reply_all_recent_first',
      limit: 10,
    });

    expect(queueModule.autopilotQueue.add).toHaveBeenCalledTimes(1);
    expect(queueModule.autopilotQueue.add).toHaveBeenCalledWith(
      'scan-contact',
      expect.objectContaining({
        contactId: 'contact-customer',
        phone: '5511666666666',
      }),
      expect.anything(),
    );
  });
}
