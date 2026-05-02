'use client';

import { kloelT } from '@/lib/i18n/t';
import { KloelChatComposer } from '@/components/kloel/dashboard/KloelChatComposer';
import { useAuth } from '@/components/kloel/auth/auth-provider';
import { useConversationHistory } from '@/hooks/useConversationHistory';
import { affiliateApi } from '@/lib/api/affiliate';
import { productApi } from '@/lib/api/products';
import {
  type KloelChatCapability,
  type KloelChatRequestMetadata,
  KLOEL_CHAT_QUICK_ACTIONS,
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
import { AnimatePresence, motion } from 'framer-motion';
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
import { type DashboardMessage, MessageBlock } from './KloelDashboard.message';
import {
  S_RE,
  F,
  V,
  TEXT,
  MUTED,
  DIVIDER,
  EMBER,
  SURFACE,
  CHAT_MAX_WIDTH,
  CHAT_INLINE_PADDING,
  CHAT_SAFE_BOTTOM,
  CHAT_SCROLL_BOTTOM_SPACE,
  SLOW_HINT_DELAY_MS,
  DashboardEmptyGreeting,
  ChatDisclaimer,
  ConversationHeaderBar,
  DashboardGlobalStyles,
  DropOverlay,
  QuickActionIcon,
} from './KloelDashboard.subcomponents';
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
  const { conversations, setActiveConversation, upsertConversation, refreshConversations } =
    useConversationHistory();

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

  const { data: selectableProductsData, isLoading: selectableProductsLoading } = useSWR(
    'kloel:chat-selectable-products',
    async () => {
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
    },
  );

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
      if (!conversationId) return;
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

  const handleSend = useCallback(() => {
    if (attachments.some((a) => a.status === 'uploading')) {
      setComposerNotice('Aguarde o envio dos anexos terminar antes de continuar.');
      return;
    }
    void handleSendMessage(input);
  }, [attachments, handleSendMessage, input, setComposerNotice]);

  const handleQuickAction = useCallback(
    (action: (typeof KLOEL_CHAT_QUICK_ACTIONS)[number]) => {
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
      if (!sourceMessage) return;
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
      if (!activeConversationId) return;
      setStreamingMessageId(messageId);
      setIsThinking(true);
      setMessages((current) => {
        const targetIndex = current.findIndex((message) => message.id === messageId);
        if (targetIndex === -1) return current;
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
          if (targetIndex === -1) return current;
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
      if (messages.length > 0 || isThinking || activeConversationId) return;
      resetToNewChat(false);
      return;
    }
    if (loadedConversationIdRef.current === requestedConversationId) return;
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
    if (!draft.trim()) return;
    setInput(draft);
  }, [draft]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'u') return;
      event.preventDefault();
      if (isReplyInFlight) return;
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
    <section
      aria-label="Área de chat"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={(event) => {
        void handleDropFiles(event);
      }}
      style={{
        position: 'relative',
        background: V,
        flex: 1,
        minHeight: 0,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: F,
        color: TEXT,
        overflow: 'hidden',
      }}
    >
      <AnimatePresence initial={false}>{isDragActive ? <DropOverlay /> : null}</AnimatePresence>

      <DashboardGlobalStyles />

      <input
        ref={fileInputRef}
        type="file"
        hidden
        multiple
        accept={kloelT(
          `image/jpeg,image/png,image/gif,image/webp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/csv,audio/mpeg,audio/wav,audio/webm,audio/ogg,audio/mp4,audio/x-m4a`,
        )}
        onChange={(event) => {
          void queueFilesForUpload(event.currentTarget.files);
          event.currentTarget.value = '';
        }}
      />

      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          overflow: 'hidden',
        }}
      >
        {hasMessages ? (
          <>
            <ConversationHeaderBar title={conversationTitle} />

            <div
              style={{
                flex: 1,
                minHeight: 0,
                overflowY: 'auto',
                overflowX: 'hidden',
                overscrollBehavior: 'contain',
                WebkitOverflowScrolling: 'touch',
                position: 'relative',
              }}
            >
              <div
                style={{
                  width: '100%',
                  maxWidth: CHAT_MAX_WIDTH,
                  margin: '0 auto',
                  padding: `28px ${CHAT_INLINE_PADDING} ${CHAT_SCROLL_BOTTOM_SPACE}px`,
                  boxSizing: 'border-box',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 28,
                  minHeight: '100%',
                }}
              >
                {messages.map((message) => (
                  <MessageBlock
                    key={message.id}
                    message={message}
                    isStreaming={message.id === streamingMessageId && !isThinking}
                    isThinking={message.id === streamingMessageId && isThinking}
                    isBusy={isReplyInFlight}
                    showSlowHint={message.id === streamingMessageId && showSlowHint}
                    onUserEdit={handleUserEdit}
                    onUserRetry={handleUserRetry}
                    onAssistantFeedback={handleAssistantFeedback}
                    onAssistantRegenerate={handleAssistantRegenerate}
                    onCancelProcessing={
                      message.id === streamingMessageId ? handleCancelActiveReply : undefined
                    }
                  />
                ))}

                <div ref={messagesEndRef} style={{ scrollMarginBottom: 96 }} />
              </div>
            </div>
          </>
        ) : null}

        <div
          style={{
            flex: hasMessages ? '0 0 auto' : 1,
            display: 'flex',
            alignItems: hasMessages ? 'flex-end' : 'center',
            justifyContent: 'center',
            paddingTop: hasMessages ? 18 : 32,
            paddingBottom: CHAT_SAFE_BOTTOM,
            minHeight: 0,
          }}
        >
          <motion.div
            layout
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            style={{
              width: '100%',
              maxWidth: CHAT_MAX_WIDTH,
              margin: '0 auto',
              padding: `0 ${CHAT_INLINE_PADDING}`,
              boxSizing: 'border-box',
            }}
          >
            <AnimatePresence initial={false}>
              {!hasMessages ? <DashboardEmptyGreeting greetingLine={greetingLine} /> : null}
            </AnimatePresence>

            {!hasMessages ? (
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  justifyContent: 'center',
                  gap: 10,
                  margin: '0 auto 16px',
                  maxWidth: CHAT_MAX_WIDTH,
                }}
              >
                {KLOEL_CHAT_QUICK_ACTIONS.map((action) => (
                  <button
                    key={action.id}
                    type="button"
                    onClick={() => handleQuickAction(action)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                      borderRadius: 999,
                      border: `1px solid color-mix(in srgb, ${DIVIDER} 74%, ${EMBER} 14%)`,
                      background: `color-mix(in srgb, ${SURFACE} 94%, ${V})`,
                      color: TEXT,
                      padding: '10px 14px',
                      fontSize: 13,
                      fontWeight: 600,
                      letterSpacing: '-0.01em',
                      cursor: 'pointer',
                      boxShadow: '0 10px 24px rgba(0, 0, 0, 0.12)',
                    }}
                  >
                    <QuickActionIcon icon={action.icon} />
                    <span>{action.label}</span>
                  </button>
                ))}
              </div>
            ) : null}

            <motion.div layout transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}>
              <KloelChatComposer
                input={input}
                placeholder={composerPlaceholder}
                disabled={isReplyInFlight}
                activeCapability={activeCapability}
                attachments={attachments}
                linkedProduct={linkedProduct}
                selectableProducts={selectableProducts}
                productsLoading={selectableProductsLoading}
                popoverPlacement={hasMessages ? 'above' : 'below'}
                inputRef={inputRef}
                onInputChange={setInput}
                onSend={handleSend}
                onOpenFilePicker={() => fileInputRef.current?.click()}
                onRemoveAttachment={clearAttachmentById}
                onRetryAttachment={(attachmentId) => {
                  void handleRetryAttachment(attachmentId);
                }}
                onSelectProduct={setLinkedProduct}
                onRemoveLinkedProduct={() => setLinkedProduct(null)}
                onCapabilityChange={setActiveCapability}
              />
            </motion.div>

            <AnimatePresence initial={false}>
              {hasMessages ? <ChatDisclaimer /> : null}
            </AnimatePresence>

            {composerNotice ? (
              <p
                style={{
                  margin: hasMessages ? '10px auto 0' : '14px auto 0',
                  fontSize: 12,
                  lineHeight: 1.45,
                  color: MUTED,
                  textAlign: 'center',
                }}
              >
                {composerNotice}
              </p>
            ) : null}
          </motion.div>
        </div>
      </div>
    </section>
  );
}
