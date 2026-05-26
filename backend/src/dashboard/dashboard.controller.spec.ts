import { DashboardController } from './dashboard.controller';

jest.mock('../auth/jwt-auth.guard', () => ({
  JwtAuthGuard: jest.fn(),
}));

jest.mock('../common/guards/workspace.guard', () => ({
  WorkspaceGuard: jest.fn(),
}));

jest.mock('../common/throttler/route-class.decorator', () => ({
  RouteClass: () => jest.fn(),
}));

jest.mock('../auth/workspace-access', () => ({
  resolveWorkspaceId: jest.fn(),
}));

jest.mock('../common/storage/public-storage-url.util', () => ({
  normalizeStorageUrlForRequest: jest.fn(),
}));

import { resolveWorkspaceId } from '../auth/workspace-access';
import { normalizeStorageUrlForRequest } from '../common/storage/public-storage-url.util';

const resolveWorkspaceIdMock = resolveWorkspaceId as jest.Mock;
const normalizeStorageUrlForRequestMock = normalizeStorageUrlForRequest as jest.Mock;

describe('DashboardController', () => {
  const getStatsMock = jest.fn();
  const getHomeSnapshotMock = jest.fn();

  const dashboardServiceMock = {
    getStats: getStatsMock,
    getHomeSnapshot: getHomeSnapshotMock,
  };

  let controller: DashboardController;

  beforeEach(() => {
    jest.clearAllMocks();
    resolveWorkspaceIdMock.mockReturnValue('ws-default');
    normalizeStorageUrlForRequestMock.mockImplementation(
      (url: string | null) => url,
    );

    controller = new DashboardController(
      dashboardServiceMock as never,
      {} as never,
    );
  });

  describe('getStats', () => {
    it('calls dashboardService.getStats with workspaceId resolved from request', async () => {
      resolveWorkspaceIdMock.mockReturnValue('ws-resolved-1');
      getStatsMock.mockResolvedValue({ contacts: 42 });

      const req = { user: { id: 'user-1' } };
      const result = await controller.getStats(req as never, 'ws-override');

      expect(resolveWorkspaceIdMock).toHaveBeenCalledWith(req, 'ws-override');
      expect(getStatsMock).toHaveBeenCalledWith('ws-resolved-1');
      expect(result).toEqual({ contacts: 42 });
    });
  });

  describe('getHome', () => {
    it('calls dashboardService.getHomeSnapshot with resolved workspace and query options', async () => {
      resolveWorkspaceIdMock.mockReturnValue('ws-home');
      getHomeSnapshotMock.mockResolvedValue({
        products: [{ imageUrl: '/raw.png' }],
      });
      normalizeStorageUrlForRequestMock.mockReturnValue('/normalized.png');

      const req = { user: { id: 'user-2' } };
      const query = { period: '7d', workspaceId: 'ws-query' };
      const result = await controller.getHome(req as never, query);

      expect(resolveWorkspaceIdMock).toHaveBeenCalledWith(req, 'ws-query');
      expect(getHomeSnapshotMock).toHaveBeenCalledWith('ws-home', {
        period: '7d',
      });
      expect(result.products[0].imageUrl).toBe('/normalized.png');
    });
  });

  describe('error propagation', () => {
    it('propagates error when dashboardService.getStats rejects', async () => {
      const error = new Error('Database connection lost');
      getStatsMock.mockRejectedValue(error);

      await expect(
        controller.getStats({ user: {} } as never, 'ws-err'),
      ).rejects.toThrow('Database connection lost');
    });
  });

  describe('identity propagation', () => {
    it('passes CurrentUser identity through resolveWorkspaceId into service call', async () => {
      const req = { user: { id: 'admin-99', email: 'admin@kloel.com' } };
      resolveWorkspaceIdMock.mockReturnValue('ws-identity');
      getStatsMock.mockResolvedValue({ contacts: 1 });

      await controller.getStats(req as never, undefined);

      expect(resolveWorkspaceIdMock).toHaveBeenCalledWith(req, undefined);
      expect(resolveWorkspaceIdMock.mock.calls[0][0].user.id).toBe('admin-99');
      expect(getStatsMock).toHaveBeenCalledWith('ws-identity');
    });
  });
});
