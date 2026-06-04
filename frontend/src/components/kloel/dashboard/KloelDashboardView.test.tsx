import { render, screen } from '@testing-library/react';
import type { ComponentProps, SetStateAction } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { streamAuthenticatedKloelMessage } from '@/lib/kloel-conversations';
import { KloelDashboardView } from './KloelDashboard/KloelDashboardView';
import {
  formatBrainOperatorErrorMessage,
  formatBrainOperatorSuccessFallback,
} from './KloelDashboard/useBrainRouter';
import { createSendMessageHandler } from './KloelDashboardSendMessage';
import type { DashboardMessage } from './KloelDashboard.message';

vi.mock('@/lib/kloel-conversations', () => ({
  streamAuthenticatedKloelMessage: vi.fn(() => ({ abort: vi.fn() })),
}));


function renderDashboardView(overrides?: Partial<ComponentProps<typeof KloelDashboardView>>) {
  const inputRef = { current: null };
  const fileInputRef = { current: null };
  const messagesEndRef = { current: null };
  const props: ComponentProps<typeof KloelDashboardView> = {
    isDragActive: false,
    hasMessages: false,
    messages: [],
    conversationTitle: 'Nova conversa',
    onTitle: vi.fn(),
    streamingMessageId: null,
    isThinking: false,
    isReplyInFlight: false,
    showSlowHint: false,
    greetingLine: 'Ola',
    input: '',
    composerPlaceholder: 'Como posso ajudar?',
    activeCapability: null,
    attachments: [],
    linkedProduct: null,
    selectableProducts: [],
    selectableProductsLoading: false,
    composerNotice: null,
    pendingApprovals: [],
    pendingApprovalsLoading: false,
    approvalActionInFlight: null,
    fileInputRef,
    inputRef,
    messagesEndRef,
    onDragEnter: vi.fn(),
    onDragOver: vi.fn(),
    onDragLeave: vi.fn(),
    onDropFiles: vi.fn().mockResolvedValue(undefined),
    onQueueFilesForUpload: vi.fn().mockResolvedValue(undefined),
    onQuickAction: vi.fn(),
    onUserEdit: vi.fn().mockResolvedValue(undefined),
    onUserRetry: vi.fn().mockResolvedValue(undefined),
    onAssistantFeedback: vi.fn().mockResolvedValue(undefined),
    onAssistantRegenerate: vi.fn().mockResolvedValue(undefined),
    onCancelActiveReply: vi.fn(),
    onInputChange: vi.fn(),
    onSend: vi.fn(),
    onRemoveAttachment: vi.fn(),
    onRetryAttachment: vi.fn(),
    onSelectProduct: vi.fn(),
    onRemoveLinkedProduct: vi.fn(),
    onCapabilityChange: vi.fn(),
    onApprovalDecision: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };

  return {
    ...render(<KloelDashboardView {...props} />),
    props,
  };
}

describe('KloelDashboardView approvals', () => {
  it('keeps pending approval notifications out of the chat composition surface', () => {
    renderDashboardView({
      pendingApprovals: [
        {
          id: 'approval-1',
          kind: 'kloel_tool:create_campaign',
          scope: 'workspace',
          entityType: 'KloelTool',
          entityId: 'create_campaign',
          state: 'OPEN',
          title: 'Aprovar criacao de campanha pela CIA',
          prompt: 'A CIA quer criar uma campanha para leads quentes.',
          payload: { toolName: 'create_campaign' },
          createdAt: '2026-05-11T18:00:00.000Z',
          updatedAt: '2026-05-11T18:00:00.000Z',
        },
      ],
    });

    expect(screen.queryByText('Aprovacoes pendentes')).toBeNull();
    expect(screen.queryByText('Aprovar criacao de campanha pela CIA')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Aprovar' })).toBeNull();
  });
});

describe('KloelDashboardView trace', () => {
  it('renders public reasoning context without mechanical step or span labels', () => {
    renderDashboardView({
      hasMessages: true,
      messages: [
        {
          id: 'assistant_trace',
          role: 'assistant',
          text: '',
          metadata: {
            processingTrace: [
              {
                id: 'trace_1',
                kind: 'system',
                phase: 'thinking',
                label: 'Analisei a pergunta e delimitei o que pode ser explicado publicamente.',
                createdAt: '2026-06-03T12:00:00.000Z',
              },
              {
                id: 'trace_2',
                kind: 'tool_call',
                phase: 'tool_calling',
                label: 'Consultei contexto operacional relevante antes de responder.',
                spanId: 'span-search',
                createdAt: '2026-06-03T12:00:01.000Z',
              },
              {
                id: 'trace_3',
                kind: 'tool_result',
                phase: 'tool_result',
                label: 'Incorporei as observações encontradas e descartei detalhes privados.',
                spanId: 'span-search',
                durationMs: 42,
                createdAt: '2026-06-03T12:00:02.000Z',
              },
            ],
            processingSummary:
              'Analisei a pergunta e consultei contexto real antes da resposta final.',
          },
        },
      ],
      streamingMessageId: 'assistant_trace',
      isThinking: true,
      isReplyInFlight: true,
    });

    expect(screen.getByText('Pré-resposta executável')).toBeTruthy();
    expect(screen.getByText('Reasoning summary')).toBeTruthy();
    expect(screen.getByText('Agent trace')).toBeTruthy();
    expect(screen.getByText('ReAct trajectory')).toBeTruthy();
    expect(screen.getByText('Tool/function calling')).toBeTruthy();
    expect(screen.getByText('Traces + spans')).toBeTruthy();
    expect(screen.getByText('Analisei a pergunta e delimitei o que pode ser explicado publicamente.')).toBeTruthy();
    expect(screen.getByText('Consultei contexto operacional relevante antes de responder.')).toBeTruthy();
    expect(screen.getByText('Incorporei as observações encontradas e descartei detalhes privados.')).toBeTruthy();
    expect(screen.queryByText(/^Step\s+0?1$/i)).toBeNull();
    expect(screen.queryByText(/^Span\s+span-search$/i)).toBeNull();
    expect(screen.queryByText(/^raciocínio$/i)).toBeNull();
    expect(screen.queryByText(/^ação$/i)).toBeNull();
    expect(screen.queryByText(/^observação$/i)).toBeNull();
    expect(
      screen.queryByText('Pré-resposta executável: entendendo pedido, contexto e próxima ação.'),
    ).toBeNull();
  });

  it('uses the live public thinking summary instead of the fixed mushroom placeholder', () => {
    renderDashboardView({
      hasMessages: true,
      messages: [
        {
          id: 'assistant_live_summary',
          role: 'assistant',
          text: '',
          metadata: {
            processingSummary:
              'O usuário quer avaliar a inteligência percebida do chat; estou separando resposta pública de raciocínio privado.',
          },
        },
      ],
      streamingMessageId: 'assistant_live_summary',
      isThinking: true,
      isReplyInFlight: true,
    });

    expect(
      screen.getByText(
        'O usuário quer avaliar a inteligência percebida do chat; estou separando resposta pública de raciocínio privado.',
      ),
    ).toBeTruthy();
    expect(screen.queryByText('Kloel está pensando')).toBeNull();
  });
});

describe('KloelDashboardSendMessage trace', () => {
  it('does not seed assistant messages with generic handcoded pre-response text', async () => {
    vi.useFakeTimers();
    vi.mocked(streamAuthenticatedKloelMessage).mockClear();

    let messages: DashboardMessage[] = [];
    const setMessages = (updater: SetStateAction<DashboardMessage[]>) => {
      messages = typeof updater === 'function' ? updater(messages) : updater;
    };

    try {
      await createSendMessageHandler({
        setMessages,
        setIsThinking: vi.fn(),
        setStreamingMessageId: vi.fn(),
        setActiveConversationId: vi.fn(),
        setConversationTitle: vi.fn(),
        isReplyInFlight: false,
        activeConversationId: null,
        conversationTitle: 'Nova conversa',
        conversationTitleMap: new Map(),
        clearAllAttachments: vi.fn(),
        clearComposerContext: vi.fn(),
        loadConversation: vi.fn().mockResolvedValue(undefined),
        refreshConversations: vi.fn().mockResolvedValue(undefined),
        upsertConversation: vi.fn(),
        setActiveConversation: vi.fn(),
        requestedConversationId: null,
        router: { replace: vi.fn() } as never,
        attachments: [],
        linkedProduct: null,
        activeCapability: null,
        activeStreamRef: { current: null },
        loadedConversationIdRef: { current: null },
        streamingMessageId: null,
      })('Oi.');

      const assistant = messages.find((message) => message.role === 'assistant');
      const metadata = assistant?.metadata as Record<string, unknown> | undefined;
      expect(metadata).toEqual(expect.objectContaining({ clientRequestId: expect.any(String) }));
      expect(metadata && 'processingTrace' in metadata).toBe(false);
      expect(metadata && 'processingSummary' in metadata).toBe(false);
      expect(JSON.stringify(metadata || {})).not.toContain(
        'Pré-resposta executável: entendendo pedido, contexto e próxima ação.',
      );
      expect(streamAuthenticatedKloelMessage).toHaveBeenCalledOnce();
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it('treats capability and linked product as one-shot composer context after send', async () => {
    vi.useFakeTimers();
    vi.mocked(streamAuthenticatedKloelMessage).mockClear();

    let messages: DashboardMessage[] = [];
    const setMessages = (updater: SetStateAction<DashboardMessage[]>) => {
      messages = typeof updater === 'function' ? updater(messages) : updater;
    };
    const clearComposerContext = vi.fn();
    const context: Parameters<typeof createSendMessageHandler>[0] & {
      clearComposerContext: () => void;
    } = {
      setMessages,
      setIsThinking: vi.fn(),
      setStreamingMessageId: vi.fn(),
      setActiveConversationId: vi.fn(),
      setConversationTitle: vi.fn(),
      isReplyInFlight: false,
      activeConversationId: null,
      conversationTitle: 'Nova conversa',
      conversationTitleMap: new Map(),
      clearAllAttachments: vi.fn(),
      clearComposerContext,
      loadConversation: vi.fn().mockResolvedValue(undefined),
      refreshConversations: vi.fn().mockResolvedValue(undefined),
      upsertConversation: vi.fn(),
      setActiveConversation: vi.fn(),
      requestedConversationId: null,
      router: { replace: vi.fn() } as never,
      attachments: [],
      linkedProduct: {
        id: 'product-1',
        source: 'owned',
        name: 'Produto real',
        imageUrl: null,
        status: 'published',
        productId: 'product-1',
      },
      activeCapability: 'search_web',
      activeStreamRef: { current: null },
      loadedConversationIdRef: { current: null },
      streamingMessageId: null,
    };

    try {
      await createSendMessageHandler(context)('pesquise concorrentes');

      expect(messages.find((message) => message.role === 'user')?.metadata).toEqual(
        expect.objectContaining({
          capability: 'search_web',
          linkedProduct: expect.objectContaining({ id: 'product-1', source: 'owned' }),
        }),
      );
      expect(streamAuthenticatedKloelMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            capability: 'search_web',
            linkedProduct: expect.objectContaining({ id: 'product-1', source: 'owned' }),
          }),
        }),
        expect.any(Object),
      );
      expect(clearComposerContext).toHaveBeenCalledOnce();
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });
});

describe('Kloel brain operator copy', () => {
  it('does not leak raw operator ids or auth internals in the visible error', () => {
    const text = formatBrainOperatorErrorMessage(
      'list_products',
      new Error('Missing Authorization header'),
    );

    expect(text).toContain('catálogo de produtos');
    expect(text).toContain('sessão expirou');
    expect(text).not.toContain('list_products');
    expect(text).not.toContain('Missing Authorization header');
    expect(text).not.toContain('Falha ao executar');
  });

  it('uses public copy for empty success fallbacks', () => {
    const text = formatBrainOperatorSuccessFallback('list_products');

    expect(text).toContain('catálogo de produtos');
    expect(text).toContain('observação operacional real');
    expect(text).not.toContain('list_products');
    expect(text).not.toContain('Acao');
  });
});
