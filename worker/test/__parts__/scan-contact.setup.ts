import type { Mock } from 'vitest';

type MockPrisma = Record<string, Record<string, Mock>>;

export function setMockContact(prisma: MockPrisma, value: Record<string, unknown> | null) {
  prisma.contact.findUnique.mockResolvedValue(value);
  prisma.contact.findFirst.mockResolvedValue(value);
}

export function setupDefaultMocks(
  prisma: MockPrisma,
  mockProcessWithUnifiedAgent: Mock,
  mockShouldUseUnifiedAgent: Mock,
  mockMapUnifiedActions: Mock,
  mockExtractTextResponse: Mock,
) {
  prisma.workspace.findUnique.mockResolvedValue({
    id: 'ws-1',
    providerSettings: {
      autopilot: { enabled: true },
      whatsappApiSession: {
        status: 'connected',
        phoneNumber: '5511000000000',
      },
    },
  });
  setMockContact(prisma, {
    id: 'contact-1',
    phone: '5511999999999',
    leadScore: 82,
    customFields: {},
    tags: [],
  });
  prisma.message.findFirst.mockResolvedValue(null);
  prisma.message.findMany.mockResolvedValue([
    { id: 'msg-1', content: 'Oi', createdAt: new Date('2026-03-19T10:00:00.000Z') },
    {
      id: 'msg-2',
      content: 'Quero saber mais sobre o serum',
      createdAt: new Date('2026-03-19T10:01:00.000Z'),
    },
  ]);
  prisma.product.findMany.mockResolvedValue([
    { name: 'Test Product', description: 'serum regenerador para pele' },
  ]);
  prisma.kloelMemory.findMany.mockResolvedValue([]);
  prisma.kloelMemory.findFirst.mockResolvedValue(null);
  prisma.kloelMemory.findUnique.mockResolvedValue(null);
  prisma.kloelMemory.upsert.mockResolvedValue({});
  prisma.kloelMemory.create.mockResolvedValue({});
  prisma.autopilotEvent.create.mockResolvedValue({});
  prisma.autonomyExecution.create.mockResolvedValue({ id: 'exec-1', status: 'PENDING' });
  prisma.autonomyExecution.findFirst.mockResolvedValue(null);
  prisma.autonomyExecution.update.mockResolvedValue({});
  prisma.auditLog.create.mockResolvedValue({});
  prisma.systemInsight.findFirst.mockResolvedValue(null);
  prisma.systemInsight.create.mockResolvedValue({});
  prisma.conversation.findFirst.mockResolvedValue(null);
  prisma.conversation.update.mockResolvedValue({});
  prisma.conversation.updateMany.mockResolvedValue({ count: 1 });
  prisma.conversation.count.mockResolvedValue(0);
  prisma.contact.update.mockResolvedValue({});
  prisma.contact.updateMany.mockResolvedValue({ count: 1 });

  mockShouldUseUnifiedAgent.mockReturnValue(false);
  mockProcessWithUnifiedAgent.mockResolvedValue({
    response:
      'Claro. O serum ajuda a regenerar a pele e posso te explicar aplicação, preço e próximos passos.',
    actions: [],
    model: 'gpt-5.4',
  });
  mockMapUnifiedActions.mockReturnValue({
    intent: 'BUYING',
    action: 'NONE',
    reason: 'unified_agent:no_tool_needed',
    confidence: 0.94,
    alreadyExecuted: false,
  });
  mockExtractTextResponse.mockReturnValue(
    'Claro. O serum ajuda a regenerar a pele e posso te explicar aplicação, preço e próximos passos.',
  );
}
