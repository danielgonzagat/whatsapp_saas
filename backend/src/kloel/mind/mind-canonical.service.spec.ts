import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { MindMessageService } from './aliases/mind-message.service';
import { MindMemoryItemService } from './aliases/mind-memory-item.service';
import { MindCanonicalService } from './mind-canonical.service';

/**
 * Wave5 L8 — `MindCanonicalService` is the Phase-1 canonical facade for the
 * Mind data layer. It MUST delegate each method to the correct underlying
 * surface (alias service or Prisma model) without mutating the schema. This
 * spec mocks Prisma at the delegate level and asserts every facade method
 * forwards the exact arguments and returns the underlying row.
 */
describe('MindCanonicalService — Phase-1 facade delegation', () => {
  let facade: MindCanonicalService;
  let prisma: {
    kloelMessage: { findMany: jest.Mock; create: jest.Mock };
    kloelMemory: { findUnique: jest.Mock; upsert: jest.Mock };
    mindCase: { create: jest.Mock };
    mindPolicy: { create: jest.Mock };
    mindGraphNode: { upsert: jest.Mock };
  };

  const ws = 'ws-l8';
  const now = new Date('2026-05-29T00:00:00.000Z');

  const messageRow = { id: 'm1', role: 'user', content: 'oi', createdAt: now };
  const memoryRow = { id: 'mem1', workspaceId: ws, key: 'k', value: { a: 1 } };
  const caseRow = { id: 'c1' };
  const policyRow = { id: 'p1' };
  const nodeRow = { id: 'n1' };

  beforeEach(async () => {
    prisma = {
      kloelMessage: {
        findMany: jest.fn().mockResolvedValue([messageRow]),
        create: jest.fn().mockResolvedValue(messageRow),
      },
      kloelMemory: {
        findUnique: jest.fn().mockResolvedValue(memoryRow),
        upsert: jest.fn().mockResolvedValue(memoryRow),
      },
      mindCase: { create: jest.fn().mockResolvedValue(caseRow) },
      mindPolicy: { create: jest.fn().mockResolvedValue(policyRow) },
      mindGraphNode: { upsert: jest.fn().mockResolvedValue(nodeRow) },
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        MindCanonicalService,
        MindMessageService,
        MindMemoryItemService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    facade = moduleRef.get(MindCanonicalService);
  });

  it('getConversationHistory delegates to MindMessageService.getHistory (kloelMessage.findMany)', async () => {
    const history = await facade.getConversationHistory(ws, 25);
    expect(history).toEqual([
      { id: messageRow.id, role: messageRow.role, content: messageRow.content, timestamp: now },
    ]);
    expect(prisma.kloelMessage.findMany).toHaveBeenCalledWith({
      where: { workspaceId: ws },
      orderBy: { createdAt: 'asc' },
      take: 25,
      select: { id: true, role: true, content: true, createdAt: true },
    });
  });

  it('appendMessage delegates to MindMessageService.appendToConversation (kloelMessage.create)', async () => {
    await facade.appendMessage(ws, 'assistant', 'olá');
    expect(prisma.kloelMessage.create).toHaveBeenCalledWith({
      data: { workspaceId: ws, role: 'assistant', content: 'olá' },
    });
  });

  it('getMemoryItem delegates to MindMemoryItemService.findByKey (kloelMemory.findUnique)', async () => {
    const item = await facade.getMemoryItem(ws, 'k');
    expect(item).toEqual(memoryRow);
    expect(prisma.kloelMemory.findUnique).toHaveBeenCalledWith({
      where: { workspaceId_key: { workspaceId: ws, key: 'k' } },
    });
  });

  it('upsertMemory delegates to MindMemoryItemService.upsert (kloelMemory.upsert)', async () => {
    await facade.upsertMemory(ws, 'k', { value: { a: 1 }, category: 'agent' });
    expect(prisma.kloelMemory.upsert).toHaveBeenCalledWith({
      where: { workspaceId_key: { workspaceId: ws, key: 'k' } },
      create: {
        workspaceId: ws,
        key: 'k',
        value: { a: 1 },
        category: 'agent',
        type: undefined,
        content: undefined,
      },
      update: { value: { a: 1 }, category: 'agent', type: undefined, content: undefined },
    });
  });

  it('recordCase writes a workspace-scoped row into mindCase with a generated id', async () => {
    const res = await facade.recordCase({
      workspaceId: ws,
      subject: 's',
      caseType: 'chat',
      text: 't',
      tokens: ['t'],
      features: { f: 1 },
      action: 'reply',
      occurredAt: now,
      outcome: 0.5,
    });
    expect(res).toEqual(caseRow);
    expect(prisma.mindCase.create).toHaveBeenCalledTimes(1);
    const arg = prisma.mindCase.create.mock.calls[0][0];
    expect(arg.data).toMatchObject({
      workspaceId: ws,
      subject: 's',
      caseType: 'chat',
      text: 't',
      tokens: ['t'],
      features: { f: 1 },
      action: 'reply',
      outcome: 0.5,
      occurredAt: now,
    });
    expect(typeof arg.data.id).toBe('string');
    expect(arg.data.id.length).toBeGreaterThan(0);
  });

  it('recordPolicy writes a workspace-scoped row into mindPolicy with a generated id', async () => {
    const res = await facade.recordPolicy({
      workspaceId: ws,
      subject: 's',
      decisionType: 'reply',
      context: { c: 1 },
      candidates: { x: 1 },
      chosen: 'a',
      baseline: 'b',
      calcSteps: { step: 1 },
      epsilon: 0.1,
      utilitySuccess: 1,
      utilityFail: 0,
      fallbackActive: false,
    });
    expect(res).toEqual(policyRow);
    const arg = prisma.mindPolicy.create.mock.calls[0][0];
    expect(arg.data).toMatchObject({
      workspaceId: ws,
      subject: 's',
      decisionType: 'reply',
      chosen: 'a',
      baseline: 'b',
      epsilon: 0.1,
      utilitySuccess: 1,
      utilityFail: 0,
      fallbackActive: false,
      reasonInternal: null,
      outcome: null,
    });
    expect(typeof arg.data.id).toBe('string');
  });

  it('addGraphNode upserts on the (workspaceId, kind, label) unique key', async () => {
    const res = await facade.addGraphNode({
      workspaceId: ws,
      kind: 'concept',
      label: 'pricing',
      weight: 2,
      metadata: { src: 'chat' },
    });
    expect(res).toEqual(nodeRow);
    const arg = prisma.mindGraphNode.upsert.mock.calls[0][0];
    expect(arg.where).toEqual({
      workspaceId_kind_label: { workspaceId: ws, kind: 'concept', label: 'pricing' },
    });
    expect(arg.create).toMatchObject({
      workspaceId: ws,
      kind: 'concept',
      label: 'pricing',
      weight: 2,
      metadata: { src: 'chat' },
    });
    expect(arg.update).toEqual({ weight: 2, metadata: { src: 'chat' } });
    expect(typeof arg.create.id).toBe('string');
  });

  it('addGraphNode defaults weight to 1 and metadata to {} when omitted', async () => {
    await facade.addGraphNode({ workspaceId: ws, kind: 'k', label: 'l' });
    const arg = prisma.mindGraphNode.upsert.mock.calls[0][0];
    expect(arg.create).toMatchObject({ weight: 1, metadata: {} });
    expect(arg.update).toEqual({ weight: 1, metadata: {} });
  });
});
