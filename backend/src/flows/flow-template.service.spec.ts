import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FlowTemplateService } from './flow-template.service';

jest.mock('./flow-template.recommended', () => ({
  getRecommendedFlowTemplates: () => [
    { name: 'tpl-a', category: 'sales', nodes: [], edges: [], isPublic: true },
    { name: 'tpl-b', category: 'support', nodes: [], edges: [], description: 'desc', isPublic: false },
  ],
}));

describe('FlowTemplateService', () => {
  let service: FlowTemplateService;
  let prisma: {
    flowTemplate: {
      create: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      flowTemplate: {
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'new', ...data })),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FlowTemplateService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(FlowTemplateService);
  });

  it('getRecommendedTemplates returns the static list', () => {
    expect(service.getRecommendedTemplates().map((t) => t.name)).toEqual(['tpl-a', 'tpl-b']);
  });

  it('create persists template, defaulting isPublic to false', async () => {
    const result = await service.create({
      name: 'X',
      category: 'sales',
      nodes: [],
      edges: [],
    });
    expect(prisma.flowTemplate.create).toHaveBeenCalled();
    const callArg = prisma.flowTemplate.create.mock.calls[0][0];
    expect(callArg.data.isPublic).toBe(false);
    expect(result).toMatchObject({ name: 'X' });
  });

  it('listPublic filters by isPublic=true and orders by downloads desc', async () => {
    await service.listPublic();
    const arg = prisma.flowTemplate.findMany.mock.calls[0][0];
    expect(arg.where).toEqual({ isPublic: true });
    expect(arg.orderBy).toEqual({ downloads: 'desc' });
  });

  it('get throws NotFoundException when template missing', async () => {
    prisma.flowTemplate.findUnique.mockResolvedValue(null);
    await expect(service.get('missing')).rejects.toThrow(NotFoundException);
  });

  it('get returns template when found', async () => {
    prisma.flowTemplate.findUnique.mockResolvedValue({ id: 'x', name: 'x' });
    await expect(service.get('x')).resolves.toEqual({ id: 'x', name: 'x' });
  });

  it('incrementDownload increments downloads counter', async () => {
    await service.incrementDownload('x');
    expect(prisma.flowTemplate.update).toHaveBeenCalledWith({
      where: { id: 'x' },
      data: { downloads: { increment: 1 } },
    });
  });

  it('seedRecommended skips existing templates by name', async () => {
    prisma.flowTemplate.findMany.mockResolvedValue([
      { name: 'tpl-a', id: 'existing-a' },
    ]);
    const result = await service.seedRecommended();
    expect(result.seeded).toBe(2);
    expect(prisma.flowTemplate.create).toHaveBeenCalledTimes(1);
    expect(prisma.flowTemplate.create.mock.calls[0][0].data.name).toBe('tpl-b');
  });
});
