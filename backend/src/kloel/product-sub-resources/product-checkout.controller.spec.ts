import { NotFoundException } from '@nestjs/common';

jest.mock('./helpers/common.helpers', () => ({
  ensureWorkspaceProductAccess: jest.fn().mockResolvedValue(undefined),
  getWorkspaceId: jest.fn(),
  safeStr: jest.fn((v: unknown, fb = '') => (typeof v === 'string' ? v : fb)),
}));

jest.mock('./helpers/plan.helpers', () => ({
  buildCheckoutData: jest.fn((body: Record<string, unknown>) => body),
  serializeCheckout: jest.fn((c: Record<string, unknown>) => c),
}));

import { ProductCheckoutController } from './product-checkout.controller';
import { ensureWorkspaceProductAccess, getWorkspaceId, safeStr } from './helpers/common.helpers';
import { buildCheckoutData, serializeCheckout } from './helpers/plan.helpers';
import { createPartialPrismaMock } from '../../../test/helpers/prisma.mock';

const ensureWorkspaceProductAccessMock = ensureWorkspaceProductAccess as jest.Mock;
const getWorkspaceIdMock = getWorkspaceId as jest.Mock;
const safeStrMock = safeStr as jest.Mock;
const buildCheckoutDataMock = buildCheckoutData as jest.Mock;
const serializeCheckoutMock = serializeCheckout as jest.Mock;

describe('ProductCheckoutController', () => {
  let prismaMock: ReturnType<typeof createPartialPrismaMock>;

  const txFindFirst = jest.fn();
  const txUpdate = jest.fn();

  const txClient = {
    productCheckout: { findFirst: txFindFirst, update: txUpdate },
  };

  const auditMock = { log: jest.fn() };

  let controller: ProductCheckoutController;

  beforeEach(() => {
    prismaMock = createPartialPrismaMock({
      productCheckout: ['findMany', 'create', 'findFirst', 'delete'],
    });
    (prismaMock as any).$transaction = jest.fn().mockImplementation((cb: any) => cb(txClient));

    jest.clearAllMocks();
    getWorkspaceIdMock.mockReturnValue('ws-1');
    safeStrMock.mockImplementation((v: unknown, fb = '') => (typeof v === 'string' ? v : fb));
    buildCheckoutDataMock.mockImplementation((body: Record<string, unknown>) => body);
    serializeCheckoutMock.mockImplementation((c: Record<string, unknown>) => c);

    ensureWorkspaceProductAccessMock.mockResolvedValue(undefined);
    prismaMock.productCheckout.create.mockResolvedValue({
      id: 'co-1',
      productId: 'p-1',
      name: 'Checkout 1',
    });
    prismaMock.productCheckout.findMany.mockResolvedValue([
      { id: 'co-1', productId: 'p-1', name: 'Checkout 1' },
    ]);
    prismaMock.productCheckout.findFirst.mockResolvedValue({
      id: 'co-1',
      productId: 'p-1',
      name: 'Checkout 1',
    });
    prismaMock.productCheckout.delete.mockResolvedValue({ id: 'co-1' });
    txFindFirst.mockResolvedValue({ id: 'co-1', productId: 'p-1', name: 'Checkout 1' });
    txUpdate.mockResolvedValue({ id: 'co-1', productId: 'p-1', name: 'Updated' });
    auditMock.log.mockResolvedValue(undefined);

    controller = new ProductCheckoutController(prismaMock as never, auditMock as never);
  });

  describe('list', () => {
    it('returns serialized checkouts with workspace access verified', async () => {
      const req = { user: { sub: 'u-1', workspaceId: 'ws-1' }, headers: {} } as never;

      const result = await controller.list('p-1', req);

      expect(ensureWorkspaceProductAccessMock).toHaveBeenCalledWith(prismaMock, 'p-1', 'ws-1');
      expect(prismaMock.productCheckout.findMany).toHaveBeenCalledWith({
        where: { productId: 'p-1' },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
      expect(serializeCheckoutMock).toHaveBeenCalledTimes(1);
      expect(result).toEqual([{ id: 'co-1', productId: 'p-1', name: 'Checkout 1' }]);
    });
  });

  describe('create', () => {
    it('creates a checkout with body parsed and workspace access verified', async () => {
      const req = { user: { sub: 'u-1', workspaceId: 'ws-1' }, headers: {} } as never;
      const body = { name: 'Novo checkout', active: true, config: { color: 'red' } };

      const result = await controller.create('p-1', body, req);

      expect(ensureWorkspaceProductAccessMock).toHaveBeenCalledWith(prismaMock, 'p-1', 'ws-1');
      expect(buildCheckoutDataMock).toHaveBeenCalledWith(body);
      expect(prismaMock.productCheckout.create).toHaveBeenCalledTimes(1);
      const createCall = prismaMock.productCheckout.create.mock.calls[0][0];
      expect(createCall.data.productId).toBe('p-1');
      expect(serializeCheckoutMock).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({ id: 'co-1' });
    });
  });

  describe('update', () => {
    it('updates a checkout within a transaction and returns serialized result', async () => {
      const req = { user: { sub: 'u-1', workspaceId: 'ws-1' }, headers: {} } as never;
      const body = { name: 'Updated', active: false };

      const result = await controller.update('p-1', 'co-1', body, req);

      expect(ensureWorkspaceProductAccessMock).toHaveBeenCalledWith(prismaMock, 'p-1', 'ws-1');
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
      expect(txFindFirst).toHaveBeenCalledWith({
        where: { id: 'co-1', productId: 'p-1' },
      });
      expect(buildCheckoutDataMock).toHaveBeenCalledWith(body, {
        id: 'co-1',
        productId: 'p-1',
        name: 'Checkout 1',
      });
      expect(txUpdate).toHaveBeenCalledTimes(1);
      expect(serializeCheckoutMock).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({ id: 'co-1', name: 'Updated' });
    });

    it('propagates NotFoundException when checkout does not exist', async () => {
      txFindFirst.mockResolvedValue(null);
      const req = { user: { sub: 'u-1', workspaceId: 'ws-1' }, headers: {} } as never;

      await expect(controller.update('p-1', 'co-missing', {}, req)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('delete', () => {
    it('deletes a checkout and logs an audit record', async () => {
      const req = { user: { sub: 'u-1', workspaceId: 'ws-1' }, headers: {} } as never;

      await controller.delete('p-1', 'co-1', req);

      expect(ensureWorkspaceProductAccessMock).toHaveBeenCalledWith(prismaMock, 'p-1', 'ws-1');
      expect(prismaMock.productCheckout.findFirst).toHaveBeenCalledWith({
        where: { id: 'co-1', productId: 'p-1' },
      });
      expect(auditMock.log).toHaveBeenCalledWith({
        workspaceId: 'ws-1',
        action: 'DELETE_RECORD',
        resource: 'ProductCheckout',
        resourceId: 'co-1',
        details: { deletedBy: 'user', productId: 'p-1' },
      });
      expect(prismaMock.productCheckout.delete).toHaveBeenCalledWith({ where: { id: 'co-1' } });
    });

    it('propagates NotFoundException when checkout does not exist', async () => {
      prismaMock.productCheckout.findFirst.mockResolvedValue(null);
      const req = { user: { sub: 'u-1', workspaceId: 'ws-1' }, headers: {} } as never;

      await expect(controller.delete('p-1', 'co-missing', req)).rejects.toThrow(NotFoundException);
    });
  });

  describe('identity propagation', () => {
    it('calls getWorkspaceId with req and flows workspaceId into ensureWorkspaceProductAccess', async () => {
      const req = { user: { sub: 'u-1', workspaceId: 'ws-1' }, headers: {} } as never;

      await controller.list('p-1', req);

      expect(getWorkspaceIdMock).toHaveBeenCalledWith(req);
      expect(ensureWorkspaceProductAccessMock).toHaveBeenCalledWith(prismaMock, 'p-1', 'ws-1');
    });
  });

  describe('error propagation', () => {
    it('rejects when ensureWorkspaceProductAccess throws', async () => {
      ensureWorkspaceProductAccessMock.mockRejectedValueOnce(
        new NotFoundException('Produto não encontrado'),
      );
      const req = { user: { sub: 'u-1', workspaceId: 'ws-1' }, headers: {} } as never;

      await expect(controller.list('p-1', req)).rejects.toThrow(NotFoundException);
    });

    it('rejects when prisma findMany throws', async () => {
      prismaMock.productCheckout.findMany.mockRejectedValueOnce(new Error('DB error'));
      const req = { user: { sub: 'u-1', workspaceId: 'ws-1' }, headers: {} } as never;

      await expect(controller.list('p-1', req)).rejects.toThrow('DB error');
    });
  });
});
