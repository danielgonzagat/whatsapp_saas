import { FacebookMessengerService } from './facebook-messenger.service';

describe('FacebookMessengerService', () => {
  const graphApiPost = jest.fn();
  const graphApiGet = jest.fn();

  const fbMessageCreate = jest.fn();
  const fbMessageFindMany = jest.fn();
  const fbMessageFindUnique = jest.fn();
  const fbMessageUpsert = jest.fn();
  const fbMessageUpdateMany = jest.fn();
  const metaConnectionFindUnique = jest.fn();

  let service: FacebookMessengerService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new FacebookMessengerService(
      {
        fbMessage: {
          create: fbMessageCreate,
          findMany: fbMessageFindMany,
          findUnique: fbMessageFindUnique,
          upsert: fbMessageUpsert,
          updateMany: fbMessageUpdateMany,
        },
        metaConnection: {
          findUnique: metaConnectionFindUnique,
        },
      } as never,
      {
        graphApiPost,
        graphApiGet,
      } as never,
    );
  });

  describe('sendMessage', () => {
    it('sends a message successfully and records OUTBOUND SENT delivery', async () => {
      graphApiPost.mockResolvedValue({ message_id: 'mid-1' });
      fbMessageCreate.mockResolvedValue({});

      const result = await service.sendMessage(
        'ws-1',
        'page-1',
        'psid-1',
        'Hello there',
        'token-abc',
      );

      expect(graphApiPost).toHaveBeenCalledWith(
        'page-1/messages',
        {
          recipient: { id: 'psid-1' },
          message: { text: 'Hello there' },
          messaging_type: 'RESPONSE',
        },
        'token-abc',
      );
      expect(fbMessageCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            workspaceId: 'ws-1',
            pageId: 'page-1',
            direction: 'OUTBOUND',
            deliveryStatus: 'SENT',
            mid: 'mid-1',
          }),
        }),
      );
      expect(result).toEqual({ mid: 'mid-1', error: null });
    });

    it('records failed delivery when Meta API returns error', async () => {
      graphApiPost.mockResolvedValue({
        error: { message: 'Invalid PSID', type: 'OAuthException', code: 100 },
      });
      fbMessageCreate.mockResolvedValue({});

      const result = await service.sendMessage('ws-1', 'page-1', 'psid-1', 'Hello', 'token-abc');

      expect(fbMessageCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            deliveryStatus: 'FAILED',
            errorCode: '100',
            errorMessage: 'Invalid PSID',
          }),
        }),
      );
      expect(result).toEqual({ mid: null, error: 'Invalid PSID' });
    });

    it('returns mid null when response has no message_id but no error', async () => {
      graphApiPost.mockResolvedValue({});
      fbMessageCreate.mockResolvedValue({});

      const result = await service.sendMessage('ws-1', 'page-1', 'psid-1', 'Hello', 'token-abc');

      expect(result).toEqual({ mid: null, error: null });
    });
  });

  describe('processIncomingMessage', () => {
    it('deduplicates via workspaceId_mid compound key', async () => {
      const msg = {
        sender: { id: 'psid-sender', name: 'Alice' },
        recipient: { id: 'page-1' },
        timestamp: 1712345678,
        message: { mid: 'inbound-mid-1', text: 'Hello support' },
      };
      fbMessageUpsert.mockResolvedValue({});

      await service.processIncomingMessage('ws-1', 'page-1', msg);

      expect(fbMessageUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workspaceId_mid: { workspaceId: 'ws-1', mid: 'inbound-mid-1' } },
          create: expect.objectContaining({
            direction: 'INBOUND',
            deliveryStatus: 'DELIVERED',
            text: 'Hello support',
          }),
        }),
      );
    });

    it('resolves silently when mid is empty', async () => {
      const msg = {
        sender: { id: 'psid-sender' },
        message: {},
      };

      const result = await service.processIncomingMessage('ws-1', 'page-1', msg);

      expect(fbMessageUpsert).not.toHaveBeenCalled();
      expect(result).toBeUndefined();
    });

    it('stores text as null when message has no text content', async () => {
      const msg = {
        sender: { id: 'psid-sender' },
        recipient: { id: 'page-1' },
        message: { mid: 'attachment-only' },
      };
      fbMessageUpsert.mockResolvedValue({});

      await service.processIncomingMessage('ws-1', 'page-1', msg);

      expect(fbMessageUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            text: null,
          }),
        }),
      );
    });
  });

  describe('processDeliveryReceipt', () => {
    it('updates OUTBOUND messages to DELIVERED for matching mids', async () => {
      fbMessageUpdateMany.mockResolvedValue({ count: 2 });

      await service.processDeliveryReceipt('ws-1', {
        delivery: { mids: ['mid-1', 'mid-2'], watermark: 12345 },
      });

      expect(fbMessageUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            workspaceId: 'ws-1',
            mid: { in: ['mid-1', 'mid-2'] },
            direction: 'OUTBOUND',
          },
          data: expect.objectContaining({
            deliveryStatus: 'DELIVERED',
            deliveredAt: expect.any(Date),
          }),
        }),
      );
    });

    it('skips update when mids array is empty', async () => {
      await service.processDeliveryReceipt('ws-1', {
        delivery: { mids: [], watermark: 12345 },
      });

      expect(fbMessageUpdateMany).not.toHaveBeenCalled();
    });

    it('skips update when delivery field is absent', async () => {
      await service.processDeliveryReceipt('ws-1', {});

      expect(fbMessageUpdateMany).not.toHaveBeenCalled();
    });
  });

  describe('processReadReceipt', () => {
    it('updates DELIVERED messages to READ for the sender', async () => {
      fbMessageUpdateMany.mockResolvedValue({ count: 1 });

      await service.processReadReceipt('ws-1', {
        sender: { id: 'psid-user' },
        read: { watermark: 1712350000 },
      });

      expect(fbMessageUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            workspaceId: 'ws-1',
            senderPsid: 'psid-user',
            deliveryStatus: 'DELIVERED',
          },
          data: expect.objectContaining({
            deliveryStatus: 'READ',
            readAt: expect.any(Date),
          }),
        }),
      );
    });

    it('skips when watermark is absent', async () => {
      await service.processReadReceipt('ws-1', {
        sender: { id: 'psid-user' },
        read: {},
      });

      expect(fbMessageUpdateMany).not.toHaveBeenCalled();
    });
  });

  describe('processWebhookEvent', () => {
    it('routes incoming message events to processIncomingMessage', async () => {
      fbMessageFindUnique.mockResolvedValue(null);
      fbMessageUpsert.mockResolvedValue({});

      await service.processWebhookEvent('ws-1', 'page-1', {
        sender: { id: 'psid-sender' },
        recipient: { id: 'page-1' },
        message: { mid: 'msg-1', text: 'Hi' },
      });

      expect(fbMessageUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workspaceId_mid: { workspaceId: 'ws-1', mid: 'msg-1' } },
        }),
      );
    });

    it('routes delivery events to processDeliveryReceipt', async () => {
      fbMessageUpdateMany.mockResolvedValue({ count: 1 });

      await service.processWebhookEvent('ws-1', 'page-1', {
        delivery: { mids: ['mid-1'], watermark: 12345 },
      });

      expect(fbMessageUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ mid: { in: ['mid-1'] } }),
        }),
      );
    });

    it('routes read events to processReadReceipt', async () => {
      fbMessageUpdateMany.mockResolvedValue({ count: 2 });

      await service.processWebhookEvent('ws-1', 'page-1', {
        sender: { id: 'psid-user' },
        read: { watermark: 1712350000 },
      });

      expect(fbMessageUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ deliveryStatus: 'READ' }),
        }),
      );
    });

    it('skips duplicate incoming messages that already exist', async () => {
      fbMessageFindUnique.mockResolvedValue({ id: 'existing-1' });

      await service.processWebhookEvent('ws-1', 'page-1', {
        sender: { id: 'psid-sender' },
        message: { mid: 'existing-mid', text: 'Hi' },
      });

      expect(fbMessageUpsert).not.toHaveBeenCalled();
    });
  });

  describe('getMessages', () => {
    it('returns paginated messages with cursor support', async () => {
      fbMessageFindMany.mockResolvedValue([
        { id: 'msg-1', text: 'Hello', createdAt: new Date() },
        { id: 'msg-2', text: 'Hi', createdAt: new Date() },
      ]);

      const result = await service.getMessages('ws-1', 'page-1', {
        limit: 10,
        before: 'cursor-1',
      });

      expect(fbMessageFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workspaceId: 'ws-1', pageId: 'page-1' },
          orderBy: { createdAt: 'desc' },
          take: 10,
          cursor: { id: 'cursor-1' },
          skip: 1,
        }),
      );
      expect(result).toHaveLength(2);
    });

    it('defaults to limit 50 when no options provided', async () => {
      fbMessageFindMany.mockResolvedValue([]);

      await service.getMessages('ws-1', 'page-1');

      expect(fbMessageFindMany).toHaveBeenCalledWith(expect.objectContaining({ take: 50 }));
    });
  });

  describe('getStatus', () => {
    it('returns connected true with page info', async () => {
      metaConnectionFindUnique.mockResolvedValue({
        pageId: 'page-1',
        pageName: 'My Page',
      });

      const result = await service.getStatus('ws-1');

      expect(result).toEqual({
        connected: true,
        pageId: 'page-1',
        pageName: 'My Page',
      });
    });

    it('returns connected false when no page connection exists', async () => {
      metaConnectionFindUnique.mockResolvedValue(null);

      const result = await service.getStatus('ws-1');

      expect(result).toEqual({
        connected: false,
        pageId: null,
        pageName: null,
      });
    });
  });
});
