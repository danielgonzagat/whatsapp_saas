jest.mock('../auth/workspace-access', () => ({
  resolveWorkspaceId: jest.fn(),
}));

jest.mock('../common/throttler/route-class.decorator', () => ({
  RouteClass: () => () => {},
}));

import { resolveWorkspaceId } from '../auth/workspace-access';
import { FollowUpController } from './followup.controller';

const resolveWorkspaceIdMock = resolveWorkspaceId as jest.Mock;

describe('FollowUpController', () => {
  const listMock = jest.fn();
  const createMock = jest.fn();
  const updateMock = jest.fn();
  const cancelMock = jest.fn();
  const getStatsMock = jest.fn();

  let controller: FollowUpController;

  beforeEach(() => {
    jest.clearAllMocks();
    resolveWorkspaceIdMock.mockReturnValue('ws-1');

    controller = new FollowUpController({
      list: listMock,
      create: createMock,
      update: updateMock,
      cancel: cancelMock,
      getStats: getStatsMock,
    } as never);
  });

  const mockReq = { user: { sub: 'u-1', workspaceId: 'ws-1' }, headers: {} } as never;

  describe('GET /followups (list)', () => {
    it('calls service.list with resolved workspaceId and optional status filter', async () => {
      listMock.mockResolvedValue([{ id: 'f-1', status: 'pending' }]);

      const result = await controller.list(mockReq, undefined, 'pending');

      expect(resolveWorkspaceIdMock).toHaveBeenCalledWith(mockReq, undefined);
      expect(listMock).toHaveBeenCalledWith('ws-1', 'pending');
      expect(result).toEqual([{ id: 'f-1', status: 'pending' }]);
    });

    it('propagates rejection from service.list', async () => {
      listMock.mockRejectedValue(new Error('DB error'));

      await expect(controller.list(mockReq)).rejects.toThrow('DB error');
    });
  });

  describe('GET /followups/stats', () => {
    it('calls service.getStats with resolved workspaceId', async () => {
      getStatsMock.mockResolvedValue({ pending: 3, sent: 7, cancelled: 1, total: 11 });

      const result = await controller.stats(mockReq);

      expect(resolveWorkspaceIdMock).toHaveBeenCalledWith(mockReq, undefined);
      expect(getStatsMock).toHaveBeenCalledWith('ws-1');
      expect(result).toEqual({ pending: 3, sent: 7, cancelled: 1, total: 11 });
    });
  });

  describe('POST /followups (create)', () => {
    it('calls service.create with resolved workspaceId and dto (workspaceId stripped from body)', async () => {
      createMock.mockResolvedValue({ id: 'f-2', status: 'pending' });
      const dto = {
        contactId: 'c-1',
        scheduledFor: new Date(),
        message: 'Hello',
        workspaceId: 'ws-1',
      };

      const result = await controller.create(mockReq, dto);
      const { workspaceId, ...expectedRest } = dto;

      expect(resolveWorkspaceIdMock).toHaveBeenCalledWith(mockReq, 'ws-1');
      expect(createMock).toHaveBeenCalledWith('ws-1', expectedRest);
      expect(result).toEqual({ id: 'f-2', status: 'pending' });
    });

    it('propagates rejection from service.create', async () => {
      createMock.mockRejectedValue(new Error('Creation failed'));
      const dto = { contactId: 'c-1', scheduledFor: new Date() };

      await expect(controller.create(mockReq, dto)).rejects.toThrow('Creation failed');
    });
  });

  describe('PATCH /followups/:id (update)', () => {
    it('calls service.update with resolved workspaceId, id and dto (workspaceId stripped)', async () => {
      updateMock.mockResolvedValue({ id: 'f-3', status: 'sent' });
      const dto = { message: 'Updated', workspaceId: 'ws-1' };

      const result = await controller.update(mockReq, 'f-3', dto);
      const { workspaceId, ...expectedRest } = dto;

      expect(resolveWorkspaceIdMock).toHaveBeenCalledWith(mockReq, 'ws-1');
      expect(updateMock).toHaveBeenCalledWith('ws-1', 'f-3', expectedRest);
      expect(result).toEqual({ id: 'f-3', status: 'sent' });
    });
  });

  describe('DELETE /followups/:id (cancel)', () => {
    it('calls service.cancel with resolved workspaceId and id', async () => {
      cancelMock.mockResolvedValue({ id: 'f-4', status: 'cancelled' });

      const result = await controller.cancel(mockReq, 'f-4', undefined);

      expect(resolveWorkspaceIdMock).toHaveBeenCalledWith(mockReq, undefined);
      expect(cancelMock).toHaveBeenCalledWith('ws-1', 'f-4');
      expect(result).toEqual({ id: 'f-4', status: 'cancelled' });
    });
  });
});
