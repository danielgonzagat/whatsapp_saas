import { BadRequestException } from '@nestjs/common';

jest.mock('@sentry/node', () => ({}), { virtual: true });
jest.mock('../../observability/ops-alert.service', () => ({
  OpsAlertService: jest.fn(),
  AlertSeverity: { INFO: 'info', WARN: 'warn', CRITICAL: 'critical' },
}));

import { MessengerController } from './messenger.controller';

const sendTextMessage = jest.fn();
const sendMediaMessage = jest.fn();
const getConversations = jest.fn();
const resolveConnection = jest.fn();

describe('MessengerController', () => {
  let controller: MessengerController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new MessengerController(
      { sendTextMessage, sendMediaMessage, getConversations } as never,
      { resolveConnection } as never,
    );
  });

  const mockReq = (overrides: Record<string, unknown> = {}) => ({
    user: { sub: 'u-1', workspaceId: 'ws-1' },
    headers: {},
    ...overrides,
  });

  describe('sendMessage', () => {
    it('sends text message with correct args', async () => {
      resolveConnection.mockResolvedValueOnce({
        accessToken: 'at-1',
        pageId: 'page-1',
      });
      sendTextMessage.mockResolvedValueOnce({ id: 'msg-1' });

      const req = mockReq();
      const body = { recipientId: 'rec-1', text: 'Hello' };
      const result = await controller.sendMessage(req as never, body as never);

      expect(resolveConnection).toHaveBeenCalledWith('ws-1', 'facebook');
      expect(sendTextMessage).toHaveBeenCalledWith('page-1', 'rec-1', 'Hello', 'at-1');
      expect(result).toEqual({ id: 'msg-1' });
    });

    it('sends media message when mediaType and mediaUrl are provided', async () => {
      resolveConnection.mockResolvedValueOnce({
        accessToken: 'at-2',
        pageId: 'page-2',
      });
      sendMediaMessage.mockResolvedValueOnce({ id: 'msg-2' });

      const req = mockReq();
      const body = { recipientId: 'rec-2', mediaType: 'image', mediaUrl: 'http://example.com/img' };
      const result = await controller.sendMessage(req as never, body as never);

      expect(sendMediaMessage).toHaveBeenCalledWith(
        'page-2',
        'rec-2',
        'image',
        'http://example.com/img',
        'at-2',
      );
      expect(result).toEqual({ id: 'msg-2' });
    });

    it('throws BadRequestException when no access token', async () => {
      resolveConnection.mockResolvedValueOnce({
        accessToken: '',
        pageId: 'page-3',
      });

      const req = mockReq();
      await expect(
        controller.sendMessage(req as never, { recipientId: 'rec-3', text: 'Hello' } as never),
      ).rejects.toThrow(BadRequestException);
    });

    it('propagates service error', async () => {
      resolveConnection.mockResolvedValueOnce({
        accessToken: 'at-4',
        pageId: 'page-4',
      });
      sendTextMessage.mockRejectedValueOnce(new Error('Graph API down'));

      const req = mockReq();
      await expect(
        controller.sendMessage(req as never, { recipientId: 'rec-4', text: 'Hi' } as never),
      ).rejects.toThrow('Graph API down');
    });

    it('resolves workspaceId from token user', async () => {
      resolveConnection.mockResolvedValueOnce({
        accessToken: 'at-5',
        pageId: 'page-5',
      });
      sendTextMessage.mockResolvedValueOnce({ id: 'msg-5' });

      const req = mockReq({ user: { sub: 'u-2', workspaceId: 'ws-custom' } });
      await controller.sendMessage(req as never, { recipientId: 'rec-5', text: 'Yo' } as never);

      expect(resolveConnection).toHaveBeenCalledWith('ws-custom', 'facebook');
    });
  });

  describe('getConversations', () => {
    it('retrieves conversations with correct args', async () => {
      resolveConnection.mockResolvedValueOnce({
        accessToken: 'at-c1',
        pageId: 'page-c1',
      });
      getConversations.mockResolvedValueOnce([{ id: 'conv-1' }]);

      const req = mockReq();
      const result = await controller.getConversations(req as never, 'page-custom');

      expect(resolveConnection).toHaveBeenCalledWith('ws-1', 'facebook');
      expect(getConversations).toHaveBeenCalledWith('page-custom', 'at-c1');
      expect(result).toEqual([{ id: 'conv-1' }]);
    });

    it('throws BadRequestException when no access token', async () => {
      resolveConnection.mockResolvedValueOnce({
        accessToken: '',
        pageId: null,
      });

      const req = mockReq();
      await expect(controller.getConversations(req as never, 'page-fail')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('propagates service error for getConversations', async () => {
      resolveConnection.mockResolvedValueOnce({
        accessToken: 'at-c3',
        pageId: 'page-c3',
      });
      getConversations.mockRejectedValueOnce(new Error('Conversations API down'));

      const req = mockReq();
      await expect(controller.getConversations(req as never, 'page-c3')).rejects.toThrow(
        'Conversations API down',
      );
    });
  });
});
