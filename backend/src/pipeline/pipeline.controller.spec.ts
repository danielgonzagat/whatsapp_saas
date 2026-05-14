import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PipelineController } from './pipeline.controller';

describe('PipelineController', () => {
  const getPipeline = jest.fn();
  const createDeal = jest.fn();
  const updateDealStage = jest.fn();

  let controller: PipelineController;

  beforeEach(() => {
    jest.clearAllMocks();

    controller = new PipelineController({
      getPipeline,
      createDeal,
      updateDealStage,
    } as never);
  });

  describe('getPipeline', () => {
    it('calls service with resolved workspaceId from token', async () => {
      const pipeline = { id: 'p-1', name: 'Sales Pipeline' };
      getPipeline.mockResolvedValueOnce(pipeline);

      const req = {
        user: { sub: 'u-1', workspaceId: 'ws-1' },
        headers: {},
      } as never;

      const result = await controller.getPipeline(req, 'ws-1');

      expect(getPipeline).toHaveBeenCalledWith('ws-1');
      expect(result).toBe(pipeline);
    });

    it('propagates ForbiddenException when requested workspace differs from token', async () => {
      const req = {
        user: { sub: 'u-1', workspaceId: 'ws-token' },
        headers: {},
      } as never;

      await expect(controller.getPipeline(req, 'ws-other')).rejects.toThrow(
        ForbiddenException,
      );
      expect(getPipeline).not.toHaveBeenCalled();
    });
  });

  describe('createDeal', () => {
    it('calls service with effective workspaceId and deal data without workspaceId', async () => {
      const deal = { id: 'd-1', title: 'Test Deal' };
      createDeal.mockResolvedValueOnce(deal);

      const req = {
        user: { sub: 'u-1', workspaceId: 'ws-1' },
        headers: {},
      } as never;

      const body = {
        workspaceId: 'ws-1',
        title: 'Test Deal',
        contactId: 'c-1',
        value: 1000,
      };

      const result = await controller.createDeal(req, body);

      expect(createDeal).toHaveBeenCalledWith('ws-1', {
        title: 'Test Deal',
        contactId: 'c-1',
        value: 1000,
      });
      expect(result).toBe(deal);
    });

    it('falls back to token workspaceId when body omits workspaceId', async () => {
      const deal = { id: 'd-2', title: 'Body without ws' };
      createDeal.mockResolvedValueOnce(deal);

      const req = {
        user: { sub: 'u-1', workspaceId: 'ws-token' },
        headers: {},
      } as never;

      const body = { title: 'Body without ws', contactId: 'c-1' };

      await controller.createDeal(req, body);

      expect(createDeal).toHaveBeenCalledWith('ws-token', {
        title: 'Body without ws',
        contactId: 'c-1',
      });
    });
  });

  describe('updateStage', () => {
    it('calls service with workspaceId from token and deal id + stageId from body', async () => {
      const updated = { id: 'deal-1', stageId: 'stage-2' };
      updateDealStage.mockResolvedValueOnce(updated);

      const req = {
        user: { sub: 'u-1', workspaceId: 'ws-1' },
        headers: {},
      } as never;

      const result = await controller.updateStage(req, 'deal-1', {
        stageId: 'stage-2',
      });

      expect(updateDealStage).toHaveBeenCalledWith('ws-1', 'deal-1', 'stage-2');
      expect(result).toBe(updated);
    });

    it('propagates NotFoundException from service', async () => {
      updateDealStage.mockRejectedValueOnce(
        new NotFoundException('Deal nao encontrado'),
      );

      const req = {
        user: { sub: 'u-1', workspaceId: 'ws-1' },
        headers: {},
      } as never;

      await expect(
        controller.updateStage(req, 'bad-id', { stageId: 'stage-2' }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
