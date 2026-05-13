'use client';

import { useAuth } from '@/components/kloel/auth/auth-provider';
import { useToast } from '@/components/kloel/ToastProvider';
import { useConversationHistory } from '@/hooks/useConversationHistory';
import { affiliateApi } from '@/lib/api/affiliate';
import {
  brainDecide,
  detectOperatorIntent,
  isUnsupportedFallback,
} from '@/lib/api/brain';
import { api } from '@/lib/api/core';
import {
  decideKloelApproval,
  listPendingKloelApprovals,
  type KloelApprovalDecision,
} from '@/lib/api/kloel';
import { productApi } from '@/lib/api/products';
import {
  type KloelChatCapability,
  type KloelChatRequestMetadata,
  type KloelLinkedProduct,
} from '@/lib/kloel-chat';
import {
  loadKloelThreadMessages,
  regenerateKloelConversationMessage,
  updateKloelMessageFeedback,
  updateKloelThreadMessage,
} from '@/lib/kloel-conversations';
import { KLOEL_CHAT_ROUTE } from '@/lib/kloel-dashboard-context';
import { getAssistantResponseVersions } from '@/lib/kloel-message-ui';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import {
  capabilityPromptLabel,
  getGreeting,
  toErrorMessage,
  toMessageMetadata,
  unwrapApiPayload,
  mapLinkableProducts,
  type OwnedProductsPayload,
  type AffiliateRequestRow,
} from './KloelDashboard.helpers';
import { type DashboardMessage } from './KloelDashboard.message';
import { S_RE, SLOW_HINT_DELAY_MS } from './KloelDashboard.subcomponents';
import {
  KloelDashboardView,
  type KloelDashboardQuickAction,
} from './KloelDashboard/KloelDashboardView';
import {
  useKloelFiles,
  useKloelDragDrop,
  createSendMessageHandler,
  type SendMessageContext,
} from './KloelDashboard.hooks';

/** Kloel dashboard. */
export default function KloelDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { userName } = useAuth();
  const { showToast } = useToast();
  const {
    conversations,
    setActiveConversation,
    upsertConversation,
    refreshConversations,
    updateConversationTitle,
  } = useConversationHistory();

  const requestedConversationId = searchParams.get('conversationId');
  const draft = searchParams.get('draft') || '';

  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<DashboardMessage[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [conversationTitle, setConversationTitle] = useState('Nova conversa');
  const [hasMounted, setHasMounted] = useState(false);
  const [showSlowHint, setShowSlowHint] = useState(false);
  const [linkedProduct, setLinkedProduct] = useState<KloelLinkedProduct | null>(null);
  const [activeCapability, setActiveCapability] = useState<KloelChatCapability | null>(null);
  const [approvalActionInFlight, setApprovalActionInFlight] = useState<string | null>(null);

  const loadedConversationIdRef = useRef<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const activeStreamRef = useRef<{ abort: () => void } | null>(null);
  const playbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    attachments,
    composerNotice,
    setComposerNotice,
    clearAttachmentById,
    clearAllAttachments,
    queueFilesForUpload,
    handleRetryAttachment,
    fileInputRef,
  } = useKloelFiles();

  const isReplyInFlight = isThinking || Boolean(streamingMessageId);
  const hasMessages = messages.length > 0;

  const { isDragActive, handleDragEnter, handleDragOver, handleDragLeave, handleDropFiles } =
    useKloelDragDrop({ isReplyInFlight, queueFilesForUpload, setComposerNotice, inputRef });

  const { data: selectableProductsData, isLoading: selectableProductsLoading } = useSWR<
    KloelLinkedProduct[]
  >('kloel:chat-selectable-products', async () => {
    const [ownedResponse, affiliateResponse] = await Promise.all([
      productApi.list(),
      affiliateApi.myProducts(),
    ]);
    return mapLinkableProducts({
      owned: unwrapApiPayload<OwnedProductsPayload | null>(ownedResponse),
      affiliate: unwrapApiPayload<{
        items?: AffiliateRequestRow[] | null;
        products?: AffiliateRequestRow[] | null;
      } | null>(affiliateResponse),
    });
  });
  const {
    data: pendingApprovalsData,
    isLoading: pendingApprovalsLoading,
    mutate: refreshPendingApprovals,
  } = useSWR('kloel:pending-approvals', listPendingKloelApprovals, {
    refreshInterval: 30000,
  });

  const conversationTitleMap = useMemo(
    () => new Map(conversations.map((c) => [c.id, c.title])),
    [conversations],
  );

  const firstName = String(userName || '')
    .trim()
    .split(S_RE)[0];
  const greetingLine = useMemo(() => {
    const greeting = hasMounted ? getGreeting() : 'Olá';
    const hydratedFirstName = hasMounted ? firstName : '';
    return hydratedFirstName ? `${greeting}, ${hydratedFirstName}` : greeting;
  }, [firstName, hasMounted]);
  const selectableProducts = selectableProductsData || [];

  const loadConversation = useCallback(
    async (conversationId: string) => {
      if (!conversationId) {return;}
      try {
        const payload = await loadKloelThreadMessages(conversationId);
        setMessages(
          payload
            .filter((message) => String(message?.content || '').trim())
            .map((message) => ({
              id: message.id,
              role: message.role,
              text: message.content,
              metadata: toMessageMetadata(message.metadata),
            })),
        );
        loadedConversationIdRef.current = conversationId;
        setActiveConversationId(conversationId);
        setConversationTitle(conversationTitleMap.get(conversationId) || 'Nova conversa');
        setActiveConversation(conversationId);
      } catch (error) {
        console.error('Failed to load conversation in dashboard:', error);
      }
    },
    [conversationTitleMap, setActiveConversation],
  );

  const resetToNewChat = useCallback(
    (replaceUrl = false) => {
      activeStreamRef.current?.abort();
      activeStreamRef.current = null;
      if (playbackTimerRef.current) {
        clearTimeout(playbackTimerRef.current);
        playbackTimerRef.current = null;
      }
      loadedConversationIdRef.current = null;
      setActiveConversationId(null);
      setConversationTitle('Nova conversa');
      setMessages([]);
      setIsThinking(false);
      setStreamingMessageId(null);
      setShowSlowHint(false);
      setLinkedProduct(null);
      setActiveCapability(null);
      clearAllAttachments();
      setActiveConversation(null);
      if (replaceUrl) {
        router.replace(KLOEL_CHAT_ROUTE, { scroll: false });
      }
    },
    [clearAllAttachments, router, setActiveConversation],
  );

  const onTitle = useCallback(
    (newTitle: string) => {
      const trimmed = newTitle.trim();
      if (!trimmed || !activeConversationId) {return;}
      setConversationTitle(trimmed);
      updateConversationTitle(activeConversationId, trimmed);
      showToast('Titulo atualizado', 'success');
    },
    [activeConversationId, setConversationTitle, updateConversationTitle, showToast],
  );

  const handleCancelActiveReply = useCallback(() => {
    activeStreamRef.current?.abort();
    activeStreamRef.current = null;
    if (playbackTimerRef.current) {
      clearTimeout(playbackTimerRef.current);
      playbackTimerRef.current = null;
    }
    setShowSlowHint(false);
    setIsThinking(false);
    setStreamingMessageId(null);
    setMessages((current) =>
      current.filter(
        (message) => !(message.id === streamingMessageId && message.role === 'assistant'),
      ),
    );
  }, [streamingMessageId]);

  const handleApprovalDecision = useCallback(
    async (approvalRequestId: string, decision: KloelApprovalDecision) => {
      const label =
        decision === 'approve' ? 'aprovar' : decision === 'reject' ? 'rejeitar' : 'pedir ajuste';
      setApprovalActionInFlight(`${approvalRequestId}:${decision}`);
      try {
        await decideKloelApproval(approvalRequestId, decision);
        await refreshPendingApprovals();
        showToast(`Aprovacao atualizada: ${label}`, 'success');
      } catch (error) {
        showToast(error instanceof Error ? error.message : 'Erro ao atualizar aprovacao', 'error');
      } finally {
        setApprovalActionInFlight(null);
      }
    },
    [refreshPendingApprovals, showToast],
  );

  const sendMessageContext: SendMessageContext = useMemo(
    () => ({
      setMessages,
      setIsThinking,
      setStreamingMessageId,
      setActiveConversationId,
      setConversationTitle,
      isReplyInFlight,
      activeConversationId,
      conversationTitle,
      conversationTitleMap,
      clearAllAttachments,
      loadConversation,
      refreshConversations,
      upsertConversation,
      setActiveConversation,
      requestedConversationId,
      router,
      attachments,
      linkedProduct,
      activeCapability,
      activeStreamRef,
      streamingMessageId,
    }),
    [
      isReplyInFlight,
      activeConversationId,
      conversationTitle,
      conversationTitleMap,
      clearAllAttachments,
      loadConversation,
      refreshConversations,
      upsertConversation,
      setActiveConversation,
      requestedConversationId,
      router,
      attachments,
      linkedProduct,
      activeCapability,
      streamingMessageId,
    ],
  );

  const handleSendMessage = useMemo(
    () => createSendMessageHandler(sendMessageContext),
    [sendMessageContext],
  );

  const handleOperatorDispatch = useCallback(
    async (text: string, intent: string) => {
      if (isReplyInFlight) return;
      const clientRequestId = `brain_${Date.now()}`;
      const userId = `user_${Date.now()}`;

      setMessages((current) => [
        ...current,
        { id: userId, role: 'user', text, metadata: { clientRequestId, brainIntent: intent } },
      ]);
      setInput('');
      clearAllAttachments();
      setIsThinking(true);

      const assistantId = `assistant_${Date.now()}`;

      try {
        const output = await brainDecide({
          intent,
          source: 'chat',
          messages: [{ role: 'user', content: text }],
          context: activeConversationId ? { conversationId: activeConversationId } : undefined,
        });

        const action = output.actions?.[0];
        const resultData = action?.result as Record<string, unknown> | undefined;

        setMessages((current) => [
          ...current,
          {
            id: assistantId,
            role: 'assistant',
            text: output.response || `Acao "${intent}" executada.`,
            metadata: {
              clientRequestId,
              brainOperator: true,
              brainIntent: intent,
              brainResult: resultData ?? null,
              ok: !!(resultData && resultData.ok !== false),
            },
          },
        ]);

        if (output.conversationId) {
          setActiveConversationId(output.conversationId);
          if (output.title) {
            setConversationTitle(output.title);
          }
          setActiveConversation(output.conversationId);
        }
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'brain_failed';
        setMessages((current) => [
          ...current,
          {
            id: assistantId,
            role: 'assistant',
            text: `Falha ao executar "${intent}": ${msg}. Tente novamente.`,
            metadata: { clientRequestId, brainOperator: true, brainIntent: intent, ok: false },
          },
        ]);
      } finally {
        setIsThinking(false);
        setStreamingMessageId(null);
      }
    },
    [isReplyInFlight, clearAllAttachments, activeConversationId, setActiveConversation],
  );

  const handleUnsupportedFallback = useCallback(
    async (text: string) => {
      const userId = `user_${Date.now()}`;
      setMessages((current) => [
        ...current,
        { id: userId, role: 'user', text },
      ]);
      setInput('');

      try {
        await api.post('/admin/lacunas-suggest', { intent: 'unsupported', userMessage: text }).catch(() => {});
      } catch {
        /* best-effort audit */
      }

      const fallbackId = `assistant_${Date.now()}`;
      setMessages((current) => [
        ...current,
        {
          id: fallbackId,
          role: 'assistant',
          text: 'Ainda nao consigo executar isso. Esta acao sera registrada para analise futura.',
          metadata: { brainFallback: true },
        },
      ]);
    },
    [],
  );

  const handleSend = useCallback(() => {
    if (attachments.some((a) => a.status === 'uploading')) {
      setComposerNotice('Aguarde o envio dos anexos terminar antes de continuar.');
      return;
    }

    const detected = detectOperatorIntent(input);
    if (detected) {
      if (isUnsupportedFallback(detected)) {
        void handleUnsupportedFallback(input);
        return;
      }
      void handleOperatorDispatch(input, detected);
      return;
    }

    void handleSendMessage(input);
  }, [
    attachments,
    handleSendMessage,
    input,
    setComposerNotice,
    handleOperatorDispatch,
    handleUnsupportedFallback,
  ]);

  const handleQuickAction = useCallback(
    (action: KloelDashboardQuickAction) => {
      const linkedProductName = String(linkedProduct?.name || '').trim();
      setComposerNotice(null);
      setInput(linkedProductName ? `${action.prompt}${linkedProductName}` : action.prompt);
      if (action.id === 'create-page') {
        setActiveCapability('create_site');
      } else if (action.id === 'analyze-product') {
        setActiveCapability('search_web');
      } else {
        setActiveCapability(null);
      }
      window.setTimeout(() => inputRef.current?.focus(), 0);
    },
    [linkedProduct, setComposerNotice],
  );

  const handleUserRetry = useCallback(
    async (messageId: string) => {
      const sourceMessage = messages.find(
        (message) => message.id === messageId && message.role === 'user',
      );
      if (!sourceMessage) {return;}
      await handleSendMessage(
        sourceMessage.text,
        sourceMessage.metadata as KloelChatRequestMetadata | undefined,
      );
    },
    [handleSendMessage, messages],
  );

  const handleUserEdit = useCallback(
    async (messageId: string, nextText: string) => {
      const updatedMessage = await updateKloelThreadMessage(messageId, nextText);
      setMessages((current) =>
        current.map((message) =>
          message.id === messageId
            ? {
                ...message,
                text: updatedMessage.content,
                metadata: toMessageMetadata(updatedMessage.metadata),
              }
            : message,
        ),
      );
      await handleSendMessage(
        nextText,
        updatedMessage.metadata as KloelChatRequestMetadata | undefined,
      );
    },
    [handleSendMessage],
  );

  const handleAssistantFeedback = useCallback(
    async (messageId: string, type: 'positive' | 'negative' | null) => {
      const updatedMessage = await updateKloelMessageFeedback(messageId, type);
      setMessages((current) =>
        current.map((message) =>
          message.id === messageId
            ? { ...message, metadata: toMessageMetadata(updatedMessage.metadata) }
            : message,
        ),
      );
    },
    [],
  );

  const handleAssistantRegenerate = useCallback(
    async (messageId: string) => {
      if (!activeConversationId) {return;}
      setStreamingMessageId(messageId);
      setIsThinking(true);
      setMessages((current) => {
        const targetIndex = current.findIndex((message) => message.id === messageId);
        if (targetIndex === -1) {return current;}
        const targetMessage = current[targetIndex];
        const preservedVersions = getAssistantResponseVersions(
          targetMessage.metadata,
          targetMessage.text,
          targetMessage.id,
        );
        return [
          ...current.slice(0, targetIndex),
          {
            ...targetMessage,
            text: '',
            metadata: { ...(targetMessage.metadata || {}), responseVersions: preservedVersions },
          },
        ];
      });
      try {
        const regenerated = await regenerateKloelConversationMessage(
          activeConversationId,
          messageId,
        );
        setMessages((current) => {
          const targetIndex = current.findIndex((message) => message.id === messageId);
          if (targetIndex === -1) {return current;}
          return [
            ...current.slice(0, targetIndex),
            {
              id: regenerated.id,
              role: 'assistant',
              text: regenerated.content,
              metadata: toMessageMetadata(regenerated.metadata),
            },
          ];
        });
        void refreshConversations();
      } catch (error: unknown) {
        setMessages((current) =>
          current.map((message) =>
            message.id === messageId
              ? {
                  ...message,
                  text: toErrorMessage(
                    error,
                    'Desculpe, ocorreu uma instabilidade ao tentar gerar uma nova versão.',
                  ),
                }
              : message,
          ),
        );
      } finally {
        setIsThinking(false);
        setStreamingMessageId(null);
      }
    },
    [activeConversationId, refreshConversations],
  );

  useEffect(() => {
    if (!requestedConversationId) {
      if (messages.length > 0 || isThinking || activeConversationId) {return;}
      resetToNewChat(false);
      return;
    }
    if (loadedConversationIdRef.current === requestedConversationId) {return;}
    void loadConversation(requestedConversationId);
  }, [
    activeConversationId,
    isThinking,
    loadConversation,
    messages.length,
    requestedConversationId,
    resetToNewChat,
  ]);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  useEffect(() => {
    if (!draft.trim()) {return;}
    setInput(draft);
  }, [draft]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'u') {return;}
      event.preventDefault();
      if (isReplyInFlight) {return;}
      fileInputRef.current?.click();
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [isReplyInFlight, fileInputRef]);

  useEffect(() => {
    const handler = () => {
      resetToNewChat(true);
      setTimeout(() => inputRef.current?.focus(), 50);
    };
    window.addEventListener('kloel:new-chat', handler);
    return () => window.removeEventListener('kloel:new-chat', handler);
  }, [resetToNewChat]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, isThinking]);

  useEffect(() => {
    if (!isReplyInFlight) {
      setShowSlowHint(false);
      return;
    }
    const timeoutId = window.setTimeout(() => {
      setShowSlowHint(true);
    }, SLOW_HINT_DELAY_MS);
    return () => window.clearTimeout(timeoutId);
  }, [isReplyInFlight]);

  useEffect(() => {
    return () => {
      activeStreamRef.current?.abort();
      activeStreamRef.current = null;
      if (playbackTimerRef.current) {
        clearTimeout(playbackTimerRef.current);
        playbackTimerRef.current = null;
      }
    };
  }, []);

  const composerPlaceholder = capabilityPromptLabel(activeCapability, hasMessages);

  return (
    <KloelDashboardView
      isDragActive={isDragActive}
      hasMessages={hasMessages}
      messages={messages}
      conversationTitle={conversationTitle}
      onTitle={onTitle}
      streamingMessageId={streamingMessageId}
      isThinking={isThinking}
      isReplyInFlight={isReplyInFlight}
      showSlowHint={showSlowHint}
      greetingLine={greetingLine}
      input={input}
      composerPlaceholder={composerPlaceholder}
      activeCapability={activeCapability}
      attachments={attachments}
      linkedProduct={linkedProduct}
      selectableProducts={selectableProducts}
      selectableProductsLoading={selectableProductsLoading}
      composerNotice={composerNotice}
      pendingApprovals={pendingApprovalsData || []}
      pendingApprovalsLoading={pendingApprovalsLoading}
      approvalActionInFlight={approvalActionInFlight}
      fileInputRef={fileInputRef}
      inputRef={inputRef}
      messagesEndRef={messagesEndRef}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDropFiles={handleDropFiles}
      onQueueFilesForUpload={queueFilesForUpload}
      onQuickAction={handleQuickAction}
      onUserEdit={handleUserEdit}
      onUserRetry={handleUserRetry}
      onAssistantFeedback={handleAssistantFeedback}
      onAssistantRegenerate={handleAssistantRegenerate}
      onCancelActiveReply={handleCancelActiveReply}
      onInputChange={setInput}
      onSend={handleSend}
      onRemoveAttachment={clearAttachmentById}
      onRetryAttachment={handleRetryAttachment}
      onSelectProduct={setLinkedProduct}
      onRemoveLinkedProduct={() => setLinkedProduct(null)}
      onCapabilityChange={setActiveCapability}
      onApprovalDecision={handleApprovalDecision}
    />
  );
}
