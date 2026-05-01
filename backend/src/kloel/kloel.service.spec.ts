jest.mock('./openai-wrapper', () => ({
  chatCompletionWithFallback: jest.fn(),
  chatCompletionStreamWithRetry: jest.fn(),
}));

import { KloelService } from './kloel.service';
import { KloelThinkerService } from './kloel-thinker.service';
import { KloelReplyEngineService } from './kloel-reply-engine.service';
import { KloelThreadService } from './kloel-thread.service';
import { KloelWhatsAppToolsService } from './kloel-whatsapp-tools.service';
import { chatCompletionStreamWithRetry, chatCompletionWithFallback } from './openai-wrapper';

import type { KloelPrismaMock } from './__companions__/kloel.service.spec.companion';

describe('KloelService', () => {
  let service: KloelService;
  let prisma: KloelPrismaMock;
  let whatsappService: { listChats: jest.Mock };
  let unifiedAgentService: { executeTool: jest.Mock };
  let threadService: KloelThreadService;
  let replyEngineService: KloelReplyEngineService;
  let thinkerService: KloelThinkerService;
  let whatsappToolsService: KloelWhatsAppToolsService;

  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'test-key';

    prisma = {
      chatThread: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: 'thread-1',
          title: 'Nova conversa',
          summary: null,
          summaryUpdatedAt: null,
        }),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        count: jest.fn().mockResolvedValue(0),
      },
      chatMessage: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest
          .fn()
          .mockImplementation(({ data }: { data: { role: string } }) =>
            Promise.resolve({ id: `${data.role}-1` }),
          ),
        count: jest.fn().mockResolvedValue(0),
      },
      kloelMessage: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({}),
      },
      product: {
        create: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      workspace: { findUnique: jest.fn().mockResolvedValue(null), update: jest.fn() },
      agent: { findFirst: jest.fn().mockResolvedValue(null) },
      flow: { create: jest.fn(), findMany: jest.fn() },
      contact: { findFirst: jest.fn(), create: jest.fn() },
      message: { create: jest.fn(), update: jest.fn() },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn().mockResolvedValue(undefined),
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

    const planLimitsMock = {
      trackAiUsage: jest.fn().mockResolvedValue(undefined),
      ensureTokenBudget: jest.fn().mockResolvedValue(undefined),
      trackMessageSend: jest.fn().mockResolvedValue(undefined),
    };

    const summaryServiceMock = {
      maybeGenerateThreadTitle: jest.fn().mockResolvedValue('Conversas pendentes'),
      maybeRefreshThreadSummary: jest.fn().mockResolvedValue(undefined),
      isDefaultThreadTitle: jest.fn().mockReturnValue(true),
      isSubstantiveMessage: jest.fn().mockReturnValue(true),
      sanitizeGeneratedThreadTitle: jest
        .fn()
        .mockImplementation((v: string) => v || 'Nova conversa'),
    };
    threadService = new KloelThreadService(
      prisma as never as ConstructorParameters<typeof KloelThreadService>[0],
      summaryServiceMock as never,
    );

    const wsContextServiceMock = {
      getWorkspaceContext: jest.fn().mockResolvedValue(''),
      buildLinkedProductPromptContext: jest.fn().mockResolvedValue(null),
      contextFormatter: {
        sanitizeUserNameForAssistant: jest.fn().mockReturnValue('Usuário'),
        buildWorkspaceBusinessHoursContext: jest.fn().mockReturnValue(null),
        buildWorkspaceProductContext: jest.fn().mockReturnValue(''),
        buildWorkspaceAffiliateContext: jest.fn().mockReturnValue(''),
        buildAgentProfileContext: jest.fn().mockReturnValue(null),
      },
    };

    replyEngineService = new KloelReplyEngineService(
      prisma as never as ConstructorParameters<typeof KloelReplyEngineService>[0],
      planLimitsMock as never,
      threadService,
      wsContextServiceMock as never,
      unifiedAgentService as never,
    );

    const composerServiceMock = {
      executeComposerCapability: jest.fn(),
      searchWeb: jest.fn().mockResolvedValue({ answer: 'resultado', sources: [] }),
      buildCapabilityPrompt: jest.fn().mockReturnValue(''),
    };

    thinkerService = new KloelThinkerService(
      prisma as never as ConstructorParameters<typeof KloelThinkerService>[0],
      planLimitsMock as never,
      threadService,
      wsContextServiceMock as never,
      composerServiceMock as never,
      replyEngineService,
    );

    whatsappToolsService = new KloelWhatsAppToolsService(
      prisma as never as ConstructorParameters<typeof KloelWhatsAppToolsService>[0],
      whatsappService as never as ConstructorParameters<typeof KloelWhatsAppToolsService>[1],
      { getSessionStatus: jest.fn(), startSession: jest.fn() } as never,
      { textToSpeech: jest.fn(), transcribeAudio: jest.fn() } as never,
      planLimitsMock as never,
    );

    service = new KloelService(
      prisma as never as ConstructorParameters<typeof KloelService>[0],
      { createSmartPayment: jest.fn() } as never,
      whatsappService as never as ConstructorParameters<typeof KloelService>[2],
      { getSessionStatus: jest.fn(), startSession: jest.fn() } as never,
      unifiedAgentService as never,
      { textToSpeech: jest.fn(), transcribeAudio: jest.fn() } as never,
      planLimitsMock as never,
      { upload: jest.fn(), uploadFromUrl: jest.fn() } as never,
      threadService, // [8] threadService
      wsContextServiceMock as never, // [9] wsContextService
      {} as never, // [10] chatToolsService
      {} as never, // [11] bizConfigToolsService
      whatsappToolsService, // [12] whatsappToolsService
      {} as never, // [13] leadBrainService
      composerServiceMock as never, // [14] composerService
      thinkerService,
      replyEngineService,
      {
        executeTool: jest.fn(async (workspaceId: string, toolName: string, args: unknown) =>
          toolName === 'list_whatsapp_chats'
            ? whatsappToolsService.toolListWhatsAppChats(workspaceId, args as { limit?: number })
            : { success: false, error: `Ferramenta desconhecida: ${toolName}` },
        ),
      } as never,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('executes real WhatsApp tools inside the think loop instead of only generating text', async () => {
    (chatCompletionWithFallback as jest.Mock).mockResolvedValueOnce({
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
    });

    (chatCompletionStreamWithRetry as jest.Mock).mockResolvedValueOnce(
      (async function* () {
        await Promise.resolve();
        yield {
          choices: [
            { delta: { content: 'Encontrei 2 conversas pendentes e já posso agir sobre elas.' } },
          ],
        };
      })(),
    );

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
      { workspaceId: 'ws-1', message: 'o que está pendente no whatsapp?', mode: 'chat' },
      response as never,
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
        expect.objectContaining({ type: 'status', phase: 'thinking' }),
        expect.objectContaining({ type: 'status', phase: 'streaming_token' }),
        expect.objectContaining({ type: 'tool_call', tool: 'list_whatsapp_chats' }),
        expect.objectContaining({
          type: 'tool_result',
          tool: 'list_whatsapp_chats',
          success: true,
        }),
        expect.objectContaining({
          type: 'content',
          content: 'Encontrei 2 conversas pendentes e já posso agir sobre elas.',
        }),
        expect.objectContaining({ type: 'done', done: true }),
      ]),
    );
    expect(response.end).toHaveBeenCalled();
  });

  it('implicitly routes landing-page requests to the site composer capability', async () => {
    const executeComposerCapability = jest
      .spyOn(
        Reflect.get(thinkerService, 'composerService') as { executeComposerCapability: jest.Mock },
        'executeComposerCapability',
      )
      .mockResolvedValue({
        content: 'Site gerado e pronto para revisão.',
        metadata: { generatedSiteHtml: '<html><body>Oferta</body></html>' },
      });

    const result = await service.thinkSync({
      workspaceId: 'ws-1',
      message: 'Crie uma landing page para vender meu ebook de R$47',
      mode: 'chat',
    });

    expect(executeComposerCapability).toHaveBeenCalledWith(
      expect.objectContaining({ capability: 'create_site', workspaceId: 'ws-1' }),
    );
    expect(result.response).toBe('Site gerado e pronto para revisão.');
  });

  it('streams long-form prompts directly, skipping the extra planning pass and persisting the user first', async () => {
    const createdMessages: Array<Record<string, unknown>> = [];
    prisma.chatMessage.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => {
      createdMessages.push(data);
      const role = typeof data.role === 'string' ? data.role : 'message';
      return Promise.resolve({ id: `${role}-${createdMessages.length}` });
    });

    (chatCompletionStreamWithRetry as jest.Mock).mockResolvedValueOnce(
      (async function* () {
        await Promise.resolve();
        yield {
          choices: [
            { delta: { content: 'Segue o diagnóstico completo com os pontos prioritários.' } },
          ],
        };
      })(),
    );

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
        message: 'Preciso de um diagnóstico completo da operação comercial com plano completo.',
        mode: 'chat',
        metadata: { clientRequestId: 'req-long-1' },
      },
      response as never,
    );

    const events = writes
      .join('')
      .split('\n\n')
      .filter((block) => block.startsWith('data: '))
      .map((block) => JSON.parse(block.replace(/^data: /, '')));

    expect(chatCompletionWithFallback).not.toHaveBeenCalled();
    expect(createdMessages).toHaveLength(2);
    expect(createdMessages[0]).toEqual(
      expect.objectContaining({
        role: 'user',
        content: 'Preciso de um diagnóstico completo da operação comercial com plano completo.',
        metadata: expect.objectContaining({
          clientRequestId: 'req-long-1',
          requestState: 'accepted',
          transport: 'sse',
        }),
      }),
    );
    expect(createdMessages[1]).toEqual(
      expect.objectContaining({
        role: 'assistant',
        content: 'Segue o diagnóstico completo com os pontos prioritários.',
        metadata: expect.objectContaining({
          clientRequestId: 'req-long-1',
          requestState: 'completed',
          replyToMessageId: 'user-1',
        }),
      }),
    );
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'thread', conversationId: 'thread-1' }),
        expect.objectContaining({ type: 'status', phase: 'thinking' }),
        expect.objectContaining({ type: 'status', phase: 'streaming_token' }),
        expect.objectContaining({
          type: 'content',
          content: 'Segue o diagnóstico completo com os pontos prioritários.',
        }),
        expect.objectContaining({ type: 'done', done: true }),
      ]),
    );
  });

  it('preserves assistant response versions when regenerating a reply', async () => {
    prisma.chatThread.findFirst.mockResolvedValue({ id: 'thread-1', summary: 'Resumo atual' });
    prisma.chatMessage.findMany.mockResolvedValue([
      {
        id: 'assistant-later',
        threadId: 'thread-1',
        role: 'assistant',
        content: 'Resposta posterior',
        metadata: null,
        createdAt: new Date('2026-04-13T10:01:00.000Z'),
      },
      {
        id: 'assistant-1',
        threadId: 'thread-1',
        role: 'assistant',
        content: 'Resposta original',
        metadata: {
          responseVersions: [
            {
              id: 'resp-1',
              content: 'Resposta original',
              createdAt: '2026-04-13T10:00:10.000Z',
              source: 'initial',
            },
          ],
        },
        createdAt: new Date('2026-04-13T10:00:10.000Z'),
      },
      {
        id: 'user-1',
        threadId: 'thread-1',
        role: 'user',
        content: 'Explique melhor',
        metadata: null,
        createdAt: new Date('2026-04-13T10:00:00.000Z'),
      },
    ]);
    prisma.chatMessage.create.mockImplementation(
      ({ data }: { data: { role: string; content?: string; metadata?: unknown } }) =>
        Promise.resolve({
          id: `${data.role}-generated`,
          threadId: 'thread-1',
          role: data.role,
          content: data.content,
          metadata: data.metadata ?? null,
          createdAt: new Date('2026-04-13T10:02:00.000Z'),
        }),
    );
    prisma.chatMessage.update = jest.fn().mockResolvedValue({
      id: 'assistant-1',
      threadId: 'thread-1',
      role: 'assistant',
      content: 'Resposta regenerada',
      metadata: null,
      createdAt: new Date('2026-04-13T10:00:10.000Z'),
    });
    prisma.chatMessage.deleteMany = jest.fn().mockResolvedValue({ count: 1 });
    prisma.$transaction.mockResolvedValue([
      {
        id: 'assistant-1',
        threadId: 'thread-1',
        role: 'assistant',
        content: 'Resposta regenerada',
        createdAt: new Date('2026-04-13T10:00:10.000Z'),
        metadata: {
          responseVersions: [
            { id: 'resp-1', content: 'Resposta original', source: 'initial' },
            { id: 'resp-2', content: 'Resposta regenerada', source: 'regenerated' },
          ],
        },
      },
      { count: 1 },
      {},
      {},
    ]);

    jest.spyOn(replyEngineService, 'buildAssistantReply').mockImplementation(async (params) => {
      await Promise.resolve();
      params.onTraceEvent?.({
        type: 'status',
        phase: 'thinking',
        message: 'Entendendo sua pergunta e reunindo o contexto da conversa.',
        done: false,
      });
      params.onTraceEvent?.({
        type: 'tool_result',
        callId: 'call-1',
        tool: 'search_web',
        success: true,
        result: { answer: 'ok' },
        done: false,
      });
      return 'Resposta regenerada';
    });

    const result = await service.regenerateThreadAssistantResponse({
      workspaceId: 'ws-1',
      conversationId: 'thread-1',
      assistantMessageId: 'assistant-1',
      userId: 'agent-1',
      userName: 'Daniel',
    });

    expect(prisma.chatMessage.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'assistant-1' },
        data: expect.objectContaining({
          content: 'Resposta regenerada',
          metadata: expect.objectContaining({
            regeneratedFromUserMessageId: 'user-1',
            activeResponseVersionIndex: 1,
            responseVersions: [
              expect.objectContaining({
                id: 'resp-1',
                content: 'Resposta original',
                source: 'initial',
              }),
              expect.objectContaining({ content: 'Resposta regenerada', source: 'regenerated' }),
            ],
            processingTrace: expect.arrayContaining([
              expect.objectContaining({
                phase: 'thinking',
                label: 'Entendendo sua pergunta e reunindo o contexto da conversa.',
              }),
              expect.objectContaining({ phase: 'tool_result', label: 'Concluiu search web.' }),
            ]),
          }),
        }),
      }),
    );
    expect(prisma.chatMessage.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['assistant-later'] } },
    });
    expect(result).toEqual(
      expect.objectContaining({
        id: 'assistant-1',
        content: 'Resposta regenerada',
        deletedMessageIds: ['assistant-later'],
      }),
    );
  });

  it('persists thinkSync conversations with granular user and assistant writes', async () => {
    prisma.chatThread.findFirst.mockResolvedValue({
      id: 'thread-1',
      title: 'Nova conversa',
      summary: null,
      summaryUpdatedAt: null,
    });

    jest.spyOn(replyEngineService, 'buildAssistantReply').mockResolvedValue('Resposta síncrona');

    const result = await service.thinkSync({
      workspaceId: 'ws-1',
      conversationId: 'thread-1',
      message: 'Me responda em modo síncrono',
      mode: 'chat',
      metadata: { clientRequestId: 'sync-1' },
    });

    expect(prisma.chatMessage.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          threadId: 'thread-1',
          role: 'user',
          content: 'Me responda em modo síncrono',
          metadata: expect.objectContaining({
            clientRequestId: 'sync-1',
            transport: 'sync',
            requestState: 'accepted',
          }),
        }),
        select: { id: true },
      }),
    );
    expect(prisma.chatMessage.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          threadId: 'thread-1',
          role: 'assistant',
          content: 'Resposta síncrona',
          metadata: expect.objectContaining({
            clientRequestId: 'sync-1',
            transport: 'sync',
            requestState: 'completed',
            replyToMessageId: 'user-1',
            activeResponseVersionIndex: 0,
          }),
        }),
        select: { id: true },
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({ response: 'Resposta síncrona', conversationId: 'thread-1' }),
    );
  });
});
