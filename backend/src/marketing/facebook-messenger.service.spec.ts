import { FacebookMessengerService } from './facebook-messenger.service';
import { partialMatch } from '../../test/helpers/match-instance';

describe('FacebookMessengerService', () => {
  const graphApiPost = jest.fn();
  const graphApiGet = jest.fn();

  const fbMessageCreate = jest.fn();
  const fbMessageFindMany = jest.fn();
  const fbMessageFindFirst = jest.fn();
  const fbMessageFindUnique = jest.fn();
  const fbMessageUpsert = jest.fn();
  const fbMessageUpdateMany = jest.fn();
  const fbMessageCount = jest.fn();
  const fbMessageGroupBy = jest.fn();
  const metaConnectionFindUnique = jest.fn();
  const metaConnectionFindFirst = jest.fn();

  let service: FacebookMessengerService;

  type PrismaWriteArg = {
    where: Record<string, unknown>;
    data: Record<string, unknown>;
    take?: number;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new FacebookMessengerService(
      {
        fbMessage: {
          create: fbMessageCreate,
          findMany: fbMessageFindMany,
          findFirst: fbMessageFindFirst,
          findUnique: fbMessageFindUnique,
          upsert: fbMessageUpsert,
          updateMany: fbMessageUpdateMany,
          count: fbMessageCount,
          groupBy: fbMessageGroupBy,
        },
        metaConnection: {
          findFirst: metaConnectionFindFirst,
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
          data: partialMatch({
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
          data: partialMatch({
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
          create: partialMatch({
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
          create: partialMatch({
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

      const [deliveredArg] = fbMessageUpdateMany.mock.calls[0] as [PrismaWriteArg];
      expect(fbMessageUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            workspaceId: 'ws-1',
            mid: { in: ['mid-1', 'mid-2'] },
            direction: 'OUTBOUND',
          },
          data: partialMatch({
            deliveryStatus: 'DELIVERED',
            deliveredAt: deliveredArg.data.deliveredAt,
          }),
        }),
      );
      expect(deliveredArg.data.deliveredAt).toBeInstanceOf(Date);
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

      const [readArg] = fbMessageUpdateMany.mock.calls[0] as [PrismaWriteArg];
      expect(fbMessageUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            workspaceId: 'ws-1',
            senderPsid: 'psid-user',
            deliveryStatus: 'DELIVERED',
          },
          data: partialMatch({
            deliveryStatus: 'READ',
            readAt: readArg.data.readAt,
          }),
        }),
      );
      expect(readArg.data.readAt).toBeInstanceOf(Date);
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
          where: partialMatch({ mid: { in: ['mid-1'] } }),
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
          data: partialMatch({ deliveryStatus: 'READ' }),
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
      metaConnectionFindFirst.mockResolvedValue({
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
      metaConnectionFindFirst.mockResolvedValue(null);

      const result = await service.getStatus('ws-1');

      expect(result).toEqual({
        connected: false,
        pageId: null,
        pageName: null,
      });
    });
  });

  describe('getSummary', () => {
    it('returns aggregated counters and ISO timestamps scoped to workspace when page is connected', async () => {
      metaConnectionFindFirst.mockResolvedValue({
        pageId: 'page-1',
        pageName: 'My Page',
      });
      // Order: inbound, outbound, delivered, read, failed, lastInbound, lastOutbound
      fbMessageCount
        .mockResolvedValueOnce(12)
        .mockResolvedValueOnce(7)
        .mockResolvedValueOnce(5)
        .mockResolvedValueOnce(3)
        .mockResolvedValueOnce(1);
      const inboundDate = new Date('2026-05-29T10:00:00.000Z');
      const outboundDate = new Date('2026-05-29T11:30:00.000Z');
      fbMessageFindFirst
        .mockResolvedValueOnce({ createdAt: inboundDate })
        .mockResolvedValueOnce({ createdAt: outboundDate });

      const result = await service.getSummary('ws-1');

      expect(result).toEqual({
        configured: true,
        pageId: 'page-1',
        pageName: 'My Page',
        totals: { inbound: 12, outbound: 7, delivered: 5, read: 3, failed: 1 },
        lastInboundAt: inboundDate.toISOString(),
        lastOutboundAt: outboundDate.toISOString(),
      });
      // every count must be scoped to workspaceId
      for (const call of fbMessageCount.mock.calls as [PrismaWriteArg][]) {
        expect(call[0]).toMatchObject({ where: partialMatch({ workspaceId: 'ws-1' }) });
      }
    });

    it('returns configured=false with zero counters when page is not connected', async () => {
      metaConnectionFindFirst.mockResolvedValue(null);
      fbMessageCount.mockResolvedValue(0);
      fbMessageFindFirst.mockResolvedValue(null);

      const result = await service.getSummary('ws-1');

      expect(result.configured).toBe(false);
      expect(result.pageId).toBeNull();
      expect(result.pageName).toBeNull();
      expect(result.totals).toEqual({ inbound: 0, outbound: 0, delivered: 0, read: 0, failed: 0 });
      expect(result.lastInboundAt).toBeNull();
      expect(result.lastOutboundAt).toBeNull();
    });
  });

  describe('getContacts', () => {
    it('returns distinct sender PSIDs with message counts and ISO last-inbound, ordered by recency', async () => {
      const lastA = new Date('2026-05-29T12:00:00.000Z');
      const lastB = new Date('2026-05-29T11:00:00.000Z');
      fbMessageGroupBy.mockResolvedValue([
        { senderPsid: 'psid-A', _count: { id: 4 }, _max: { createdAt: lastA } },
        { senderPsid: 'psid-B', _count: { id: 2 }, _max: { createdAt: lastB } },
      ]);

      const result = await service.getContacts('ws-1', { pageId: 'page-1', limit: 50 });

      expect(fbMessageGroupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          by: ['senderPsid'],
          where: partialMatch({
            workspaceId: 'ws-1',
            direction: 'INBOUND',
            senderPsid: { not: null },
            pageId: 'page-1',
          }),
          orderBy: { _max: { createdAt: 'desc' } },
          take: 50,
        }),
      );
      expect(result).toEqual([
        { psid: 'psid-A', messageCount: 4, lastInboundAt: lastA.toISOString() },
        { psid: 'psid-B', messageCount: 2, lastInboundAt: lastB.toISOString() },
      ]);
    });

    it('omits pageId from where clause when not provided', async () => {
      fbMessageGroupBy.mockResolvedValue([]);

      await service.getContacts('ws-1', { limit: 25 });

      const [callArg] = fbMessageGroupBy.mock.calls[0] as [PrismaWriteArg];
      expect(callArg.where).not.toHaveProperty('pageId');
      expect(callArg.take).toBe(25);
    });

    it('filters out grouped rows with null senderPsid defensively', async () => {
      fbMessageGroupBy.mockResolvedValue([
        { senderPsid: null, _count: { id: 99 }, _max: { createdAt: new Date() } },
        {
          senderPsid: 'psid-real',
          _count: { id: 1 },
          _max: { createdAt: new Date('2026-05-29T00:00:00.000Z') },
        },
      ]);

      const result = await service.getContacts('ws-1', { limit: 10 });

      expect(result).toEqual([
        {
          psid: 'psid-real',
          messageCount: 1,
          lastInboundAt: '2026-05-29T00:00:00.000Z',
        },
      ]);
    });
  });
});
