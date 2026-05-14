import { LeadsController } from './leads.controller';

describe('LeadsController', () => {
  describe('list', () => {
    let controller: LeadsController;
    const listLeads = jest.fn();

    beforeEach(() => {
      jest.clearAllMocks();
      controller = new LeadsController({ listLeads } as never);
    });

    it('calls service with workspaceId and all options and returns data', async () => {
      const leads = [{ id: 'l-1', phone: '+5511987654321', status: 'active' }];
      listLeads.mockResolvedValue(leads);

      const result = await controller.list('ws-1', 'active', 'john', 10);

      expect(listLeads).toHaveBeenCalledWith('ws-1', {
        status: 'active',
        search: 'john',
        limit: 10,
      });
      expect(result).toBe(leads);
    });

    it('calls service with workspaceId and default limit when no optional params', async () => {
      listLeads.mockResolvedValue([]);

      await controller.list('ws-1');

      expect(listLeads).toHaveBeenCalledWith('ws-1', {
        limit: 20,
      });
    });

    it('spreads only status when search is undefined', async () => {
      listLeads.mockResolvedValue([]);

      await controller.list('ws-1', 'active');

      expect(listLeads).toHaveBeenCalledWith('ws-1', {
        status: 'active',
        limit: 20,
      });
    });

    it('propagates error when service rejects', async () => {
      const error = new Error('db connection lost');
      listLeads.mockRejectedValue(error);

      await expect(controller.list('ws-1')).rejects.toBe(error);
    });
  });
});
