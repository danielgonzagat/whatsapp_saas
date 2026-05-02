import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { MarketplaceService } from './marketplace.service';

describe('MarketplaceService', () => {
  let service: MarketplaceService;
  let prisma: {
    flowTemplate: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    flow: {
      create: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      flowTemplate: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      flow: {
        create: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [MarketplaceService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<MarketplaceService>(MarketplaceService);
  });

  describe('listTemplates', () => {
    it('returns public templates ordered by downloads desc, limited to 100', async () => {
      const templates = [
        { id: 't1', name: 'Popular', downloads: 50 },
        { id: 't2', name: 'New', downloads: 5 },
      ];
      prisma.flowTemplate.findMany.mockResolvedValue(templates);

      const result = await service.listTemplates();

      expect(result).toEqual(templates);
      expect(prisma.flowTemplate.findMany).toHaveBeenCalledWith({
        where: { isPublic: true },
        select: {
          id: true,
          name: true,
          description: true,
          category: true,
          downloads: true,
          isPublic: true,
          nodes: true,
          edges: true,
          createdAt: true,
        },
        orderBy: { downloads: 'desc' },
        take: 100,
      });
    });

    it('filters by category when provided', async () => {
      prisma.flowTemplate.findMany.mockResolvedValue([]);

      await service.listTemplates('onboarding');

      expect(prisma.flowTemplate.findMany).toHaveBeenCalledWith({
        where: { isPublic: true, category: 'onboarding' },
        select: expect.any(Object),
        orderBy: { downloads: 'desc' },
        take: 100,
      });
    });

    it('returns empty array when no templates exist', async () => {
      prisma.flowTemplate.findMany.mockResolvedValue([]);

      const result = await service.listTemplates();

      expect(result).toEqual([]);
    });
  });

  describe('installTemplate', () => {
    const workspaceId = 'ws-1';
    const templateId = 'tpl-1';
    const template = {
      id: templateId,
      name: 'Welcome Flow',
      description: 'Auto welcome',
      nodes: [],
      edges: [],
    };

    it('throws when template is not found', async () => {
      prisma.flowTemplate.findUnique.mockResolvedValue(null);

      await expect(service.installTemplate(workspaceId, templateId)).rejects.toThrow(
        'Template not found',
      );
    });

    it('creates a new flow from template and increments downloads', async () => {
      prisma.flowTemplate.findUnique.mockResolvedValue(template);
      const newFlow = { id: 'f-1', name: template.name };
      prisma.flow.create.mockResolvedValue(newFlow);
      prisma.flowTemplate.update.mockResolvedValue({ downloads: 1 });

      const result = await service.installTemplate(workspaceId, templateId);

      expect(prisma.flow.create).toHaveBeenCalledWith({
        data: {
          workspaceId,
          name: template.name,
          description: template.description,
          nodes: template.nodes,
          edges: template.edges,
          isActive: false,
          triggerType: 'MANUAL',
        },
      });
      expect(prisma.flowTemplate.update).toHaveBeenCalledWith({
        where: { id: templateId },
        data: { downloads: { increment: 1 } },
      });
      expect(result).toEqual(newFlow);
    });

    it('returns the created flow', async () => {
      prisma.flowTemplate.findUnique.mockResolvedValue(template);
      const newFlow = { id: 'f-2', name: 'My Flow' };
      prisma.flow.create.mockResolvedValue(newFlow);

      const result = await service.installTemplate(workspaceId, templateId);

      expect(result).toBe(newFlow);
    });
  });
});
