import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('../auth/workspace-access', () => ({
  resolveWorkspaceId: jest.fn(),
}));

import { resolveWorkspaceId } from '../auth/workspace-access';
import { ChatController } from './chat.controller';
import { AuthenticatedRequest } from '../common/interfaces';

const resolveWorkspaceIdMock = resolveWorkspaceId as jest.Mock;

describe('ChatController', () => {
  let controller: ChatController;
  const getMessagesMock = jest.fn();
  const addMessageMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    resolveWorkspaceIdMock.mockReturnValue('ws-1');

    controller = new ChatController({
      getMessages: getMessagesMock,
      addMessage: addMessageMock,
    } as never);
  });

  describe('getMessages', () => {
    it('calls chatService.getMessages with resolved workspaceId and query params', async () => {
      const req = { user: { sub: 'user-1' } } as AuthenticatedRequest;
      getMessagesMock.mockResolvedValue({ items: [], nextCursor: null });

      await controller.getMessages('conv-1', { cursor: 'cur-1', limit: 25 }, req);

      expect(resolveWorkspaceIdMock).toHaveBeenCalledWith(req);
      expect(getMessagesMock).toHaveBeenCalledWith('ws-1', 'conv-1', 'cur-1', 25);
    });

    it('defaults limit to 50 when not provided', async () => {
      const req = {} as AuthenticatedRequest;
      getMessagesMock.mockResolvedValue({ items: [], nextCursor: null });

      await controller.getMessages('conv-1', {}, req);

      expect(getMessagesMock).toHaveBeenCalledWith('ws-1', 'conv-1', undefined, 50);
    });
  });

  describe('addMessage', () => {
    it('calls chatService.addMessage with resolved workspaceId and user identity', async () => {
      const req = { user: { sub: 'user-42' } } as AuthenticatedRequest;
      addMessageMock.mockResolvedValue({
        id: 'msg-1',
        role: 'user',
        content: 'hello',
        createdAt: new Date(),
        userId: 'user-42',
      });

      const result = await controller.addMessage('conv-1', { content: 'hello' }, req);

      expect(resolveWorkspaceIdMock).toHaveBeenCalledWith(req);
      expect(addMessageMock).toHaveBeenCalledWith('ws-1', 'conv-1', 'user-42', 'user', 'hello');
      expect(result.content).toBe('hello');
      expect(result.userId).toBe('user-42');
    });
  });

  describe('error propagation', () => {
    it('propagates errors from chatService.getMessages', async () => {
      const req = {} as AuthenticatedRequest;
      getMessagesMock.mockRejectedValue(new Error('Database offline'));

      await expect(
        controller.getMessages('conv-1', {}, req),
      ).rejects.toThrow('Database offline');
    });

    it('propagates errors from chatService.addMessage', async () => {
      const req = { user: { sub: 'user-1' } } as AuthenticatedRequest;
      addMessageMock.mockRejectedValue(new Error('Thread not found'));

      await expect(
        controller.addMessage('conv-1', { content: 'test' }, req),
      ).rejects.toThrow('Thread not found');
    });
  });

  describe('identity propagation', () => {
    it('flows req.user.sub into chatService.addMessage as userId', async () => {
      const req = { user: { sub: 'admin-777' } } as AuthenticatedRequest;
      addMessageMock.mockResolvedValue({
        id: 'msg-admin',
        role: 'user',
        content: 'cmd',
        createdAt: new Date(),
        userId: 'admin-777',
      });

      await controller.addMessage('conv-1', { content: 'cmd' }, req);

      const call = addMessageMock.mock.calls[0];
      expect(call[2]).toBe('admin-777');
    });
  });
});
