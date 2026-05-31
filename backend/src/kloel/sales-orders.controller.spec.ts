import { BadRequestException, NotFoundException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ROUTE_CLASS_METADATA_KEY } from '../common/throttler/route-class.decorator';
import { SalesOrdersController } from './sales-orders.controller';
import { AuthenticatedRequest } from '../common/interfaces';
import { castMock } from '../../test/helpers/cast-mock';

describe('SalesOrdersController', () => {
  const findMany = jest.fn();
  const findFirst = jest.fn();
  const updateMany = jest.fn();
  const getAlerts = jest.fn();
  const generateAlerts = jest.fn();
  const resolveAlert = jest.fn();

  let controller: SalesOrdersController;

  const req = castMock<AuthenticatedRequest>({
    user: { sub: 'user-1', workspaceId: 'ws-1' },
  });
  const reqNoWorkspace = castMock<AuthenticatedRequest>({ user: { sub: 'user-1' } });

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new SalesOrdersController(
      castMock({ physicalOrder: { findMany, findFirst, updateMany } }),
      castMock({ getAlerts, generateAlerts, resolveAlert }),
    );
  });

  describe('route + governance wiring', () => {
    it('mounts under sales, is guarded by JwtAuthGuard, and is a read route class', () => {
      expect(Reflect.getMetadata('path', SalesOrdersController)).toBe('sales');
      expect(Reflect.getMetadata(ROUTE_CLASS_METADATA_KEY, SalesOrdersController)).toBe('read');
      const guards = Reflect.getMetadata(GUARDS_METADATA, SalesOrdersController) as unknown[];
      expect(guards).toContain(JwtAuthGuard);
    });
  });

  describe('listOrders', () => {
    it('returns workspace-scoped orders ordered by createdAt desc', async () => {
      const orders = [{ id: 'o1' }, { id: 'o2' }];
      findMany.mockResolvedValue(orders);

      const result = await controller.listOrders(req);

      expect(findMany).toHaveBeenCalledWith({
        where: { workspaceId: 'ws-1' },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toEqual({ orders, count: 2 });
    });

    it('applies a status filter when provided (and not the "todos" sentinel)', async () => {
      findMany.mockResolvedValue([]);

      await controller.listOrders(req, 'SHIPPED');

      const arg = castMock<[{ where: Record<string, unknown> }][]>(findMany.mock.calls)[0]?.[0];
      expect(arg.where.status).toBe('SHIPPED');
    });

    it('returns an honest empty result when the request has no workspace', async () => {
      const result = await controller.listOrders(reqNoWorkspace);

      expect(result).toEqual({ orders: [], count: 0 });
      expect(findMany).not.toHaveBeenCalled();
    });
  });

  describe('getOrderStats', () => {
    it('aggregates order counts by status from real rows', async () => {
      findMany.mockResolvedValue([
        { status: 'PROCESSING' },
        { status: 'SHIPPED' },
        { status: 'SHIPPED' },
        { status: 'DELIVERED' },
      ]);

      const result = await controller.getOrderStats(req);

      expect(result).toEqual({ total: 4, processing: 1, shipped: 2, delivered: 1 });
    });
  });

  describe('shipOrder', () => {
    it('marks the order shipped, persists a sanitized tracking code and carrier URL', async () => {
      findFirst.mockResolvedValue({ id: 'o1', workspaceId: 'ws-1', status: 'PROCESSING' });
      updateMany.mockResolvedValue({ count: 1 });

      const result = await controller.shipOrder(req, 'o1', {
        trackingCode: 'BR123456789BR',
        shippingMethod: 'correios',
      });

      const updateArg = castMock<[{ data: Record<string, unknown> }][]>(
        updateMany.mock.calls,
      )[0]?.[0];
      expect(updateArg.data.status).toBe('SHIPPED');
      expect(updateArg.data.trackingCode).toBe('BR123456789BR');
      expect(String(updateArg.data.trackingUrl)).toContain('rastreamento.correios.com.br');
      expect(result.success).toBe(true);
    });

    it('rejects a tracking code containing invalid characters', async () => {
      findFirst.mockResolvedValue({ id: 'o1', workspaceId: 'ws-1' });

      await expect(controller.shipOrder(req, 'o1', { trackingCode: 'BR 123/456' })).rejects.toThrow(
        BadRequestException,
      );
      expect(updateMany).not.toHaveBeenCalled();
    });

    it('throws NotFound when the order does not belong to the workspace', async () => {
      findFirst.mockResolvedValue(null);

      await expect(controller.shipOrder(req, 'missing', { trackingCode: 'BR1' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('deliverOrder', () => {
    it('marks the order delivered and returns success', async () => {
      findFirst.mockResolvedValue({ id: 'o1', workspaceId: 'ws-1' });
      updateMany.mockResolvedValue({ count: 1 });

      const result = await controller.deliverOrder(req, 'o1');

      const updateArg = castMock<[{ data: Record<string, unknown> }][]>(
        updateMany.mock.calls,
      )[0]?.[0];
      expect(updateArg.data.status).toBe('DELIVERED');
      expect(result.success).toBe(true);
    });

    it('throws NotFound when the order is missing', async () => {
      findFirst.mockResolvedValue(null);

      await expect(controller.deliverOrder(req, 'missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('order alerts', () => {
    it('delegates getOrderAlerts to the alerts service with the resolved filter', async () => {
      getAlerts.mockResolvedValue({ alerts: [{ id: 'a1' }], counts: { open: 1 } });

      const result = await controller.getOrderAlerts(req, 'false');

      expect(getAlerts).toHaveBeenCalledWith('ws-1', false);
      expect(result).toEqual({ alerts: [{ id: 'a1' }], counts: { open: 1 } });
    });

    it('delegates generateOrderAlerts to the alerts service', async () => {
      generateAlerts.mockResolvedValue({ created: 3 });

      const result = await controller.generateOrderAlerts(req);

      expect(generateAlerts).toHaveBeenCalledWith('ws-1');
      expect(result).toEqual({ created: 3 });
    });

    it('delegates resolveOrderAlert to the alerts service', async () => {
      resolveAlert.mockResolvedValue({ resolved: true });

      const result = await controller.resolveOrderAlert(req, 'a1');

      expect(resolveAlert).toHaveBeenCalledWith('a1', 'ws-1');
      expect(result).toEqual({ resolved: true });
    });

    it('throws NotFound resolving an alert without a workspace', async () => {
      await expect(controller.resolveOrderAlert(reqNoWorkspace, 'a1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
