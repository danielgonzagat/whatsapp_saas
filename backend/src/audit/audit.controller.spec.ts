import { AuditController } from './audit.controller';
import type { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';

describe('AuditController', () => {
  const getLogsMock = jest.fn();

  let controller: AuditController;

  function buildReq(workspaceId = 'ws-1'): AuthenticatedRequest {
    return {
      user: { sub: 'user-1', email: 'a@kloel.com', workspaceId, role: 'OWNER' },
    } as AuthenticatedRequest;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new AuditController({ getLogs: getLogsMock } as never);
  });

  describe('getLogs', () => {
    it('calls service with workspaceId, limit and offset', async () => {
      const mockPage = { data: [], total: 0, page: 1, lastPage: 1 };
      getLogsMock.mockResolvedValue(mockPage);

      const result = await controller.getLogs(buildReq(), 'ws-1', '20', '10');

      expect(getLogsMock).toHaveBeenCalledWith('ws-1', 20, 10);
      expect(result).toBe(mockPage);
    });

    it('clamps limit to [1, 100] and offset to ≥ 0', async () => {
      getLogsMock.mockResolvedValue({ data: [], total: 0, page: 1, lastPage: 1 });

      await controller.getLogs(buildReq(), 'ws-1', undefined as unknown as string, undefined as unknown as string);
      expect(getLogsMock).toHaveBeenCalledWith('ws-1', 50, 0);

      jest.clearAllMocks();
      await controller.getLogs(buildReq(), 'ws-1', '999', '-5');
      expect(getLogsMock).toHaveBeenCalledWith('ws-1', 100, 0);

      jest.clearAllMocks();
      await controller.getLogs(buildReq(), 'ws-1', '1', '0');
      expect(getLogsMock).toHaveBeenCalledWith('ws-1', 1, 0);
    });

    it('propagates error from service', async () => {
      const error = new Error('database unavailable');
      getLogsMock.mockRejectedValue(error);

      await expect(controller.getLogs(buildReq(), 'ws-1', '10', '0')).rejects.toThrow('database unavailable');
    });

    it('uses workspaceId resolved from auth user for tenant isolation', async () => {
      getLogsMock.mockResolvedValue({ data: [], total: 0, page: 1, lastPage: 1 });

      const req = buildReq('ws-auth');
      await controller.getLogs(req, 'ws-auth', '10', '0');

      expect(getLogsMock).toHaveBeenCalledWith('ws-auth', 10, 0);
    });
  });
});
