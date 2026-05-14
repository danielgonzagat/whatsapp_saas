jest.mock('./helpers/common.helpers', () => ({
  ensureWorkspaceProductAccess: jest.fn().mockResolvedValue({ id: 'prod-1', workspaceId: 'ws-1', name: 'Product A' }),
  getWorkspaceId: jest.fn().mockReturnValue('ws-1'),
}));

jest.mock('./helpers/plan.helpers', () => ({
  buildPlanData: jest.fn().mockReturnValue({ name: 'Basic Plan', price: 99 }),
  serializePlan: jest.fn().mockImplementation((p: Record<string, unknown>) => ({ ...p, slug: 'basic-plan-slug' })),
}));

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ProductPlanController } from './product-plan.controller';
import { ensureWorkspaceProductAccess, getWorkspaceId } from './helpers/common.helpers';
import { buildPlanData, serializePlan } from './helpers/plan.helpers';

const ensureWorkspaceProductAccessMock = ensureWorkspaceProductAccess as jest.Mock;
const getWorkspaceIdMock = getWorkspaceId as jest.Mock;
const buildPlanDataMock = buildPlanData as jest.Mock;
const serializePlanMock = serializePlan as jest.Mock;

describe('ProductPlanController', () => {
  const findMany = jest.fn();
  const create = jest.fn();
  const findFirst = jest.fn();
  const update = jest.fn();
  const del = jest.fn();
  const auditLog = jest.fn();

  let controller: ProductPlanController;

  const req = { user: { sub: 'u-1', workspaceId: 'ws-1' }, headers: {} } as never;

  beforeEach(() => {
    jest.clearAllMocks();

    findMany.mockResolvedValue([{ id: 'pl1', name: 'Basic', price: 99 }]);
    create.mockResolvedValue({ id: 'pl1', name: 'Basic', price: 99 });
    findFirst.mockResolvedValue({ id: 'pl1', productId: 'prod-1', name: 'Basic', price: 99 });
    update.mockResolvedValue({ id: 'pl1', name: 'Updated', price: 199 });
    del.mockResolvedValue({ id: 'pl1' });

    ensureWorkspaceProductAccessMock.mockResolvedValue({ id: 'prod-1', workspaceId: 'ws-1', name: 'Product A' });
    getWorkspaceIdMock.mockReturnValue('ws-1');
    buildPlanDataMock.mockReturnValue({ name: 'Basic Plan', price: 99 });
    serializePlanMock.mockImplementation((p: Record<string, unknown>) => ({ ...p, slug: 'basic-plan-slug' }));

    controller = new ProductPlanController(
      {
        productPlan: {
          findMany,
          create,
          findFirst,
          update,
          delete: del,
        },
        $transaction: jest.fn().mockImplementation((fn: (tx: Record<string, unknown>) => unknown) =>
          fn({
            productPlan: { findFirst, update },
          }),
        ),
      } as never,
      { log: auditLog } as never,
    );
  });

  describe('listPlans', () => {
    it('calls ensureWorkspaceProductAccess and returns serialized plans', async () => {
      const result = await controller.listPlans('prod-1', req);

      expect(getWorkspaceIdMock).toHaveBeenCalledWith(req);
      expect(ensureWorkspaceProductAccessMock).toHaveBeenCalledWith(
        expect.anything(),
        'prod-1',
        'ws-1',
      );
      expect(findMany).toHaveBeenCalledWith({
        where: { productId: 'prod-1' },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
      expect(serializePlanMock).toHaveBeenCalledTimes(1);
      expect(result).toEqual([{ id: 'pl1', name: 'Basic', price: 99, slug: 'basic-plan-slug' }]);
    });
  });

  describe('getPlan', () => {
    it('returns a serialized plan when found', async () => {
      const result = await controller.getPlan('prod-1', 'pl1', req);

      expect(getWorkspaceIdMock).toHaveBeenCalledWith(req);
      expect(ensureWorkspaceProductAccessMock).toHaveBeenCalledWith(
        expect.anything(),
        'prod-1',
        'ws-1',
      );
      expect(findFirst).toHaveBeenCalledWith({
        where: { id: 'pl1', productId: 'prod-1' },
      });
      expect(serializePlanMock).toHaveBeenCalledWith({ id: 'pl1', productId: 'prod-1', name: 'Basic', price: 99 });
      expect(result).toHaveProperty('slug', 'basic-plan-slug');
    });

    it('throws NotFoundException when plan not found', async () => {
      findFirst.mockResolvedValue(null);

      await expect(controller.getPlan('prod-1', 'pl1', req)).rejects.toThrow(NotFoundException);
      await expect(controller.getPlan('prod-1', 'pl1', req)).rejects.toThrow('Plano não encontrado');
    });
  });

  describe('createPlan', () => {
    it('creates a plan with body and returns serialized result', async () => {
      const body = { name: 'Pro Plan', price: 199 };

      const result = await controller.createPlan('prod-1', body, req);

      expect(getWorkspaceIdMock).toHaveBeenCalledWith(req);
      expect(ensureWorkspaceProductAccessMock).toHaveBeenCalledWith(
        expect.anything(),
        'prod-1',
        'ws-1',
      );
      expect(buildPlanDataMock).toHaveBeenCalledWith(body);
      expect(create).toHaveBeenCalled();
      expect(result).toHaveProperty('slug', 'basic-plan-slug');
    });

    it('propagates user identity from req through getWorkspaceId', async () => {
      const body = { name: 'Plan' };

      await controller.createPlan('prod-1', body, req);

      expect(getWorkspaceIdMock).toHaveBeenCalledWith(req);
      expect(ensureWorkspaceProductAccessMock).toHaveBeenCalledWith(
        expect.anything(),
        'prod-1',
        'ws-1',
      );
    });

    it('throws BadRequestException when plan name is missing', async () => {
      buildPlanDataMock.mockReturnValue({ price: 99 });

      await expect(controller.createPlan('prod-1', {}, req)).rejects.toThrow(BadRequestException);
      await expect(controller.createPlan('prod-1', {}, req)).rejects.toThrow('Nome do plano é obrigatório');
    });
  });

  describe('updatePlan', () => {
    it('updates a plan with body via transaction', async () => {
      const body = { name: 'Updated Plan', price: 199 };

      const result = await controller.updatePlan('prod-1', 'pl1', body, req);

      expect(getWorkspaceIdMock).toHaveBeenCalledWith(req);
      expect(ensureWorkspaceProductAccessMock).toHaveBeenCalled();
      expect(buildPlanDataMock).toHaveBeenCalledWith(body, { id: 'pl1', productId: 'prod-1', name: 'Basic', price: 99 });
      expect(update).toHaveBeenCalled();
      expect(result).toHaveProperty('slug', 'basic-plan-slug');
    });

    it('throws NotFoundException when plan not found in transaction', async () => {
      findFirst.mockResolvedValue(null);

      await expect(controller.updatePlan('prod-1', 'pl1', {}, req)).rejects.toThrow(NotFoundException);
    });
  });

  describe('deletePlan', () => {
    it('deletes a plan and logs audit', async () => {
      await controller.deletePlan('prod-1', 'pl1', req);

      expect(getWorkspaceIdMock).toHaveBeenCalledWith(req);
      expect(ensureWorkspaceProductAccessMock).toHaveBeenCalled();
      expect(auditLog).toHaveBeenCalledWith({
        workspaceId: 'ws-1',
        action: 'DELETE_RECORD',
        resource: 'ProductPlan',
        resourceId: 'pl1',
        details: { deletedBy: 'user', productId: 'prod-1' },
      });
      expect(del).toHaveBeenCalledWith({ where: { id: 'pl1' } });
    });

    it('throws NotFoundException when plan not found for deletion', async () => {
      findFirst.mockResolvedValue(null);

      await expect(controller.deletePlan('prod-1', 'pl1', req)).rejects.toThrow(NotFoundException);
    });
  });
});
