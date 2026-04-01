jest.mock('./openai-wrapper', () => ({
  chatCompletionWithFallback: jest.fn(),
  callOpenAIWithRetry: jest.fn(),
}));

import { KloelService } from './kloel.service';
import { chatCompletionWithFallback } from './openai-wrapper';

describe('KloelService', () => {
  let service: KloelService;
  let prisma: any;
  let whatsappService: any;
  let unifiedAgentService: any;

  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'test-key';

    prisma = {
      kloelMessage: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({}),
      },
      product: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      workspace: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      flow: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
      contact: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      message: {
        create: jest.fn(),
        update: jest.fn(),
      },
    };

    whatsappService = {
      listChats: jest.fn().mockResolvedValue([
        {
          id: '5511999991111@c.us',
          phone: '5511999991111',
          name: 'Alice',
          unreadCount: 2,
          pending: true,
        },
        {
          id: '5511999992222@c.us',
          phone: '5511999992222',
          name: 'Bob',
          unreadCount: 1,
          pending: true,
        },
      ]),
    };

    unifiedAgentService = {
      executeTool: jest.fn().mockResolvedValue({ error: 'Unknown tool' }),
    };

    service = new KloelService(
      prisma,
      { createSmartPayment: jest.fn() } as any,
      whatsappService,
      {
        getSessionStatus: jest.fn(),
        startSession: jest.fn(),
      } as any,
      unifiedAgentService,
      { textToSpeech: jest.fn(), transcribeAudio: jest.fn() } as any,
      { trackAiUsage: jest.fn().mockResolvedValue(undefined) } as any,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('executes real WhatsApp tools inside the think loop instead of only generating text', async () => {
    (chatCompletionWithFallback as jest.Mock)
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: '',
              tool_calls: [
                {
                  id: 'call-1',
                  function: {
                    name: 'list_whatsapp_chats',
                    arguments: JSON.stringify({ limit: 2 }),
                  },
                },
              ],
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content:
                'Encontrei 2 conversas pendentes e já posso agir sobre elas.',
            },
          },
        ],
      });

    const writes: string[] = [];
    const response = {
      setHeader: jest.fn(),
      write: jest.fn((chunk: string) => {
        writes.push(chunk);
        return true;
      }),
      end: jest.fn(),
    };

    await service.think(
      {
        workspaceId: 'ws-1',
        message: 'o que está pendente no whatsapp?',
        mode: 'chat',
      },
      response as any,
    );

    const events = writes
      .join('')
      .split('\n\n')
      .filter(Boolean)
      .map((block) => JSON.parse(block.replace(/^data: /, '')));

    expect(whatsappService.listChats).toHaveBeenCalledWith('ws-1');
    expect(unifiedAgentService.executeTool).toHaveBeenCalledWith(
      'list_whatsapp_chats',
      { limit: 2 },
      expect.objectContaining({ workspaceId: 'ws-1' }),
    );
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'tool_call',
          tool: 'list_whatsapp_chats',
        }),
        expect.objectContaining({
          type: 'tool_result',
          tool: 'list_whatsapp_chats',
          success: true,
        }),
        expect.objectContaining({
          content:
            'Encontrei 2 conversas pendentes e já posso agir sobre elas.',
        }),
        expect.objectContaining({
          done: true,
        }),
      ]),
    );
    expect(response.end).toHaveBeenCalled();
  });
});
