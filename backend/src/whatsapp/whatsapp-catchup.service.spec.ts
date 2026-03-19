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
    process.env.WAHA_CATCHUP_MAX_MESSAGES_PER_CHAT = '2';
    process.env.WAHA_CATCHUP_MAX_PAGES_PER_CHAT = '3';
    process.env.WAHA_CATCHUP_LOOKBACK_MS = `${60 * 60 * 1000}`;

    prisma = {
      workspace: {
        findUnique: jest.fn().mockResolvedValue({
          name: 'Workspace Teste',
          providerSettings: { whatsappApiSession: {} },
        }),
        update: jest.fn().mockResolvedValue({}),
      },
    };

    whatsappApi = {
      getChats: jest.fn().mockResolvedValue([
        {
          id: '5511999999999@c.us',
          unreadCount: 3,
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
        .mockImplementation(
          async (
            _workspaceId: string,
            chatId: string,
            options?: { limit?: number; offset?: number },
          ) => {
            const offset = options?.offset || 0;
          if (chatId === '5511999999999@c.us') {
              const pages = [
                [
                  {
                    id: 'msg-1',
                    from: '5511999999999@c.us',
                    body: 'Oi, quero detalhes do produto',
                    type: 'chat',
                    timestamp: Date.now() - 2 * 60 * 60 * 1000,
                  },
                  {
                    id: 'msg-1b',
                    from: '5511999999999@c.us',
                    body: 'Também quero saber o preço',
                    type: 'chat',
                    timestamp: Date.now() - 90 * 60 * 1000,
                  },
                ],
                [
                  {
                    id: 'msg-1c',
                    from: '5511999999999@c.us',
                    body: 'Pode me explicar como funciona?',
                    type: 'chat',
                    timestamp: Date.now() - 80 * 60 * 1000,
                  },
                ],
              ];
              return pages[Math.floor(offset / 2)] || [];
          }

          return [
            {
              id: 'msg-2',
              from: '5511888888888@c.us',
              body: 'Tem promoção?',
              type: 'chat',
              timestamp: Date.now() - 10 * 60 * 1000,
            },
          ];
          },
        ),
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

  it('imports unread backlog older than lookback and paginates until draining the chat', async () => {
    const service = new WhatsAppCatchupService(
      prisma,
      whatsappApi,
      inboundProcessor,
      redis,
    );

    await (service as any).runCatchup('ws-1', 'session_connected', 'lock-token');

    expect(inboundProcessor.process).toHaveBeenCalledTimes(4);
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
        providerMessageId: 'msg-1b',
        text: 'Também quero saber o preço',
      }),
    );
    expect(inboundProcessor.process).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        workspaceId: 'ws-1',
        providerMessageId: 'msg-1c',
        text: 'Pode me explicar como funciona?',
      }),
    );
    expect(inboundProcessor.process).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({
        workspaceId: 'ws-1',
        providerMessageId: 'msg-2',
        text: 'Tem promoção?',
      }),
    );
    expect(whatsappApi.sendSeen).toHaveBeenCalledTimes(2);
    expect(whatsappApi.getChatMessages).toHaveBeenCalledWith(
      'ws-1',
      '5511999999999@c.us',
      { limit: 2, offset: 0 },
    );
    expect(whatsappApi.getChatMessages).toHaveBeenCalledWith(
      'ws-1',
      '5511999999999@c.us',
      { limit: 2, offset: 2 },
    );
    expect(prisma.workspace.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ws-1' },
        data: expect.objectContaining({
          providerSettings: expect.objectContaining({
            whatsappApiSession: expect.objectContaining({
              lastCatchupImportedMessages: 4,
              lastCatchupTouchedChats: 2,
              lastCatchupOverflow: true,
            }),
          }),
        }),
      }),
    );
  });
});
