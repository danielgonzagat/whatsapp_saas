import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { CreateFlowDto } from './dto/flow.dto';
import { SaveFlowVersionDto } from './dto/save-flow-version.dto';
import { FlowsService } from './flows.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { createPartialPrismaMock } from '../../test/helpers/prisma.mock';

describe('FlowsService', () => {
  let service: FlowsService;
  let mockPrisma: ReturnType<typeof createPartialPrismaMock>;

  const mockAudit: {
    log: jest.Mock;
  } = {
    log: jest.fn(),
  };

  beforeEach(async () => {
    mockPrisma = createPartialPrismaMock({
      flow: ['upsert', 'findFirst', 'findMany'],
      flowVersion: ['create', 'findMany', 'findFirst'],
      flowExecution: ['findFirst', 'findMany', 'create', 'findUnique', 'update'],
      contact: ['findUnique', 'create'],
    });
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

  it('preserves React Flow nodes and edges through the app validation pipe', async () => {
    const pipe = new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      transformOptions: { enableImplicitConversion: true },
    });
    const payload = {
      name: 'Flow Codex Audit',
      nodes: [{ id: 'n1', type: 'start', position: { x: 1, y: 2 }, data: { label: 'Start' } }],
      edges: [{ id: 'e1', source: 'n1', target: 'n2', type: 'smoothstep' }],
    };

    const createDto = (await pipe.transform(payload, {
      type: 'body',
      metatype: CreateFlowDto,
    })) as CreateFlowDto;
    const versionDto = (await pipe.transform(
      { nodes: payload.nodes, edges: payload.edges, label: 'v1' },
      { type: 'body', metatype: SaveFlowVersionDto },
    )) as SaveFlowVersionDto;

    expect(createDto.nodes).toEqual(payload.nodes);
    expect(createDto.edges).toEqual(payload.edges);
    expect(versionDto.nodes).toEqual(payload.nodes);
    expect(versionDto.edges).toEqual(payload.edges);
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
      expect.objectContaining({ where: { id: 'flow-1', workspaceId: 'ws-1' } }),
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

  describe('sweepExpiredWaitTimeouts (cron)', () => {
    it('delegates to expireWaitTimeouts across all workspaces', async () => {
      const spy = jest.spyOn(service, 'expireWaitTimeouts').mockResolvedValue([
        {
          resumed: true,
          executionId: 'exec-1',
          flowId: 'flow-1',
          workspaceId: 'ws-1',
          resumeEdge: 'Timeout',
        },
      ]);

      await service.sweepExpiredWaitTimeouts();

      // No workspace filter — the cron sweeps every tenant.
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith();
    });

    it('swallows errors so the scheduler keeps firing', async () => {
      jest.spyOn(service, 'expireWaitTimeouts').mockRejectedValue(new Error('db down'));

      await expect(service.sweepExpiredWaitTimeouts()).resolves.toBeUndefined();
    });
  });
});
