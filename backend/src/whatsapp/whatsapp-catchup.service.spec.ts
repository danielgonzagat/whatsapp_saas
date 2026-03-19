import { WhatsAppCatchupService } from './whatsapp-catchup.service';

describe('WhatsAppCatchupService', () => {
  const originalEnv = { ...process.env };

  let prisma: any;
  let whatsappApi: any;
  let inboundProcessor: any;
  let redis: any;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-19T12:00:00.000Z'));
    process.env.WAHA_CATCHUP_MAX_CHATS = '1';
    process.env.WAHA_CATCHUP_MAX_PASSES = '3';
    process.env.WAHA_CATCHUP_MAX_MESSAGES_PER_CHAT = '100';
    process.env.WAHA_CATCHUP_LOOKBACK_MS = `${24 * 60 * 60 * 1000}`;

    prisma = {
      workspace: {
        findUnique: jest.fn().mockResolvedValue({
          name: 'Workspace Teste',
          providerSettings: {
            whatsappApiSession: {
              connectedAt: '2026-03-19T12:00:00.000Z',
              lastUpdated: '2026-03-19T12:00:00.000Z',
            },
          },
        }),
        update: jest.fn().mockResolvedValue({}),
      },
    };

    whatsappApi = {
      getChats: jest.fn().mockResolvedValue([
        {
          id: '5511999999999@c.us',
          unreadCount: 1,
          timestamp: Date.now() - 60 * 60 * 1000,
        },
        {
          id: '5511888888888@c.us',
          unreadCount: 1,
          timestamp: Date.now() - 2 * 60 * 60 * 1000,
        },
      ]),
      getChatMessages: jest
        .fn()
        .mockImplementation(async (_workspaceId: string, chatId: string) => {
          if (chatId === '5511999999999@c.us') {
            return [
              {
                id: 'msg-1',
                from: '5511999999999@c.us',
                body: 'Oi, quero detalhes do produto',
                type: 'chat',
                timestamp: Date.now() - 60 * 60 * 1000,
              },
            ];
          }

          return [
            {
              id: 'msg-2',
              from: '5511888888888@c.us',
              body: 'Tem promoção?',
              type: 'chat',
              timestamp: Date.now() - 2 * 60 * 60 * 1000,
            },
          ];
        }),
      sendSeen: jest.fn().mockResolvedValue(undefined),
    };

    inboundProcessor = {
      process: jest.fn().mockResolvedValue({ deduped: false }),
    };

    redis = {
      get: jest.fn().mockResolvedValue('lock-token'),
      del: jest.fn().mockResolvedValue(1),
    };
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  it('uses lookback on first connect and drains chats across multiple passes', async () => {
    const service = new WhatsAppCatchupService(
      prisma,
      whatsappApi,
      inboundProcessor,
      redis,
    );

    await (service as any).runCatchup('ws-1', 'session_connected', 'lock-token');

    expect(inboundProcessor.process).toHaveBeenCalledTimes(2);
    expect(inboundProcessor.process).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        workspaceId: 'ws-1',
        providerMessageId: 'msg-1',
        text: 'Oi, quero detalhes do produto',
      }),
    );
    expect(inboundProcessor.process).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        workspaceId: 'ws-1',
        providerMessageId: 'msg-2',
        text: 'Tem promoção?',
      }),
    );
    expect(whatsappApi.sendSeen).toHaveBeenCalledTimes(2);
    expect(prisma.workspace.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ws-1' },
        data: expect.objectContaining({
          providerSettings: expect.objectContaining({
            whatsappApiSession: expect.objectContaining({
              lastCatchupImportedMessages: 2,
              lastCatchupTouchedChats: 2,
              lastCatchupOverflow: true,
            }),
          }),
        }),
      }),
    );
  });
});
