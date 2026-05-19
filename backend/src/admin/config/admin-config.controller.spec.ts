import { AdminConfigController } from './admin-config.controller';

describe('AdminConfigController', () => {
  const overview = jest.fn();
  const updateWorkspaceConfig = jest.fn();

  let controller: AdminConfigController;

  beforeEach(() => {
    jest.clearAllMocks();

    controller = new AdminConfigController({ overview, updateWorkspaceConfig } as never);
  });

  describe('overview', () => {
    it('calls service.overview with query.search', async () => {
      const result = { metrics: { totalWorkspaces: 0 }, workspaces: [] };
      overview.mockResolvedValue(result);

      const actual = await controller.overview({ search: 'test' });

      expect(overview).toHaveBeenCalledWith('test');
      expect(actual).toBe(result);
    });
  });

  describe('updateWorkspace', () => {
    it('calls service.updateWorkspaceConfig with workspaceId, admin.id, and body', async () => {
      const admin = {
        id: 'admin-1',
        name: 'Admin',
        email: 'admin@kloel.com',
        role: 'SUPER_ADMIN',
        sessionId: 'sess-1',
        scope: 'full',
      };
      const dto = { guestMode: true, customDomain: 'example.com' };
      const result = { workspaceId: 'ws-1', name: 'Test' };
      updateWorkspaceConfig.mockResolvedValue(result);

      const actual = await controller.updateWorkspace('ws-1', dto, admin);

      expect(updateWorkspaceConfig).toHaveBeenCalledWith('ws-1', 'admin-1', dto);
      expect(actual).toBe(result);
    });

    it('propagates admin id to service', async () => {
      const admin = {
        id: 'admin-id-42',
        name: 'X',
        email: 'x@kloel.com',
        role: 'SUPER_ADMIN',
        sessionId: 's',
        scope: 'full',
      };
      updateWorkspaceConfig.mockResolvedValue({});

      await controller.updateWorkspace('ws-1', { guestMode: false }, admin);

      expect(updateWorkspaceConfig).toHaveBeenCalledWith(
        'ws-1',
        'admin-id-42',
        expect.anything(),
      );
    });

    it('propagates errors from service', async () => {
      const error = new Error('workspace not found');
      updateWorkspaceConfig.mockRejectedValue(error);

      await expect(
        controller.updateWorkspace('ws-1', {}, { id: 'a' } as never),
      ).rejects.toThrow('workspace not found');
    });
  });
});
