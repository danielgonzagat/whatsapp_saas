import { Test, TestingModule } from '@nestjs/testing';
import { FlowsService } from './flows.service';
import { PrismaService } from '../prisma/prisma.service';
import { getQueueToken } from '@nestjs/bullmq';

describe('FlowsService', () => {
  let service: FlowsService;

  const mockPrisma = {
    flow: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    flowExecution: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    flowVersion: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
  };

  const mockQueue = {
    add: jest.fn().mockResolvedValue({ id: 'job-1' }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FlowsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: getQueueToken('flow-engine'), useValue: mockQueue },
      ],
    }).compile();

    service = module.get<FlowsService>(FlowsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a new flow', async () => {
      const flowData = {
        name: 'Test Flow',
        workspaceId: 'ws-1',
        nodes: [{ id: 'start', type: 'start', data: {} }],
        edges: [],
      };

      mockPrisma.flow.create.mockResolvedValue({
        id: 'flow-1',
        ...flowData,
        status: 'draft',
        version: 1,
      });

      const result = await service.create(flowData);

      expect(result.id).toBe('flow-1');
      expect(result.status).toBe('draft');
      expect(mockPrisma.flow.create).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('should return flow by id', async () => {
      mockPrisma.flow.findUnique.mockResolvedValue({
        id: 'flow-1',
        name: 'Test Flow',
        workspaceId: 'ws-1',
      });

      const result = await service.findOne('flow-1', 'ws-1');

      expect(result.id).toBe('flow-1');
      expect(mockPrisma.flow.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'flow-1', workspaceId: 'ws-1' },
        }),
      );
    });

    it('should return null for non-existent flow', async () => {
      mockPrisma.flow.findUnique.mockResolvedValue(null);

      const result = await service.findOne('non-existent', 'ws-1');
      expect(result).toBeNull();
    });
  });

  describe('findAll', () => {
    it('should return all flows for workspace', async () => {
      mockPrisma.flow.findMany.mockResolvedValue([
        { id: 'flow-1', name: 'Flow 1', workspaceId: 'ws-1' },
        { id: 'flow-2', name: 'Flow 2', workspaceId: 'ws-1' },
      ]);

      const result = await service.findAll('ws-1');

      expect(result).toHaveLength(2);
      expect(mockPrisma.flow.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workspaceId: 'ws-1' },
        }),
      );
    });

    it('should filter by status', async () => {
      mockPrisma.flow.findMany.mockResolvedValue([
        { id: 'flow-1', name: 'Flow 1', status: 'active' },
      ]);

      const result = await service.findAll('ws-1', { status: 'active' });

      expect(mockPrisma.flow.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workspaceId: 'ws-1', status: 'active' },
        }),
      );
    });
  });

  describe('update', () => {
    it('should update flow', async () => {
      mockPrisma.flow.update.mockResolvedValue({
        id: 'flow-1',
        name: 'Updated Flow',
        version: 2,
      });

      const result = await service.update('flow-1', 'ws-1', {
        name: 'Updated Flow',
      });

      expect(result.name).toBe('Updated Flow');
      expect(mockPrisma.flow.update).toHaveBeenCalled();
    });

    it('should create version on significant update', async () => {
      mockPrisma.flow.findUnique.mockResolvedValue({
        id: 'flow-1',
        nodes: [{ id: 'old' }],
        version: 1,
      });
      mockPrisma.flow.update.mockResolvedValue({
        id: 'flow-1',
        nodes: [{ id: 'new' }],
        version: 2,
      });
      mockPrisma.flowVersion.create.mockResolvedValue({});

      await service.update('flow-1', 'ws-1', {
        nodes: [{ id: 'new' }],
      });

      expect(mockPrisma.flowVersion.create).toHaveBeenCalled();
    });
  });

  describe('activate', () => {
    it('should activate flow', async () => {
      mockPrisma.flow.update.mockResolvedValue({
        id: 'flow-1',
        status: 'active',
      });

      const result = await service.activate('flow-1', 'ws-1');

      expect(result.status).toBe('active');
    });

    it('should fail for invalid flow', async () => {
      mockPrisma.flow.update.mockRejectedValue(new Error('Not found'));

      await expect(service.activate('non-existent', 'ws-1'))
        .rejects.toThrow();
    });
  });

  describe('deactivate', () => {
    it('should deactivate flow', async () => {
      mockPrisma.flow.update.mockResolvedValue({
        id: 'flow-1',
        status: 'inactive',
      });

      const result = await service.deactivate('flow-1', 'ws-1');

      expect(result.status).toBe('inactive');
    });
  });

  describe('delete', () => {
    it('should soft delete flow', async () => {
      mockPrisma.flow.update.mockResolvedValue({
        id: 'flow-1',
        deletedAt: new Date(),
      });

      await service.delete('flow-1', 'ws-1');

      expect(mockPrisma.flow.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            deletedAt: expect.any(Date),
          }),
        }),
      );
    });
  });

  describe('execute', () => {
    it('should create execution and add to queue', async () => {
      mockPrisma.flow.findUnique.mockResolvedValue({
        id: 'flow-1',
        nodes: [{ id: 'start', type: 'start' }],
        status: 'active',
      });
      mockPrisma.flowExecution.create.mockResolvedValue({
        id: 'exec-1',
        flowId: 'flow-1',
        status: 'running',
      });

      const result = await service.execute('flow-1', 'ws-1', {
        contactId: 'contact-1',
        trigger: 'manual',
      });

      expect(result.id).toBe('exec-1');
      expect(mockQueue.add).toHaveBeenCalledWith(
        'execute',
        expect.objectContaining({
          executionId: 'exec-1',
          flowId: 'flow-1',
        }),
      );
    });

    it('should fail for inactive flow', async () => {
      mockPrisma.flow.findUnique.mockResolvedValue({
        id: 'flow-1',
        status: 'draft',
      });

      await expect(service.execute('flow-1', 'ws-1', {}))
        .rejects.toThrow('Flow não está ativo');
    });
  });

  describe('getExecutionStats', () => {
    it('should return execution statistics', async () => {
      mockPrisma.flowExecution.count
        .mockResolvedValueOnce(100) // total
        .mockResolvedValueOnce(80)  // completed
        .mockResolvedValueOnce(10)  // running
        .mockResolvedValueOnce(10); // failed

      const result = await service.getExecutionStats('flow-1', 'ws-1');

      expect(result).toEqual({
        total: 100,
        completed: 80,
        running: 10,
        failed: 10,
        successRate: 80,
      });
    });
  });

  describe('Versioning', () => {
    it('should list flow versions', async () => {
      mockPrisma.flowVersion.findMany.mockResolvedValue([
        { id: 'v-1', version: 1, createdAt: new Date() },
        { id: 'v-2', version: 2, createdAt: new Date() },
      ]);

      const result = await service.getVersions('flow-1', 'ws-1');

      expect(result).toHaveLength(2);
    });

    it('should restore to previous version', async () => {
      mockPrisma.flowVersion.findMany.mockResolvedValue([
        { id: 'v-1', version: 1, nodes: [{ id: 'old' }] },
      ]);
      mockPrisma.flow.update.mockResolvedValue({
        id: 'flow-1',
        nodes: [{ id: 'old' }],
        version: 3,
      });

      const result = await service.restoreVersion('flow-1', 'ws-1', 1);

      expect(result.nodes).toEqual([{ id: 'old' }]);
    });
  });
});
