import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { PipelineService } from './pipeline.service';

describe('PipelineService', () => {
  let service: PipelineService;
  let prisma: {
    pipeline: {
      findFirst: jest.Mock;
      create: jest.Mock;
    };
    deal: {
      findUnique: jest.Mock;
      update: jest.Mock;
      create: jest.Mock;
    };
    stage: {
      findUnique: jest.Mock;
    };
    contact: {
      findUnique: jest.Mock;
    };
  };

  const wsId = 'ws-1';

  const defaultStages = [
    { name: 'Lead', color: '#E5E7EB', order: 0 },
    { name: 'Contacted', color: '#FEF3C7', order: 1 },
    { name: 'Proposal', color: '#DBEAFE', order: 2 },
    { name: 'Won', color: '#D1FAE5', order: 3 },
    { name: 'Lost', color: '#FEE2E2', order: 4 },
  ];

  beforeEach(async () => {
    prisma = {
      pipeline: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      deal: {
        findUnique: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
      },
      stage: {
        findUnique: jest.fn(),
      },
      contact: {
        findUnique: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [PipelineService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<PipelineService>(PipelineService);
  });

  describe('getPipeline', () => {
    it('returns existing pipeline when found', async () => {
      const existing = { id: 'p-1', name: 'Existing Pipeline', stages: [] };
      prisma.pipeline.findFirst.mockResolvedValue(existing);

      const result = await service.getPipeline(wsId);

      expect(result).toEqual(existing);
      expect(prisma.pipeline.findFirst).toHaveBeenCalledWith({
        where: { workspaceId: wsId },
        include: {
          stages: {
            include: { deals: { include: { contact: true } } },
            orderBy: { order: 'asc' },
          },
        },
      });
    });

    it('creates default pipeline when none exists', async () => {
      const created = {
        id: 'p-new',
        name: 'Sales Pipeline',
        isDefault: true,
        stages: defaultStages,
      };
      prisma.pipeline.findFirst.mockResolvedValue(null);
      prisma.pipeline.create.mockResolvedValue(created);

      const result = await service.getPipeline(wsId);

      expect(result).toEqual(created);
      expect(prisma.pipeline.create).toHaveBeenCalledWith({
        data: {
          name: 'Sales Pipeline',
          workspaceId: wsId,
          isDefault: true,
          stages: { create: defaultStages },
        },
        include: {
          stages: {
            include: { deals: { include: { contact: true } } },
            orderBy: { order: 'asc' },
          },
        },
      });
    });
  });

  describe('updateDealStage', () => {
    const dealId = 'd-1';
    const stageId = 's-2';

    it('updates deal stage when both entities belong to the workspace', async () => {
      const deal = {
        id: dealId,
        contactId: 'c-1',
        contact: { customFields: {} },
        stage: { pipeline: { workspaceId: wsId } },
      };
      const stage = {
        id: stageId,
        name: 'Contacted',
        pipeline: { workspaceId: wsId },
      };
      const updated = { id: dealId, stageId };

      prisma.deal.findUnique.mockResolvedValue(deal);
      prisma.stage.findUnique.mockResolvedValue(stage);
      prisma.deal.update.mockResolvedValue(updated);

      const result = await service.updateDealStage(wsId, dealId, stageId);

      expect(result).toEqual(updated);
      expect(prisma.deal.update).toHaveBeenCalledWith({
        where: { id: dealId },
        data: { stageId },
      });
    });

    it('throws NotFoundException when deal does not exist', async () => {
      prisma.deal.findUnique.mockResolvedValue(null);
      prisma.stage.findUnique.mockResolvedValue({
        id: 's-1',
        name: 'Won',
        pipeline: { workspaceId: wsId },
      });

      await expect(service.updateDealStage(wsId, dealId, stageId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws NotFoundException when stage does not exist', async () => {
      prisma.deal.findUnique.mockResolvedValue({
        id: dealId,
        contactId: 'c-1',
        contact: { customFields: {} },
        stage: { pipeline: { workspaceId: wsId } },
      });
      prisma.stage.findUnique.mockResolvedValue(null);

      await expect(service.updateDealStage(wsId, dealId, stageId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ForbiddenException when deal belongs to different workspace', async () => {
      prisma.deal.findUnique.mockResolvedValue({
        id: dealId,
        contactId: 'c-1',
        contact: { customFields: {} },
        stage: { pipeline: { workspaceId: 'ws-other' } },
      });
      prisma.stage.findUnique.mockResolvedValue({
        id: stageId,
        name: 'Contacted',
        pipeline: { workspaceId: wsId },
      });

      await expect(service.updateDealStage(wsId, dealId, stageId)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws ForbiddenException when stage belongs to different workspace', async () => {
      prisma.deal.findUnique.mockResolvedValue({
        id: dealId,
        contactId: 'c-1',
        contact: { customFields: {} },
        stage: { pipeline: { workspaceId: wsId } },
      });
      prisma.stage.findUnique.mockResolvedValue({
        id: stageId,
        name: 'Contacted',
        pipeline: { workspaceId: 'ws-other' },
      });

      await expect(service.updateDealStage(wsId, dealId, stageId)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws ForbiddenException when deal.stage is null and stage workspace differs', async () => {
      prisma.deal.findUnique.mockResolvedValue({
        id: dealId,
        contactId: 'c-1',
        contact: { customFields: {} },
        stage: null,
      });
      prisma.stage.findUnique.mockResolvedValue({
        id: stageId,
        name: 'Contacted',
        pipeline: { workspaceId: wsId },
      });

      // deal.stage is null, so dealWorkspace will be undefined which !== wsId
      await expect(service.updateDealStage(wsId, dealId, stageId)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('createDeal', () => {
    const title = 'New Deal';
    const value = 500;

    beforeEach(() => {
      prisma.pipeline.findFirst.mockResolvedValue({
        id: 'p-1',
        stages: [{ id: 's-1', name: 'Lead' }],
      });
    });

    it('creates a deal without contactId', async () => {
      const createdDeal = { id: 'd-new', title, value, stageId: 's-1' };
      prisma.deal.create.mockResolvedValue(createdDeal);

      const result = await service.createDeal(wsId, { title, value });

      expect(result).toEqual(createdDeal);
      expect(prisma.deal.create).toHaveBeenCalledWith({
        data: {
          title,
          value,
          contactId: undefined,
          stageId: 's-1',
        },
      });
    });

    it('creates a deal with contactId and sourceCampaignId from customFields', async () => {
      const contactId = 'c-1';
      const createdDeal = {
        id: 'd-new',
        title,
        value,
        contactId,
        stageId: 's-1',
        sourceCampaignId: 'camp-99',
      };
      prisma.contact.findUnique.mockResolvedValue({
        workspaceId: wsId,
        customFields: { lastCampaignId: 'camp-99' },
      });
      prisma.deal.create.mockResolvedValue(createdDeal);

      const result = await service.createDeal(wsId, { title, value, contactId });

      expect(result).toEqual(createdDeal);
      expect(prisma.deal.create).toHaveBeenCalledWith({
        data: {
          title,
          value,
          contactId,
          stageId: 's-1',
          sourceCampaignId: 'camp-99',
        },
      });
    });

    it('throws ForbiddenException when contact does not belong to workspace', async () => {
      prisma.contact.findUnique.mockResolvedValue({
        workspaceId: 'ws-other',
        customFields: {},
      });

      await expect(service.createDeal(wsId, { title, value, contactId: 'c-1' })).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws ForbiddenException when contact is not found', async () => {
      prisma.contact.findUnique.mockResolvedValue(null);

      await expect(service.createDeal(wsId, { title, value, contactId: 'c-99' })).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('creates a deal with empty defaults when title and value are omitted', async () => {
      const createdDeal = { id: 'd-min', title: '', value: 0, stageId: 's-1' };
      prisma.deal.create.mockResolvedValue(createdDeal);

      const result = await service.createDeal(wsId, {});

      expect(result).toEqual(createdDeal);
      expect(prisma.deal.create).toHaveBeenCalledWith({
        data: {
          title: '',
          value: 0,
          contactId: undefined,
          stageId: 's-1',
        },
      });
    });

    it('creates a deal without sourceCampaignId when contact has no lastCampaignId', async () => {
      const contactId = 'c-1';
      const createdDeal = { id: 'd-new', title, value, contactId, stageId: 's-1' };
      prisma.contact.findUnique.mockResolvedValue({
        workspaceId: wsId,
        customFields: { notes: 'some text' },
      });
      prisma.deal.create.mockResolvedValue(createdDeal);

      const result = await service.createDeal(wsId, { title, value, contactId });

      expect(result).toEqual(createdDeal);
      expect(prisma.deal.create).toHaveBeenCalledWith({
        data: {
          title,
          value,
          contactId,
          stageId: 's-1',
        },
      });
    });
  });
});
