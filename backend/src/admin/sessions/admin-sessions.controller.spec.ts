import { AdminRole } from '@prisma/client';
import { AdminSessionsController } from './admin-sessions.controller';
import type { AuthenticatedAdmin } from '../auth/admin-token.types';

describe('AdminSessionsController', () => {
  const sessions = {
    listOwn: jest.fn(),
    revoke: jest.fn(),
  };

  let controller: AdminSessionsController;

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
    controller = new AdminSessionsController(sessions as never);
  });

  it('list active sessions happy: service called with admin id', async () => {
    const expected = [{ id: 's-1', createdAt: new Date() }];
    sessions.listOwn.mockResolvedValue(expected);

    const result = await controller.listOwn(admin);

    expect(sessions.listOwn).toHaveBeenCalledWith('a-1');
    expect(result).toBe(expected);
  });

  it('revoke session happy: service.revoke called with sessionId', async () => {
    sessions.revoke.mockResolvedValue(undefined);

    await controller.revoke('s-1', admin);

    expect(sessions.revoke).toHaveBeenCalledWith('s-1', 'a-1', AdminRole.OWNER);
  });

  it('error path: propagates service errors', async () => {
    const error = new Error('Session not found');
    sessions.listOwn.mockRejectedValue(error);

    await expect(controller.listOwn(admin)).rejects.toThrow('Session not found');
  });

  it('admin id propagated: passes admin.id to service.listOwn', async () => {
    sessions.listOwn.mockResolvedValue([]);

    await controller.listOwn(admin);

    expect(sessions.listOwn).toHaveBeenCalledWith('a-1');
  });
});
