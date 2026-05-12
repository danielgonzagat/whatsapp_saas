import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { BrainEventSpineService } from './brain-event-spine.service';
import { MindConceptService } from './mind-concepts.service';

describe('MindConceptService', () => {
  type ConceptCreateCall = [{ data: { workspaceId: string } }];
  type CommercialEventCall = [
    { workspaceId: string; eventType: string; idempotencyKey: string },
  ];
  type RecentFindManyCall = [
    { where: { workspaceId: string; occurredAt: { gte: Date } } },
  ];

  let service: MindConceptService;
  let prisma: {
    mindConceptDetection: { create: jest.Mock; findMany: jest.Mock };
  };
  let events: { recordCommercial: jest.Mock };

  beforeEach(async () => {
    prisma = {
      mindConceptDetection: {
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve(data)),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    events = { recordCommercial: jest.fn().mockResolvedValue({}) };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MindConceptService,
        { provide: PrismaService, useValue: prisma },
        { provide: BrainEventSpineService, useValue: events },
      ],
    }).compile();
    service = module.get(MindConceptService);
  });

  it('detects price_objection from "caro/preco/desconto" keywords', async () => {
    const result = await service.detect({
      workspaceId: 'ws-1',
      subject: 'sub-1',
      text: 'achei muito caro, tem desconto?',
    });
    expect(result.length).toBeGreaterThan(0);
    const concepts = result.map((r) => (r as { concept: string }).concept);
    expect(concepts).toContain('price_objection');
  });

  it('detects hot_lead for purchase intent keywords', async () => {
    const result = await service.detect({
      workspaceId: 'ws-1',
      subject: 'sub',
      text: 'quero comprar agora, pago com pix',
    });
    const concepts = result.map((r) => (r as { concept: string }).concept);
    expect(concepts).toContain('hot_lead');
  });

  it('returns empty when no rule matches', async () => {
    const result = await service.detect({
      workspaceId: 'ws-1',
      subject: 'sub',
      text: 'oi, tudo bem com voce?',
    });
    expect(result).toHaveLength(0);
    expect(events.recordCommercial).not.toHaveBeenCalled();
  });

  it('persists with workspace scoping and emits brain event per detection', async () => {
    await service.detect({
      workspaceId: 'ws-tenant-A',
      subject: 'sub-99',
      text: 'preco caro demais',
    });
    const createCalls = prisma.mindConceptDetection.create.mock.calls as ConceptCreateCall[];
    expect(createCalls[0][0].data.workspaceId).toBe('ws-tenant-A');
    expect(events.recordCommercial).toHaveBeenCalled();
    const eventCalls = events.recordCommercial.mock.calls as CommercialEventCall[];
    const eventArg = eventCalls[0][0];
    expect(eventArg.workspaceId).toBe('ws-tenant-A');
    expect(eventArg.eventType).toBe('concept.detected');
    expect(typeof eventArg.idempotencyKey).toBe('string');
  });

  it('caps confidence at 0.95 even with many pattern matches', async () => {
    const result = await service.detect({
      workspaceId: 'ws-1',
      subject: 's',
      text: 'comprar fechar pix cartao',
    });
    const hot = result.find((r) => (r as { concept: string }).concept === 'hot_lead');
    expect((hot as { confidence: number }).confidence).toBeLessThanOrEqual(0.95);
  });

  it('recent applies workspace filter and time window of N hours', async () => {
    await service.recent('ws-1', 6);
    const findManyCalls = prisma.mindConceptDetection.findMany.mock.calls as RecentFindManyCall[];
    const arg = findManyCalls[0][0];
    expect(arg.where.workspaceId).toBe('ws-1');
    expect(arg.where.occurredAt.gte).toBeInstanceOf(Date);
  });
});
