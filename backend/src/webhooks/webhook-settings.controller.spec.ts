jest.mock('node:crypto', () => ({
  randomUUID: jest.fn().mockReturnValue('mock-uuid-12345678'),
}));

jest.mock('@sentry/node', () => ({}), { virtual: true });

jest.mock(
  '../../observability/ops-alert.service',
  () => ({
    OpsAlertService: jest.fn(),
    AlertSeverity: { INFO: 'info', WARN: 'warn', CRITICAL: 'critical' },
  }),
  { virtual: true },
);

import { WebhookSettingsController } from './webhook-settings.controller';

describe('WebhookSettingsController', () => {
  const findMany = jest.fn();
  const findFirst = jest.fn();
  const prismaCreate = jest.fn();
  const deleteMany = jest.fn();
  const auditLog = jest.fn();

  let controller: WebhookSettingsController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new WebhookSettingsController(
      {
        webhookSubscription: { findMany, findFirst, create: prismaCreate, deleteMany },
      } as never,
      { log: auditLog } as never,
    );
  });

  describe('GET / (list)', () => {
    it('returns workspace-filtered webhook subscriptions', async () => {
      findMany.mockResolvedValueOnce([
        { id: 'wh-1', url: 'https://example.com/hook', workspaceId: 'ws-1' },
        { id: 'wh-2', url: 'https://example.com/hook-2', workspaceId: 'ws-1' },
      ]);
      const req = { user: { sub: 'u-1', workspaceId: 'ws-1' }, headers: {} } as never;

      const result = await controller.list(req);

      expect(findMany).toHaveBeenCalledWith({ where: { workspaceId: 'ws-1' } });
      expect(result).toHaveLength(2);
    });
  });

  describe('POST / (create)', () => {
    it('creates a new webhook subscription with generated secret', async () => {
      const createdSubscription = {
        id: 'wh-1',
        workspaceId: 'ws-1',
        url: 'https://example.com/hook',
        events: ['user.created', 'order.paid'],
        secret: 'mock-uuid-12345678',
      };
      prismaCreate.mockResolvedValueOnce(createdSubscription);

      const req = { user: { sub: 'u-1', workspaceId: 'ws-1' }, headers: {} } as never;
      const body = { url: 'https://example.com/hook', events: ['user.created', 'order.paid'] };

      const result = await controller.create(req, body);

      expect(prismaCreate).toHaveBeenCalledWith({
        data: {
          workspaceId: 'ws-1',
          url: 'https://example.com/hook',
          events: ['user.created', 'order.paid'],
          secret: 'mock-uuid-12345678',
        },
      });
      expect(result).toBe(createdSubscription);
    });

    it('returns existing subscription when idempotency key matches', async () => {
      const existingRecord = {
        id: 'wh-1',
        url: 'https://example.com/hook',
        workspaceId: 'ws-1',
        events: ['user.created'],
      };
      findFirst.mockResolvedValueOnce(existingRecord);

      const req = { user: { sub: 'u-1', workspaceId: 'ws-1' }, headers: {} } as never;
      const body = { url: 'https://example.com/hook', events: ['user.created'] };

      const result = await controller.create(req, body, 'idemp-key-abc');

      expect(findFirst).toHaveBeenCalledWith({
        where: { workspaceId: 'ws-1', url: 'https://example.com/hook' },
      });
      expect(prismaCreate).not.toHaveBeenCalled();
      expect(result).toBe(existingRecord);
    });
  });

  describe('DELETE /:id (delete)', () => {
    it('deletes webhook subscription and logs audit', async () => {
      const req = { user: { sub: 'u-1', workspaceId: 'ws-1' }, headers: {} } as never;

      await controller.delete(req, 'sub-id-123');

      expect(auditLog).toHaveBeenCalledWith({
        workspaceId: 'ws-1',
        action: 'DELETE_RECORD',
        resource: 'WebhookSubscription',
        resourceId: 'sub-id-123',
        details: { deletedBy: 'user' },
      });
      expect(deleteMany).toHaveBeenCalledWith({
        where: { id: 'sub-id-123', workspaceId: 'ws-1' },
      });
    });
  });

  describe('error propagation', () => {
    it('propagates prisma errors from list to caller', async () => {
      const error = new Error('Database connection refused');
      findMany.mockRejectedValueOnce(error);
      const req = { user: { sub: 'u-1', workspaceId: 'ws-1' }, headers: {} } as never;

      await expect(controller.list(req)).rejects.toThrow('Database connection refused');
    });

    it('propagates prisma errors from delete to caller', async () => {
      const error = new Error('Record not found');
      deleteMany.mockRejectedValueOnce(error);
      const req = { user: { sub: 'u-1', workspaceId: 'ws-1' }, headers: {} } as never;

      await expect(controller.delete(req, 'sub-1')).rejects.toThrow('Record not found');
    });
  });

  describe('identity propagation', () => {
    it('passes workspaceId from req.user to prisma findMany', async () => {
      findMany.mockResolvedValueOnce([]);
      const req = { user: { sub: 'u-42', workspaceId: 'ws-99' }, headers: {} } as never;

      await controller.list(req);

      expect(findMany).toHaveBeenCalledWith({ where: { workspaceId: 'ws-99' } });
    });

    it('passes workspaceId from req.user when creating a subscription', async () => {
      prismaCreate.mockResolvedValueOnce({
        id: 'wh-x',
        workspaceId: 'ws-99',
        url: 'https://x.com/hook',
        events: ['user.created'],
      });
      const req = { user: { sub: 'u-42', workspaceId: 'ws-99' }, headers: {} } as never;
      const body = { url: 'https://x.com/hook', events: ['user.created'] };

      await controller.create(req, body);

      expect(prismaCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ workspaceId: 'ws-99' }),
        }),
      );
    });

    it('passes workspaceId from req.user when deleting a subscription', async () => {
      const req = { user: { sub: 'u-42', workspaceId: 'ws-99' }, headers: {} } as never;

      await controller.delete(req, 'sub-1');

      expect(auditLog).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: 'ws-99' }),
      );
      expect(deleteMany).toHaveBeenCalledWith({
        where: { id: 'sub-1', workspaceId: 'ws-99' },
      });
    });
  });
});
