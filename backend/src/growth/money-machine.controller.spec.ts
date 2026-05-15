import { MoneyMachineController } from './money-machine.controller';

describe('MoneyMachineController', () => {
  const activateMachine = jest.fn();
  const getDailyReport = jest.fn();

  let controller: MoneyMachineController;

  beforeEach(() => {
    jest.clearAllMocks();

    controller = new MoneyMachineController({
      activateMachine,
      getDailyReport,
    } as never);
  });

  describe('POST /activate', () => {
    it('calls activateMachine with the workspaceId from req.user', async () => {
      const req = { user: { sub: 'u-1', workspaceId: 'ws-1' }, headers: {} } as never;
      activateMachine.mockResolvedValue({ status: 'ACTIVE', found: { inactiveLeads: 5 } });

      const result = await controller.activate(req);

      expect(activateMachine).toHaveBeenCalledTimes(1);
      expect(activateMachine).toHaveBeenCalledWith('ws-1');
      expect(result).toEqual({ status: 'ACTIVE', found: { inactiveLeads: 5 } });
    });
  });

  describe('GET /report', () => {
    it('calls getDailyReport with the workspaceId from req.user', async () => {
      const req = { user: { sub: 'u-2', workspaceId: 'ws-2' }, headers: {} } as never;
      getDailyReport.mockResolvedValue({ workspaceId: 'ws-2', sent: 10, inbound: 3 });

      const result = await controller.getReport(req);

      expect(getDailyReport).toHaveBeenCalledTimes(1);
      expect(getDailyReport).toHaveBeenCalledWith('ws-2');
      expect(result).toEqual({ workspaceId: 'ws-2', sent: 10, inbound: 3 });
    });
  });

  describe('error propagation', () => {
    it('propagates the error when activateMachine rejects', async () => {
      const req = { user: { sub: 'u-1', workspaceId: 'ws-1' }, headers: {} } as never;
      const error = new Error('Machine overload');
      activateMachine.mockRejectedValue(error);

      await expect(controller.activate(req)).rejects.toThrow('Machine overload');
    });

    it('propagates the error when getDailyReport rejects', async () => {
      const req = { user: { sub: 'u-1', workspaceId: 'ws-1' }, headers: {} } as never;
      const error = new Error('Report unavailable');
      getDailyReport.mockRejectedValue(error);

      await expect(controller.getReport(req)).rejects.toThrow('Report unavailable');
    });
  });

  describe('identity propagation', () => {
    it('passes distinct workspaceIds from different users to separate service calls', async () => {
      const adminReq = { user: { sub: 'admin-1', workspaceId: 'ws-admin' }, headers: {} } as never;
      const memberReq = { user: { sub: 'member-2', workspaceId: 'ws-member' }, headers: {} } as never;

      activateMachine.mockResolvedValue({ status: 'IDLE' });

      await controller.activate(adminReq);
      await controller.activate(memberReq);

      expect(activateMachine).toHaveBeenCalledTimes(2);
      expect(activateMachine).toHaveBeenNthCalledWith(1, 'ws-admin');
      expect(activateMachine).toHaveBeenNthCalledWith(2, 'ws-member');
    });
  });
});
