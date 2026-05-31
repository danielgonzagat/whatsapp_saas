import { TikTokInboxController } from './tiktok-inbox.controller';
import type { TikTokInboxService } from './tiktok-inbox.service';

describe('TikTokInboxController', () => {
  const getStatus = jest.fn();
  const listMessages = jest.fn();
  const listConversations = jest.fn();
  const sendMessage = jest.fn();

  let controller: TikTokInboxController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new TikTokInboxController({
      getStatus,
      listMessages,
      listConversations,
      sendMessage,
    } as unknown as TikTokInboxService);
  });

  const req = { user: { workspaceId: 'ws-1' }, headers: {} } as never;

  describe('GET status', () => {
    it('forwards workspaceId to service', async () => {
      getStatus.mockResolvedValueOnce({
        channel: 'tiktok',
        connection: { connected: false, status: 'disconnected' },
        capabilities: { inbox: false, messages: false, send: false },
        pending: { reason: 'channel_pending', detail: 'pending' },
      });

      const result = await controller.getStatus(req);

      expect(getStatus).toHaveBeenCalledWith('ws-1');
      expect(result.channel).toBe('tiktok');
      expect(result.capabilities.send).toBe(false);
    });
  });

  describe('GET messages', () => {
    it('returns honest channel_pending payload', async () => {
      listMessages.mockResolvedValueOnce({
        ok: false,
        reason: 'channel_pending',
        channel: 'tiktok',
        detail: 'pending',
        connection: { connected: false, status: 'disconnected', kind: null, configReady: false },
      });

      const result = await controller.listMessages(req);

      expect(listMessages).toHaveBeenCalledWith('ws-1');
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('channel_pending');
    });
  });

  describe('GET conversations', () => {
    it('returns honest channel_pending payload', async () => {
      listConversations.mockResolvedValueOnce({
        ok: false,
        reason: 'channel_pending',
        channel: 'tiktok',
        detail: 'pending',
        connection: { connected: false, status: 'disconnected', kind: null, configReady: false },
      });

      const result = await controller.listConversations(req);

      expect(listConversations).toHaveBeenCalledWith('ws-1');
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('channel_pending');
    });
  });

  describe('POST send', () => {
    it('forwards DTO fields to service and returns channel_pending', async () => {
      sendMessage.mockResolvedValueOnce({
        ok: false,
        reason: 'channel_pending',
        channel: 'tiktok',
        detail: 'pending',
        connection: { connected: false, status: 'disconnected', kind: null, configReady: false },
      });

      const result = await controller.sendMessage(req, { recipientId: 'user-42', text: 'oi' });

      expect(sendMessage).toHaveBeenCalledWith('ws-1', 'user-42', 'oi');
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('channel_pending');
    });
  });

  describe('error propagation', () => {
    it('rejects when service throws', async () => {
      getStatus.mockRejectedValueOnce(new Error('prisma offline'));
      await expect(controller.getStatus(req)).rejects.toThrow('prisma offline');
    });
  });
});
