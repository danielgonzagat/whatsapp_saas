jest.mock('./openai-wrapper', () => ({
  chatCompletionWithFallback: jest.fn(),
  chatCompletionStreamWithRetry: jest.fn(),
}));

import { KloelService } from './kloel.service';
import { chatCompletionStreamWithRetry, chatCompletionWithFallback } from './openai-wrapper';

describe('KloelService', () => {
  let service: KloelService;
  let prisma: any;
  let whatsappService: any;
  let unifiedAgentService: any;
  let marketingSkillService: any;

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
      },
      chatMessage: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest
          .fn()
          .mockImplementation(({ data }: any) => Promise.resolve({ id: `${data.role}-1` })),
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

    marketingSkillService = {
      buildPacket: jest.fn().mockResolvedValue(null),
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
      {
        trackAiUsage: jest.fn().mockResolvedValue(undefined),
        ensureTokenBudget: jest.fn().mockResolvedValue(undefined),
        trackMessageSend: jest.fn().mockResolvedValue(undefined),
      } as any,
      {
        upload: jest.fn().mockResolvedValue({ url: 'https://storage.test/mock.png' }),
        uploadFromUrl: jest.fn().mockResolvedValue({ url: 'https://storage.test/mock.png' }),
      } as never,
      marketingSkillService,
    );

    jest.spyOn(service as any, 'getWorkspaceContext').mockResolvedValue('');
    jest.spyOn(service as any, 'buildDynamicRuntimeContext').mockResolvedValue('');
    jest.spyOn(service as any, 'maybeGenerateThreadTitle').mockResolvedValue('Conversas pendentes');
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
            {
              delta: {
                content: 'Encontrei 2 conversas pendentes e já posso agir sobre elas.',
              },
            },
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
          type: 'status',
          phase: 'thinking',
        }),
        expect.objectContaining({
          type: 'status',
          phase: 'streaming_token',
        }),
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
          type: 'content',
          content: 'Encontrei 2 conversas pendentes e já posso agir sobre elas.',
        }),
        expect.objectContaining({
          type: 'done',
          done: true,
        }),
      ]),
    );
    expect(response.end).toHaveBeenCalled();
  });

  it('injects the selected marketing framework into seller chat prompts', async () => {
    prisma.workspace.findUnique.mockResolvedValue({});
    marketingSkillService.buildPacket.mockResolvedValue({
      isMarketingRequest: true,
      selectedSkills: [],
      snapshot: {},
      promptAddendum: 'MODO MARKETING ATIVADO\n- priorize framework de paid-ads.',
    });

    (chatCompletionWithFallback as jest.Mock).mockResolvedValueOnce({
      choices: [{ message: { content: 'Plano pronto.' } }],
      usage: { total_tokens: 21 },
    });

    const reply = await (service as any).buildAssistantReply({
      message: 'Meu ROAS caiu e preciso de ajuda com as campanhas',
      workspaceId: 'ws-1',
      mode: 'chat',
      conversationState: { recentMessages: [], totalMessages: 0 },
    });

    expect(marketingSkillService.buildPacket).toHaveBeenCalledWith(
      'ws-1',
      'Meu ROAS caiu e preciso de ajuda com as campanhas',
    );
    expect((chatCompletionWithFallback as jest.Mock).mock.calls[0][1].messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'system',
          content: expect.stringContaining('MODO MARKETING ATIVADO'),
        }),
      ]),
    );
    expect(reply).toBe('Plano pronto.');
  });

  it('implicitly routes landing-page requests to the site composer capability', async () => {
    const executeComposerCapability = jest
      .spyOn(service as any, 'executeComposerCapability')
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
      expect.objectContaining({
        capability: 'create_site',
        workspaceId: 'ws-1',
      }),
    );
    expect(result.response).toBe('Site gerado e pronto para revisão.');
  });

  it('streams long-form prompts directly, skipping the extra planning pass and persisting the user first', async () => {
    const createdMessages: Array<Record<string, unknown>> = [];
    prisma.chatMessage.create.mockImplementation(({ data }: any) => {
      createdMessages.push(data);
      return Promise.resolve({ id: `${data.role}-${createdMessages.length}` });
    });

    (chatCompletionStreamWithRetry as jest.Mock).mockResolvedValueOnce(
      (async function* () {
        await Promise.resolve();
        yield {
          choices: [
            {
              delta: {
                content: 'Segue o diagnóstico completo com os pontos prioritários.',
              },
            },
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
        metadata: { clientRequestId: 'req-long-1' } as any,
      },
      response as any,
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
    prisma.chatThread.findFirst.mockResolvedValue({
      id: 'thread-1',
      summary: 'Resumo atual',
    });
    prisma.chatMessage.findMany.mockResolvedValue([
      {
        id: 'user-1',
        threadId: 'thread-1',
        role: 'user',
        content: 'Explique melhor',
        metadata: null,
        createdAt: new Date('2026-04-13T10:00:00.000Z'),
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
        id: 'assistant-later',
        threadId: 'thread-1',
        role: 'assistant',
        content: 'Resposta posterior',
        metadata: null,
        createdAt: new Date('2026-04-13T10:01:00.000Z'),
      },
    ]);

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
        metadata: {
          responseVersions: [
            {
              id: 'resp-1',
              content: 'Resposta original',
              createdAt: '2026-04-13T10:00:10.000Z',
              source: 'initial',
            },
            {
              id: 'resp-2',
              content: 'Resposta regenerada',
              createdAt: '2026-04-13T10:02:00.000Z',
              source: 'regenerated',
            },
          ],
        },
        createdAt: new Date('2026-04-13T10:00:10.000Z'),
      },
    ]);

    jest.spyOn(service as any, 'buildAssistantReply').mockImplementation(async (params: any) => {
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
              expect.objectContaining({
                content: 'Resposta regenerada',
                source: 'regenerated',
              }),
            ],
            processingTrace: expect.arrayContaining([
              expect.objectContaining({
                phase: 'thinking',
                label: 'Entendendo sua pergunta e reunindo o contexto da conversa.',
              }),
              expect.objectContaining({
                phase: 'tool_result',
                label: 'Concluiu search web.',
              }),
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

    jest.spyOn(service as any, 'buildAssistantReply').mockResolvedValue('Resposta síncrona');

    const result = await service.thinkSync({
      workspaceId: 'ws-1',
      conversationId: 'thread-1',
      message: 'Me responda em modo síncrono',
      mode: 'chat',
      metadata: { clientRequestId: 'sync-1' } as any,
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
      expect.objectContaining({
        response: 'Resposta síncrona',
        conversationId: 'thread-1',
      }),
    );
  });

  it.each([
    ['liste meus contatos do WhatsApp', true],
    ['o que está pendente no WhatsApp?', true],
    ['quero buscar notícias sobre o mercado hoje', true],
    ['abrir o dashboard de mensagens', true],
    ['verifique o status do meu WhatsApp', true],
    ['gere um link de pagamento do produto premium', true],
    ['consulte o histórico do chat', true],
    ['pesquise no Google o preço do concorrente', true],
    ['sincronize os contatos do painel', true],
    ['remova este produto do catálogo', true],
    ['atualize a marca no brand voice', true],
    ['diagnóstico completo da operação comercial', false],
    ['me explique como melhorar minha conversão', false],
    ['oi', false],
    ['quero uma estratégia completa de marketing', false],
    ['faça um relatório executivo do funil', false],
    ['escreva uma copy para anúncio', false],
    ['me dê ideias de campanha', false],
    ['qual é a diferença entre upsell e cross-sell?', false],
    ['preciso de uma análise completa da minha operação', false],
    ['resuma esta conversa para mim', false],
    ['como vender mais pelo Instagram?', false],
    ['busque', false],
    ['produto', false],
    ['abre aí', false],
  ])('classifies tool planning intent for "%s"', (message, expected) => {
    expect((service as any).shouldAttemptToolPlanningPass(message)).toBe(expected);
  });
});
