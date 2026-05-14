jest.mock('./helpers/common.helpers', () => ({
  ensureWorkspaceProductAccess: jest.fn().mockResolvedValue({ id: 'prod-1', workspaceId: 'ws-1' }),
  getWorkspaceId: jest.fn().mockReturnValue('ws-1'),
}));

jest.mock('./helpers/affiliate.helpers', () => ({
  buildCommissionPayload: jest.fn().mockReturnValue({
    role: 'AFFILIATE',
    percentage: 30,
    agentName: 'Agent Name',
    agentEmail: null,
  }),
  ensureNoDuplicateCommission: jest.fn().mockResolvedValue(undefined),
  COMMISSION_PARTNER_INVITE_ROLES: new Set(['COPRODUCER', 'MANAGER']),
}));

import { ProductCommissionController } from './product-commission.controller';
import { ensureWorkspaceProductAccess, getWorkspaceId } from './helpers/common.helpers';
import { buildCommissionPayload, ensureNoDuplicateCommission } from './helpers/affiliate.helpers';

const ensureWorkspaceProductAccessMock = ensureWorkspaceProductAccess as jest.Mock;
const getWorkspaceIdMock = getWorkspaceId as jest.Mock;
const buildCommissionPayloadMock = buildCommissionPayload as jest.Mock;
const ensureNoDuplicateCommissionMock = ensureNoDuplicateCommission as jest.Mock;

describe('ProductCommissionController', () => {
  const findMany = jest.fn();
  const create = jest.fn();
  const findFirst = jest.fn();
  const update = jest.fn();
  const del = jest.fn();
  const auditLog = jest.fn();
  const partnershipsCreate = jest.fn();
  const opsAlertOnError = jest.fn();

  let controller: ProductCommissionController;

  const req = { user: { sub: 'u-1', workspaceId: 'ws-1' }, headers: {} } as never;

  beforeEach(() => {
    jest.clearAllMocks();

    findMany.mockResolvedValue([{ id: 'c-1', role: 'AFFILIATE', percentage: 30 }]);
    create.mockResolvedValue({ id: 'c-1', productId: 'prod-1', role: 'AFFILIATE', percentage: 30 });
    findFirst.mockResolvedValue({ id: 'c-1', productId: 'prod-1', role: 'AFFILIATE', percentage: 30 });
    update.mockResolvedValue({ id: 'c-1', role: 'AFFILIATE', percentage: 50 });
    del.mockResolvedValue({ id: 'c-1' });

    ensureWorkspaceProductAccessMock.mockResolvedValue({ id: 'prod-1', workspaceId: 'ws-1' });
    getWorkspaceIdMock.mockReturnValue('ws-1');
    buildCommissionPayloadMock.mockReturnValue({
      role: 'AFFILIATE',
      percentage: 30,
      agentName: 'Agent Name',
      agentEmail: null,
    });
    ensureNoDuplicateCommissionMock.mockResolvedValue(undefined);

    controller = new ProductCommissionController(
      {
        productCommission: {
          findMany,
          create,
          findFirst,
          update,
          delete: del,
        },
        $transaction: jest.fn().mockImplementation((fn: (tx: Record<string, unknown>) => unknown) =>
          fn({
            productCommission: { findFirst, update },
          }),
        ),
      } as never,
      { log: auditLog } as never,
      { createPartner: partnershipsCreate } as never,
      { alertOnCriticalError: opsAlertOnError },
    );
  });

  describe('list', () => {
    it('calls ensureWorkspaceProductAccess and returns workspace-scoped commissions', async () => {
      const result = await controller.list('prod-1', req);

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
      expect(result).toEqual([{ id: 'c-1', role: 'AFFILIATE', percentage: 30 }]);
    });
  });

  describe('create', () => {
    it('creates a commission with body payload flowing through service', async () => {
      const body = { role: 'AFFILIATE', percentage: 30, agentName: 'Agent Name' };

      const result = await controller.create('prod-1', body, req);

      expect(getWorkspaceIdMock).toHaveBeenCalledWith(req);
      expect(ensureWorkspaceProductAccessMock).toHaveBeenCalledWith(
        expect.anything(),
        'prod-1',
        'ws-1',
      );
      expect(buildCommissionPayloadMock).toHaveBeenCalledWith(body);
      expect(ensureNoDuplicateCommissionMock).toHaveBeenCalled();
      expect(create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          productId: 'prod-1',
          role: 'AFFILIATE',
          percentage: 30,
        }),
      });
      expect(result).toMatchObject({ id: 'c-1', role: 'AFFILIATE' });
      expect(partnershipsCreate).not.toHaveBeenCalled();
    });
  });

  describe('error propagation', () => {
    it('propagates errors from ensureWorkspaceProductAccess', async () => {
      ensureWorkspaceProductAccessMock.mockRejectedValue(new Error('Acesso negado'));

      await expect(controller.list('prod-1', req)).rejects.toThrow('Acesso negado');
    });
  });

  describe('identity propagation', () => {
    it('passes user identity from req into getWorkspaceId', async () => {
      await controller.list('prod-1', req);

      expect(getWorkspaceIdMock).toHaveBeenCalledWith(req);
      expect(getWorkspaceIdMock).toHaveBeenCalledTimes(1);
    });
  });
});
