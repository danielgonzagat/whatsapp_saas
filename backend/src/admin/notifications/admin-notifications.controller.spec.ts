import { AdminRole } from '@prisma/client';
import { AdminNotificationsController } from './admin-notifications.controller';
import type { AuthenticatedAdmin } from '../auth/admin-token.types';

describe('AdminNotificationsController', () => {
  const notifications = {
    list: jest.fn(),
    markRead: jest.fn(),
    updatePreferences: jest.fn(),
  };

  let controller: AdminNotificationsController;

  const admin: AuthenticatedAdmin = {
    id: 'a-1',
    name: 'Owner Admin',
    email: 'owner@kloel.com',
    role: AdminRole.OWNER,
    sessionId: 's-1',
    scope: 'full',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new AdminNotificationsController(notifications as never);
  });

  it('list notifications: calls service.list with admin id and returns result', async () => {
    const expected = { items: [], unreadCount: 0, preferences: {} };
    notifications.list.mockResolvedValue(expected);

    const result = await controller.list(admin);

    expect(notifications.list).toHaveBeenCalledWith('a-1');
    expect(result).toEqual(expected);
  });

  it('markAsRead: calls service.markRead with admin id and notification id', async () => {
    notifications.markRead.mockResolvedValue({ ok: true as const });

    const result = await controller.markRead('n-1', admin);

    expect(notifications.markRead).toHaveBeenCalledWith('a-1', 'n-1');
    expect(result).toEqual({ ok: true });
  });

  it('error path: propagates service errors', async () => {
    const error = new Error('Service failure');
    notifications.list.mockRejectedValue(error);

    await expect(controller.list(admin)).rejects.toThrow('Service failure');
  });

  it('admin id propagated: passes admin.id to service.list', async () => {
    notifications.list.mockResolvedValue({ items: [], unreadCount: 0 });

    await controller.list(admin);

    expect(notifications.list).toHaveBeenCalledWith('a-1');
  });
});
