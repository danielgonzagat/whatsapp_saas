import { AnalyticsController } from './analytics.controller';
import { resolveWorkspaceId } from '../auth/workspace-access';

jest.mock('../auth/workspace-access', () => ({
  resolveWorkspaceId: jest.fn(),
}));

describe('AnalyticsController', () => {
  const getDashboardStats = jest.fn();
  const getDailyActivity = jest.fn();
  const getFlowStats = jest.fn();
  const getFullReport = jest.fn();
  const getAIReport = jest.fn();
  const getBestTime = jest.fn();
  const getAdvancedDashboard = jest.fn();

  let controller: AnalyticsController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new AnalyticsController(
      {
        getDashboardStats,
        getDailyActivity,
        getFlowStats,
        getFullReport,
        getAIReport,
      } as never,
      { getBestTime } as never,
      { getAdvancedDashboard } as never,
    );
  });

  describe('getDashboard', () => {
    it('calls analyticsService.getDashboardStats with workspaceId from authenticated user (happy path)', async () => {
      const req = {
        user: { workspaceId: 'ws-1', sub: 'a-1', email: 'a@test.com', role: 'OWNER' },
      } as never;
      const mockData = { messages: 10, contacts: 5 };
      getDashboardStats.mockResolvedValue(mockData);

      const result = await controller.getDashboard(req);

      expect(getDashboardStats).toHaveBeenCalledWith('ws-1');
      expect(result).toEqual(mockData);
    });

    it('propagates error when analyticsService rejects', async () => {
      const req = {
        user: { workspaceId: 'ws-1', sub: 'a-1', email: 'a@test.com', role: 'OWNER' },
      } as never;
      const error = new Error('DB connection failed');
      getDashboardStats.mockRejectedValue(error);

      await expect(controller.getDashboard(req)).rejects.toThrow('DB connection failed');
    });
  });

  describe('getFlowStats', () => {
    it('calls analyticsService.getFlowStats with workspaceId and flow id from params', async () => {
      const req = {
        user: { workspaceId: 'ws-1', sub: 'a-1', email: 'a@test.com', role: 'OWNER' },
      } as never;
      const mockData = { total: 5, completed: 3, failed: 2 };
      getFlowStats.mockResolvedValue(mockData);

      const result = await controller.getFlowStats(req, 'flow-1');

      expect(getFlowStats).toHaveBeenCalledWith('ws-1', 'flow-1');
      expect(result).toEqual(mockData);
    });
  });

  describe('getFullReport', () => {
    it('passes period from query DTO to service when no startDate/endDate provided', async () => {
      const req = {
        user: { workspaceId: 'ws-1', sub: 'a-1', email: 'a@test.com', role: 'OWNER' },
      } as never;
      const query = { period: '7d' } as never;
      const mockData = { period: '7d', kpi: {} };
      getFullReport.mockResolvedValue(mockData);

      const result = await controller.getFullReport(req, query);

      expect(getFullReport).toHaveBeenCalledWith('ws-1', '7d');
      expect(result).toEqual(mockData);
    });
  });

  describe('getStats', () => {
    it('uses resolveWorkspaceId to determine effective workspace and propagates identity to service', async () => {
      const req = {
        user: { workspaceId: 'ws-1', sub: 'a-1', email: 'a@test.com', role: 'OWNER' },
        query: {},
      } as never;
      (resolveWorkspaceId as jest.Mock).mockReturnValue('ws-resolved');
      const mockData = { messages: 20 };
      getDashboardStats.mockResolvedValue(mockData);

      const result = await controller.getStats(req, 'ws-explicit');

      expect(resolveWorkspaceId).toHaveBeenCalledWith(req, 'ws-explicit');
      expect(getDashboardStats).toHaveBeenCalledWith('ws-resolved');
      expect(result).toEqual(mockData);
    });
  });

  describe('getAIReport', () => {
    it('calls analyticsService.getAIReport with workspaceId from authenticated user', async () => {
      const req = {
        user: { workspaceId: 'ws-1', sub: 'a-1', email: 'a@test.com', role: 'OWNER' },
      } as never;
      const mockData = { messagesProcessed: 100, avgResponseTime: 2.5 };
      getAIReport.mockResolvedValue(mockData);

      const result = await controller.getAIReport(req);

      expect(getAIReport).toHaveBeenCalledWith('ws-1');
      expect(result).toEqual(mockData);
    });
  });

  describe('getDailyActivity', () => {
    it('calls analyticsService.getDailyActivity with workspaceId from authenticated user', async () => {
      const req = {
        user: { workspaceId: 'ws-1', sub: 'a-1', email: 'a@test.com', role: 'OWNER' },
      } as never;
      const mockData = [{ date: '2026-01-01', inbound: 5, outbound: 3 }];
      getDailyActivity.mockResolvedValue(mockData);

      const result = await controller.getDailyActivity(req);

      expect(getDailyActivity).toHaveBeenCalledWith('ws-1');
      expect(result).toEqual(mockData);
    });
  });
});
