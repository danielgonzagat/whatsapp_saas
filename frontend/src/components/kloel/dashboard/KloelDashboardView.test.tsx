import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps, SetStateAction } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  loadKloelThreadMessages,
  streamAuthenticatedKloelMessage,
} from '@/lib/kloel-conversations';
import KloelDashboard from './KloelDashboard';
import { KloelDashboardView } from './KloelDashboard/KloelDashboardView';
import {
  formatBrainOperatorErrorMessage,
  formatBrainOperatorSuccessFallback,
} from './KloelDashboard/useBrainRouter';
import { createSendMessageHandler } from './KloelDashboardSendMessage';
import type { DashboardMessage } from './KloelDashboard.message';

const dashboardRoute = vi.hoisted(() => ({
  searchParams: new URLSearchParams(),
  replace: vi.fn(),
}));

const dashboardConversationHistory = vi.hoisted(() => ({
  conversations: [{ id: 'thread-old', title: 'Conversa antiga' }],
  setActiveConversation: vi.fn(),
  upsertConversation: vi.fn(),
  refreshConversations: vi.fn().mockResolvedValue(undefined),
  updateConversationTitle: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: dashboardRoute.replace }),
  useSearchParams: () => dashboardRoute.searchParams,
}));

vi.mock('@/components/kloel/auth/auth-provider', () => ({
  useAuth: () => ({ userName: 'Codex' }),
}));

vi.mock('@/components/kloel/ToastProvider', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

vi.mock('@/hooks/useConversationHistory', () => ({
  useConversationHistory: () => dashboardConversationHistory,
}));

vi.mock('swr', () => ({
  default: () => ({
    data: [],
    isLoading: false,
    mutate: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock('@/lib/kloel-conversations', () => ({
  loadKloelThreadMessages: vi.fn(),
  streamAuthenticatedKloelMessage: vi.fn(() => ({ abort: vi.fn() })),
}));

afterEach(() => {
  vi.clearAllMocks();
  dashboardRoute.searchParams = new URLSearchParams();
  dashboardConversationHistory.conversations = [
    { id: 'thread-old', title: 'Conversa antiga' },
  ];
});


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
    onNewChat: vi.fn(),
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

describe('KloelDashboardView upload input', () => {
  it('exposes stable browser form metadata for the hidden attachment control', () => {
    renderDashboardView();

    const fileInput = screen.getByTestId('kloel-chat-file-input');

    expect(fileInput.getAttribute('id')).toBe('kloel-chat-file-input');
    expect(fileInput.getAttribute('name')).toBe('kloelChatFileInput');
  });
});

describe('KloelDashboardView new chat', () => {
  it('renders a reachable header action that starts a new conversation', () => {
    const { props } = renderDashboardView({
      hasMessages: true,
      messages: [{ id: 'message_1', role: 'user', text: 'Oi' }],
    });

    fireEvent.click(screen.getByRole('button', { name: 'Iniciar nova conversa' }));

    expect(props.onNewChat).toHaveBeenCalledTimes(1);
  });
});

describe('KloelDashboard route reset', () => {
  it('clears loaded conversation messages when the chat route drops conversationId', async () => {
    Element.prototype.scrollIntoView = vi.fn();
    dashboardRoute.searchParams = new URLSearchParams('conversationId=thread-old');
    vi.mocked(loadKloelThreadMessages).mockResolvedValue([
      {
        id: 'message-old',
        role: 'user',
        content: 'Mensagem antiga que precisa sumir',
        metadata: null,
        createdAt: '2026-06-06T12:00:00.000Z',
      },
    ]);

    const { rerender } = render(<KloelDashboard />);

    expect(await screen.findByText('Mensagem antiga que precisa sumir')).toBeTruthy();

    dashboardRoute.searchParams = new URLSearchParams();
    rerender(<KloelDashboard />);

    await waitFor(() => {
      expect(screen.queryByText('Mensagem antiga que precisa sumir')).toBeNull();
    });
    expect(dashboardConversationHistory.setActiveConversation).toHaveBeenLastCalledWith(null);
  });

  it('does not refetch the previous thread while replacing it with a new chat', async () => {
    Element.prototype.scrollIntoView = vi.fn();
    dashboardRoute.searchParams = new URLSearchParams('conversationId=thread-old');
    vi.mocked(loadKloelThreadMessages).mockResolvedValue([
      {
        id: 'message-old',
        role: 'user',
        content: 'Mensagem antiga antes do novo chat',
        metadata: null,
        createdAt: '2026-06-06T12:00:00.000Z',
      },
    ]);

    render(<KloelDashboard />);

    expect(await screen.findByText('Mensagem antiga antes do novo chat')).toBeTruthy();
    vi.mocked(loadKloelThreadMessages).mockClear();

    fireEvent.click(screen.getByRole('button', { name: 'Iniciar nova conversa' }));
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    expect(dashboardRoute.replace).toHaveBeenCalledWith('/chat', { scroll: false });
    expect(loadKloelThreadMessages).not.toHaveBeenCalled();
  });

  it('keeps the first new-chat send visible while the route has no conversationId', async () => {
    Element.prototype.scrollIntoView = vi.fn();
    dashboardRoute.searchParams = new URLSearchParams();
    const abort = vi.fn();
    vi.mocked(streamAuthenticatedKloelMessage).mockReturnValue({ abort });

    render(<KloelDashboard />);

    const textbox = screen.getByRole('textbox', { name: 'Mensagem para o Kloel' });
    fireEvent.change(textbox, {
      target: { value: 'Primeira mensagem sem conversa persistida' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar mensagem' }));

    await waitFor(() => {
      const renderedMessages = screen
        .getAllByText('Primeira mensagem sem conversa persistida')
        .filter((element) => element.tagName !== 'TEXTAREA');
      expect(renderedMessages.length).toBeGreaterThan(0);
    });

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    const renderedMessages = screen
      .getAllByText('Primeira mensagem sem conversa persistida')
      .filter((element) => element.tagName !== 'TEXTAREA');
    expect(renderedMessages.length).toBeGreaterThan(0);
    expect((textbox as HTMLTextAreaElement).value).toBe('');
    expect(abort).not.toHaveBeenCalled();
  });
});

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
  it('renders public processing context without exposing private provider reasoning', () => {
    renderDashboardView({
      hasMessages: true,
      messages: [
        {
          id: 'assistant_trace',
          role: 'assistant',
          text: '',
          metadata: {
            reasoningText:
              'We are in a chat conversation with the user and must decide what answer to show.',
            reasoningDurationMs: 1200,
            processingTrace: [
              {
                id: 'trace_2',
                kind: 'tool_call',
                phase: 'tool_calling',
                tool: 'list_products',
                label: 'Consultei contexto operacional relevante antes de responder.',
                spanId: 'span-search',
                createdAt: '2026-06-03T12:00:01.000Z',
              },
              {
                id: 'trace_3',
                kind: 'tool_result',
                phase: 'tool_result',
                tool: 'list_products',
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

    expect(
      screen.getByText('Analisei a pergunta e consultei contexto real antes da resposta final.'),
    ).toBeTruthy();
    expect(screen.queryByText(/We are in a chat conversation/)).toBeNull();
    expect(screen.queryByText(/must decide what answer to show/)).toBeNull();
    expect(screen.getAllByText('list_products').length).toBeGreaterThan(0);
    expect(screen.queryByText('Pré-resposta executável')).toBeNull();
    expect(screen.queryByText('Reasoning summary')).toBeNull();
    expect(screen.queryByText('Agent trace')).toBeNull();
    expect(screen.queryByText('ReAct trajectory')).toBeNull();
    expect(screen.queryByText('Tool/function calling')).toBeNull();
    expect(screen.queryByText('Traces + spans')).toBeNull();
    expect(
      screen.queryByText('Consultei contexto operacional relevante antes de responder.'),
    ).toBeNull();
    expect(
      screen.queryByText('Incorporei as observações encontradas e descartei detalhes privados.'),
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
