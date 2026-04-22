import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { FlowsService } from './flows.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

describe('FlowsService', () => {
  let service: FlowsService;
  type AsyncMock<TResult = unknown> = jest.MockedFunction<(input?: unknown) => Promise<TResult>>;

  const mockPrisma: {
    flow: {
      upsert: AsyncMock;
      findFirst: AsyncMock;
      findMany: AsyncMock;
    };
    flowVersion: {
      create: AsyncMock;
      findMany: AsyncMock;
      findFirst: AsyncMock;
    };
    flowExecution: {
      findFirst: AsyncMock;
      findMany: AsyncMock;
      create: AsyncMock;
      findUnique: AsyncMock;
      update: AsyncMock;
    };
    contact: {
      findUnique: AsyncMock;
      create: AsyncMock;
    };
  } = {
    flow: {
      upsert: jest.fn() as AsyncMock,
      findFirst: jest.fn() as AsyncMock,
      findMany: jest.fn() as AsyncMock,
    },
    flowVersion: {
      create: jest.fn() as AsyncMock,
      findMany: jest.fn() as AsyncMock,
      findFirst: jest.fn() as AsyncMock,
    },
    flowExecution: {
      findFirst: jest.fn() as AsyncMock,
      findMany: jest.fn() as AsyncMock,
      create: jest.fn() as AsyncMock,
      findUnique: jest.fn() as AsyncMock,
      update: jest.fn() as AsyncMock,
    },
    contact: {
      findUnique: jest.fn() as AsyncMock,
      create: jest.fn() as AsyncMock,
    },
  };

  const mockAudit: {
    log: jest.Mock;
  } = {
    log: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FlowsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();

    service = module.get<FlowsService>(FlowsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('save() upserts flow and logs audit', async () => {
    mockPrisma.flow.upsert.mockResolvedValue({ id: 'flow-1' });

    const result = await service.save('ws-1', 'flow-1', {
      nodes: [{ id: 'n1' }],
      edges: [],
      name: 'Meu Flow',
    });

    expect(mockAudit.log).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: 'ws-1', action: 'UPDATE_FLOW' }),
    );
    expect(mockPrisma.flow.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'flow-1' } }),
    );
    expect(result).toEqual({ id: 'flow-1' });
  });

  it('get() retorna flow por workspace', async () => {
    mockPrisma.flow.findFirst.mockResolvedValue({ id: 'flow-1' });

    const result = await service.get('ws-1', 'flow-1');

    expect(mockPrisma.flow.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'flow-1', workspaceId: 'ws-1' } }),
    );
    expect(result).toEqual({ id: 'flow-1' });
  });

  it('list() lista flows ordenados', async () => {
    mockPrisma.flow.findMany.mockResolvedValue([{ id: 'flow-1' }]);

    const result = await service.list('ws-1');

    expect(mockPrisma.flow.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { workspaceId: 'ws-1' } }),
    );
    expect(result).toEqual([{ id: 'flow-1' }]);
  });

  it('saveVersion() garante flow e cria versão', async () => {
    mockPrisma.flow.upsert.mockResolvedValue({ id: 'flow-1' });
    mockPrisma.flowVersion.create.mockResolvedValue({
      id: 'ver-1',
      label: 'v1',
      createdAt: new Date(),
    });

    const result = await service.saveVersion({
      workspaceId: 'ws-1',
      flowId: 'flow-1',
      nodes: [{ id: 'n1' }],
      edges: [],
      label: 'v1',
      createdById: null,
    });

    expect(mockPrisma.flow.upsert).toHaveBeenCalled();
    expect(mockPrisma.flowVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ flowId: 'flow-1' }),
      }),
    );
    expect(result).toHaveProperty('id', 'ver-1');
  });
});
