'use client';

import {
  AssistantProcessingTraceCard,
  AssistantVersionNavigator,
} from '@/components/kloel/AssistantResponseChrome';
import { KloelMushroomVisual } from '@/components/kloel/KloelBrand';
import { KloelMarkdown } from '@/components/kloel/KloelMarkdown';
import { MessageActionBar } from '@/components/kloel/MessageActionBar';
import { useAuth } from '@/components/kloel/auth/auth-provider';
import { openCookiePreferences } from '@/components/kloel/cookies/CookieProvider';
import {
  KloelChatComposer,
  type KloelChatSelectableProduct,
} from '@/components/kloel/dashboard/KloelChatComposer';
import { useConversationHistory } from '@/hooks/useConversationHistory';
import { affiliateApi } from '@/lib/api/misc';
import { productApi } from '@/lib/api/products';
import { uploadChatFile } from '@/lib/api/kloel';
import {
  KLOEL_CHAT_CAPABILITY_PLACEHOLDERS,
  type KloelChatAttachment,
  type KloelChatCapability,
  type KloelChatRequestMetadata,
  type KloelLinkedProduct,
} from '@/lib/kloel-chat';
import {
  loadKloelThreadMessages,
  regenerateKloelConversationMessage,
  streamAuthenticatedKloelMessage,
  updateKloelMessageFeedback,
  updateKloelThreadMessage,
} from '@/lib/kloel-conversations';
import { KLOEL_CHAT_ROUTE } from '@/lib/kloel-dashboard-context';
import {
  appendAssistantTraceFromEvent,
  createAssistantSystemTraceEntry,
  getAssistantProcessingTrace,
  getAssistantResponseVersions,
  summarizeAssistantProcessingTrace,
} from '@/lib/kloel-message-ui';
import { KLOEL_THEME } from '@/lib/kloel-theme';
import { AnimatePresence, motion } from 'framer-motion';
import { Globe } from 'lucide-react';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';

const S_RE = /\s+/;

const F = "'Sora', sans-serif";
const E = KLOEL_THEME.accent;
const EMBER = KLOEL_THEME.accent;
const V = KLOEL_THEME.bgPrimary;
const TEXT = KLOEL_THEME.textPrimary;
const MUTED = KLOEL_THEME.textSecondary;
const MUTED_2 = KLOEL_THEME.textTertiary;
const SURFACE = KLOEL_THEME.bgCard;
const DIVIDER = KLOEL_THEME.borderPrimary;
const CHAT_MAX_WIDTH = 760;
const CHAT_INLINE_PADDING = 'clamp(16px, 3vw, 24px)';
const CHAT_SAFE_BOTTOM = 'max(20px, env(safe-area-inset-bottom, 0px))';
const CHAT_SCROLL_BOTTOM_SPACE = 56;
const SLOW_HINT_DELAY_MS = 30_000;
const MAX_ATTACHMENTS_PER_PROMPT = 10;

type JsonRecord = Record<string, unknown>;

interface OwnedProductSummary {
  id?: string | null;
  name?: string | null;
  imageUrl?: string | null;
  status?: string | null;
  active?: boolean | null;
  category?: string | null;
}

interface OwnedProductsPayload {
  products?: OwnedProductSummary[] | null;
}

interface AffiliateCatalogProduct {
  id?: string | null;
  productId?: string | null;
  name?: string | null;
  imageUrl?: string | null;
  thumbnailUrl?: string | null;
  price?: number | null;
  category?: string | null;
}

interface AssistantAssetSource {
  title?: string | null;
  name?: string | null;
  url?: string | null;
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function unwrapApiPayload<T>(payload: unknown): T {
  if (isRecord(payload) && payload.data !== undefined) {
    return payload.data as T;
  }
  return payload as T;
}

function toMessageMetadata(metadata: unknown): JsonRecord | null {
  return isRecord(metadata) ? metadata : null;
}

function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  if (isRecord(error) && typeof error.message === 'string' && error.message.trim()) {
    return error.message;
  }

  return fallback;
}

type DashboardMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  metadata?: JsonRecord | null;
};

type AffiliateRequestRow = {
  id: string;
  status?: string | null;
  affiliateProductId?: string | null;
  affiliateProduct?: AffiliateCatalogProduct | null;
};

function capabilityPromptLabel(capability: KloelChatCapability | null, hasMessages: boolean) {
  if (capability) {
    return KLOEL_CHAT_CAPABILITY_PLACEHOLDERS[capability];
  }
  return hasMessages ? 'Responder...' : 'Como posso ajudar você hoje?';
}

function resolveOwnedProductStatus(product: OwnedProductSummary): KloelLinkedProduct['status'] {
  const rawStatus = String(product.status || '')
    .trim()
    .toUpperCase();
  if (product.active || rawStatus === 'PUBLISHED' || rawStatus === 'APPROVED') {
    return 'published';
  }
  return 'draft';
}

function mapLinkableProducts(payload: {
  owned: OwnedProductsPayload | null;
  affiliate: {
    items?: AffiliateRequestRow[] | null;
    products?: AffiliateRequestRow[] | null;
  } | null;
}): KloelChatSelectableProduct[] {
  const ownedProducts = Array.isArray(payload.owned?.products) ? payload.owned?.products : [];
  const affiliateItems = Array.isArray(payload.affiliate?.products)
    ? payload.affiliate?.products
    : Array.isArray(payload.affiliate?.items)
      ? payload.affiliate?.items
      : [];

  const owned = ownedProducts.map((product) => ({
    id: String(product.id || ''),
    source: 'owned' as const,
    name: String(product.name || 'Produto sem nome').trim() || 'Produto sem nome',
    imageUrl: typeof product.imageUrl === 'string' ? product.imageUrl : null,
    status: resolveOwnedProductStatus(product),
    productId: String(product.id || ''),
    subtitle:
      typeof product.category === 'string' && product.category.trim()
        ? product.category.trim()
        : null,
  }));

  const affiliate = affiliateItems
    .filter((request) => {
      const status = String(request.status || '')
        .trim()
        .toUpperCase();
      return status === 'APPROVED' || request.affiliateProduct;
    })
    .map((request) => {
      const affiliateProduct = request.affiliateProduct || {};
      const affiliateProductId = String(
        affiliateProduct.id || request.affiliateProductId || '',
      ).trim();

      return {
        id: affiliateProductId,
        source: 'affiliate' as const,
        name: String(affiliateProduct.name || 'Produto afiliado').trim() || 'Produto afiliado',
        imageUrl:
          typeof affiliateProduct.imageUrl === 'string'
            ? affiliateProduct.imageUrl
            : typeof affiliateProduct.thumbnailUrl === 'string'
              ? affiliateProduct.thumbnailUrl
              : null,
        status: 'affiliate' as const,
        productId:
          typeof affiliateProduct.productId === 'string' ? affiliateProduct.productId : null,
        affiliateProductId,
        subtitle:
          typeof affiliateProduct.category === 'string' && affiliateProduct.category.trim()
            ? affiliateProduct.category.trim()
            : 'Marketplace',
      };
    })
    .filter((product) => product.id);

  return [...owned, ...affiliate];
}

function createClientRequestId() {
  return (
    globalThis.crypto?.randomUUID?.() ||
    `kloel_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
  );
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'Bom dia';
  if (hour >= 12 && hour < 18) return 'Boa tarde';
  if (hour >= 18) return 'Boa noite';
  return 'Boa madrugada';
}

function AssistantThinkingState({ label }: { label: 'Kloel está pensando' }) {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 10,
        minHeight: 28,
        color: MUTED,
      }}
    >
      <KloelMushroomVisual size={18} animated spores="animated" traceColor={E} ariaHidden />
      <span style={{ fontSize: 13, color: MUTED }}>{label}</span>
    </div>
  );
}

function AssistantAssetBlock({ metadata }: { metadata?: JsonRecord | null }) {
  const generatedImageUrl =
    typeof metadata?.generatedImageUrl === 'string' ? metadata.generatedImageUrl : null;
  const generatedImageFilename =
    typeof metadata?.generatedImageFilename === 'string' && metadata.generatedImageFilename.trim()
      ? metadata.generatedImageFilename.trim()
      : 'kloel-image.png';
  const generatedImageDownloadHref = generatedImageUrl
    ? generatedImageUrl.startsWith('data:')
      ? generatedImageUrl
      : `/api/kloel/download-image?url=${encodeURIComponent(generatedImageUrl)}&filename=${encodeURIComponent(generatedImageFilename)}`
    : null;
  const generatedSiteHtml =
    typeof metadata?.generatedSiteHtml === 'string' ? metadata.generatedSiteHtml : null;
  const webSources = Array.isArray(metadata?.webSources)
    ? metadata.webSources.filter((source): source is AssistantAssetSource => isRecord(source))
    : [];

  if (!generatedImageUrl && !generatedSiteHtml && webSources.length === 0) {
    return null;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 18 }}>
      {generatedImageUrl ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            width: 'min(100%, 520px)',
          }}
        >
          <a
            href={generatedImageUrl}
            target="_blank"
            rel="noreferrer"
            style={{
              display: 'block',
              width: '100%',
              borderRadius: 14,
              overflow: 'hidden',
              border: `1px solid ${DIVIDER}`,
              textDecoration: 'none',
            }}
          >
            <img
              src={generatedImageUrl}
              alt="Imagem criada pelo Kloel"
              style={{ width: '100%', height: 'auto', display: 'block', objectFit: 'cover' }}
            />
          </a>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <a
              href={generatedImageUrl}
              target="_blank"
              rel="noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: 36,
                padding: '0 14px',
                borderRadius: 999,
                border: `1px solid ${DIVIDER}`,
                background: SURFACE,
                color: TEXT,
                fontSize: 13,
                fontWeight: 700,
                textDecoration: 'none',
              }}
            >
              Abrir
            </a>
            <a
              href={generatedImageDownloadHref || generatedImageUrl}
              download={generatedImageUrl.startsWith('data:') ? generatedImageFilename : undefined}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: 36,
                padding: '0 14px',
                borderRadius: 999,
                border: `1px solid color-mix(in srgb, ${E} 22%, ${DIVIDER})`,
                background: `color-mix(in srgb, ${E} 10%, ${SURFACE})`,
                color: E,
                fontSize: 13,
                fontWeight: 700,
                textDecoration: 'none',
              }}
            >
              Baixar
            </a>
          </div>
        </div>
      ) : null}

      {generatedSiteHtml ? (
        <div
          style={{
            width: 'min(100%, 620px)',
            borderRadius: 14,
            border: `1px solid ${DIVIDER}`,
            overflow: 'hidden',
            background: SURFACE,
          }}
        >
          <div
            style={{
              padding: '10px 14px',
              borderBottom: `1px solid ${DIVIDER}`,
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              color: MUTED,
            }}
          >
            Preview do site
          </div>
          <iframe
            title="Preview do site gerado"
            srcDoc={generatedSiteHtml}
            sandbox="allow-same-origin"
            style={{
              width: '100%',
              minHeight: 320,
              border: 'none',
              background: KLOEL_THEME.textInverse,
            }}
          />
        </div>
      ) : null}

      {webSources.length > 0 ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            width: 'min(100%, 620px)',
          }}
        >
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              color: MUTED,
            }}
          >
            Fontes
          </span>
          {webSources.map((source, index) => {
            const title =
              typeof source?.title === 'string' && source.title.trim()
                ? source.title.trim()
                : `Fonte ${index + 1}`;
            const url = typeof source?.url === 'string' ? source.url : '';
            if (!url) return null;
            return (
              <a
                key={`${url}_${index}`}
                href={url}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  minHeight: 44,
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: `1px solid ${DIVIDER}`,
                  textDecoration: 'none',
                  color: TEXT,
                  background: SURFACE,
                }}
              >
                <Globe size={14} strokeWidth={1.9} color={EMBER} />
                <span
                  style={{
                    fontSize: 14,
                    lineHeight: 1.4,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {title}
                </span>
              </a>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function MessageBlock({
  message,
  isStreaming = false,
  isThinking = false,
  isBusy = false,
  showSlowHint = false,
  onUserEdit,
  onUserRetry,
  onAssistantFeedback,
  onAssistantRegenerate,
  onCancelProcessing,
}: {
  message: DashboardMessage;
  isStreaming?: boolean;
  isThinking?: boolean;
  isBusy?: boolean;
  showSlowHint?: boolean;
  onUserEdit?: (messageId: string, nextText: string) => Promise<void>;
  onUserRetry?: (messageId: string) => Promise<void>;
  onAssistantFeedback?: (messageId: string, type: 'positive' | 'negative' | null) => Promise<void>;
  onAssistantRegenerate?: (messageId: string) => Promise<void>;
  onCancelProcessing?: () => void;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [draftText, setDraftText] = useState(message.text);
  const assistantVersions = useMemo(
    () => getAssistantResponseVersions(message.metadata, message.text, message.id),
    [message.id, message.metadata, message.text],
  );
  const processingTrace = useMemo(
    () => getAssistantProcessingTrace(message.metadata),
    [message.metadata],
  );
  const processingSummary = useMemo(
    () =>
      summarizeAssistantProcessingTrace(
        processingTrace,
        typeof message.metadata?.processingSummary === 'string'
          ? message.metadata.processingSummary
          : undefined,
      ),
    [message.metadata, processingTrace],
  );
  const latestVersionId = assistantVersions[assistantVersions.length - 1]?.id || message.id;
  const [activeVersionIndex, setActiveVersionIndex] = useState(
    Math.max(assistantVersions.length - 1, 0),
  );

  useEffect(() => {
    if (!isEditing) {
      setDraftText(message.text);
    }
  }, [isEditing, message.text]);

  useEffect(() => {
    setActiveVersionIndex(Math.max(assistantVersions.length - 1, 0));
  }, [message.id, latestVersionId]);

  if (message.role === 'user') {
    return (
      <div
        style={{ display: 'flex', justifyContent: 'flex-end' }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div style={{ width: 'min(78%, 680px)' }}>
          {isEditing ? (
            <div
              style={{
                background: SURFACE,
                border: `1px solid ${DIVIDER}`,
                borderRadius: 6,
                padding: 14,
              }}
            >
              <textarea
                value={draftText}
                onChange={(event) => setDraftText(event.target.value)}
                rows={Math.max(3, Math.min(10, draftText.split('\n').length + 1))}
                style={{
                  width: '100%',
                  minHeight: 84,
                  resize: 'vertical',
                  border: `1px solid ${DIVIDER}`,
                  borderRadius: 6,
                  background: V,
                  color: TEXT,
                  fontFamily: F,
                  fontSize: 15,
                  lineHeight: 1.7,
                  padding: '12px 14px',
                  outline: 'none',
                }}
              />
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: 8,
                  marginTop: 12,
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setDraftText(message.text);
                    setIsEditing(false);
                  }}
                  style={{
                    border: `1px solid ${DIVIDER}`,
                    borderRadius: 6,
                    background: 'transparent',
                    color: MUTED,
                    fontFamily: F,
                    fontSize: 13,
                    fontWeight: 600,
                    padding: '8px 12px',
                    cursor: 'pointer',
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={isBusy || !draftText.trim() || draftText.trim() === message.text.trim()}
                  onClick={async () => {
                    await onUserEdit?.(message.id, draftText.trim());
                    setIsEditing(false);
                  }}
                  style={{
                    border: 'none',
                    borderRadius: 6,
                    background: EMBER,
                    color: KLOEL_THEME.textOnAccent,
                    fontFamily: F,
                    fontSize: 13,
                    fontWeight: 700,
                    padding: '8px 12px',
                    cursor:
                      isBusy || !draftText.trim() || draftText.trim() === message.text.trim()
                        ? 'default'
                        : 'pointer',
                    opacity:
                      isBusy || !draftText.trim() || draftText.trim() === message.text.trim()
                        ? 0.45
                        : 1,
                  }}
                >
                  Salvar
                </button>
              </div>
            </div>
          ) : (
            <>
              <div
                style={{
                  background: `color-mix(in srgb, ${KLOEL_THEME.accent} 6%, ${KLOEL_THEME.bgSecondary})`,
                  border: `1px solid color-mix(in srgb, ${KLOEL_THEME.accent} 22%, ${KLOEL_THEME.borderPrimary})`,
                  borderRadius: 6,
                  padding: '14px 18px',
                  fontSize: 15,
                  color: KLOEL_THEME.textPrimary,
                  lineHeight: 1.7,
                  fontFamily: F,
                  whiteSpace: 'pre-wrap',
                }}
              >
                {message.text}
              </div>
              <MessageActionBar
                content={message.text}
                align="right"
                visible={isHovered}
                actions={[
                  {
                    id: 'edit',
                    label: 'Editar',
                    icon: 'edit',
                    disabled: isBusy,
                    onClick: () => setIsEditing(true),
                  },
                  {
                    id: 'retry',
                    label: 'Reenviar',
                    icon: 'retry',
                    disabled: isBusy,
                    onClick: async () => {
                      await onUserRetry?.(message.id);
                    },
                  },
                ]}
              />
            </>
          )}
        </div>
      </div>
    );
  }

  const feedbackRecord = isRecord(message.metadata?.feedback) ? message.metadata.feedback : null;
  const feedbackType =
    feedbackRecord?.type === 'positive' || feedbackRecord?.type === 'negative'
      ? (feedbackRecord.type as 'positive' | 'negative')
      : null;
  const visibleAssistantText =
    assistantVersions[Math.min(activeVersionIndex, Math.max(assistantVersions.length - 1, 0))]
      ?.content || message.text;
  const hasProcessingTrace = processingTrace.length > 0;
  const hasVisibleAssistantText = !!visibleAssistantText.trim();

  if (isThinking && !hasVisibleAssistantText) {
    if (hasProcessingTrace) {
      return (
        <AssistantProcessingTraceCard
          entries={processingTrace}
          summary={processingSummary}
          isProcessing={true}
          showSlowHint={showSlowHint}
          onCancel={onCancelProcessing}
        />
      );
    }

    return <AssistantThinkingState label="Kloel está pensando" />;
  }

  return (
    <div
      style={{
        fontSize: 15,
        color: TEXT,
        lineHeight: 1.78,
        fontFamily: F,
      }}
    >
      {hasProcessingTrace ? (
        <AssistantProcessingTraceCard
          entries={processingTrace}
          summary={processingSummary}
          isProcessing={isThinking}
          showSlowHint={showSlowHint}
          onCancel={onCancelProcessing}
        />
      ) : null}

      <AssistantVersionNavigator
        total={assistantVersions.length}
        activeIndex={Math.min(activeVersionIndex, Math.max(assistantVersions.length - 1, 0))}
        onChange={setActiveVersionIndex}
      />

      <AssistantAssetBlock metadata={message.metadata} />
      <KloelMarkdown content={visibleAssistantText} />
      {isStreaming ? (
        <span
          aria-hidden
          style={{
            display: 'inline-block',
            width: 8,
            height: '1.1em',
            marginLeft: 6,
            borderRadius: 999,
            verticalAlign: 'text-bottom',
            background: KLOEL_THEME.accent,
            animation: 'kloel-stream-caret 1s steps(1, end) infinite',
          }}
        />
      ) : null}
      {!isThinking && hasVisibleAssistantText ? (
        <MessageActionBar
          content={visibleAssistantText}
          align="left"
          visible={true}
          actions={[
            {
              id: 'thumbs-up',
              label: 'Gostei',
              icon: 'thumbsUp',
              active: feedbackType === 'positive',
              disabled: isBusy,
              onClick: async () => {
                await onAssistantFeedback?.(
                  message.id,
                  feedbackType === 'positive' ? null : 'positive',
                );
              },
            },
            {
              id: 'thumbs-down',
              label: 'Não Gostei',
              icon: 'thumbsDown',
              active: feedbackType === 'negative',
              disabled: isBusy,
              onClick: async () => {
                await onAssistantFeedback?.(
                  message.id,
                  feedbackType === 'negative' ? null : 'negative',
                );
              },
            },
            {
              id: 'retry',
              label: 'Tentar novamente',
              icon: 'retry',
              disabled: isBusy || isStreaming,
              onClick: async () => {
                await onAssistantRegenerate?.(message.id);
              },
            },
          ]}
        />
      ) : null}
    </div>
  );
}

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
  const [attachments, setAttachments] = useState<KloelChatAttachment[]>([]);
  const [linkedProduct, setLinkedProduct] = useState<KloelLinkedProduct | null>(null);
  const [activeCapability, setActiveCapability] = useState<KloelChatCapability | null>(null);
  const [composerNotice, setComposerNotice] = useState<string | null>(null);

  const loadedConversationIdRef = useRef<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const activeStreamRef = useRef<{ abort: () => void } | null>(null);
  const playbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attachmentFileMapRef = useRef<Map<string, File>>(new Map());
  const attachmentPreviewUrlMapRef = useRef<Map<string, string>>(new Map());

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
    () => new Map(conversations.map((conversation) => [conversation.id, conversation.title])),
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
  const isReplyInFlight = isThinking || Boolean(streamingMessageId);
  const selectableProducts = selectableProductsData || [];

  const clearAttachmentById = useCallback((attachmentId: string) => {
    const previewUrl = attachmentPreviewUrlMapRef.current.get(attachmentId);
    if (previewUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl);
    }
    attachmentPreviewUrlMapRef.current.delete(attachmentId);
    attachmentFileMapRef.current.delete(attachmentId);
    setAttachments((current) => current.filter((attachment) => attachment.id !== attachmentId));
  }, []);

  const clearAllAttachments = useCallback(() => {
    for (const previewUrl of attachmentPreviewUrlMapRef.current.values()) {
      if (previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl);
      }
    }
    attachmentPreviewUrlMapRef.current.clear();
    attachmentFileMapRef.current.clear();
    setAttachments([]);
  }, []);

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
      setInput('');
      setIsThinking(false);
      setStreamingMessageId(null);
      setComposerNotice(null);
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

  useEffect(() => {
    if (!requestedConversationId) {
      if (messages.length > 0 || isThinking || activeConversationId) {
        return;
      }
      resetToNewChat(false);
      return;
    }

    if (loadedConversationIdRef.current === requestedConversationId) {
      return;
    }

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
  }, [isReplyInFlight]);

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
  }, [messages, isThinking, streamingMessageId]);

  useEffect(() => {
    if (!isReplyInFlight) {
      setShowSlowHint(false);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setShowSlowHint(true);
    }, SLOW_HINT_DELAY_MS);

    return () => window.clearTimeout(timeoutId);
  }, [isReplyInFlight, streamingMessageId]);

  useEffect(() => {
    return () => {
      activeStreamRef.current?.abort();
      activeStreamRef.current = null;
      if (playbackTimerRef.current) {
        clearTimeout(playbackTimerRef.current);
        playbackTimerRef.current = null;
      }
      for (const previewUrl of attachmentPreviewUrlMapRef.current.values()) {
        if (previewUrl.startsWith('blob:')) {
          URL.revokeObjectURL(previewUrl);
        }
      }
    };
  }, []);

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

  const uploadAttachmentFile = useCallback(async (attachmentId: string, file: File) => {
    try {
      const uploaded = await uploadChatFile(file);
      setAttachments((current) =>
        current.map((attachment) =>
          attachment.id === attachmentId
            ? {
                ...attachment,
                status: 'ready',
                kind: uploaded.type,
                mimeType: uploaded.mimeType,
                name: uploaded.name,
                size: uploaded.size,
                url: uploaded.url,
                // Preserve the local blob preview after upload so the thumbnail
                // stays visible even if the final remote URL takes time to load.
                previewUrl: attachment.kind === 'image' ? attachment.previewUrl || null : null,
                error: null,
              }
            : attachment,
        ),
      );
    } catch (error: unknown) {
      setAttachments((current) =>
        current.map((attachment) =>
          attachment.id === attachmentId
            ? {
                ...attachment,
                status: 'error',
                error: toErrorMessage(error, 'Falha ao enviar o arquivo.'),
              }
            : attachment,
        ),
      );
    }
  }, []);

  const queueFilesForUpload = useCallback(
    async (selectedFiles: FileList | File[] | null) => {
      const files = selectedFiles ? Array.from(selectedFiles) : [];
      if (files.length === 0) return;

      const occupiedSlots = attachments.length;
      const availableSlots = Math.max(0, MAX_ATTACHMENTS_PER_PROMPT - occupiedSlots);
      if (availableSlots <= 0) {
        setComposerNotice('Você pode anexar até 10 itens por prompt.');
        return;
      }

      const acceptedFiles = files.slice(0, availableSlots);
      if (acceptedFiles.length < files.length) {
        setComposerNotice('Alguns arquivos foram ignorados porque o limite por prompt é 10.');
      } else {
        setComposerNotice(null);
      }

      const staged = acceptedFiles.map((file) => {
        const attachmentId = createClientRequestId();
        const previewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : null;
        if (previewUrl) {
          attachmentPreviewUrlMapRef.current.set(attachmentId, previewUrl);
        }
        attachmentFileMapRef.current.set(attachmentId, file);

        return {
          id: attachmentId,
          name: file.name,
          size: file.size,
          mimeType: file.type || 'application/octet-stream',
          kind: file.type.startsWith('image/')
            ? 'image'
            : file.type.startsWith('audio/')
              ? 'audio'
              : 'document',
          status: 'uploading',
          previewUrl,
          error: null,
        } satisfies KloelChatAttachment;
      });

      setAttachments((current) => [...current, ...staged]);
      await Promise.all(
        staged.map((attachment, index) =>
          uploadAttachmentFile(attachment.id, acceptedFiles[index]!),
        ),
      );
    },
    [attachments.length, uploadAttachmentFile],
  );

  const handleRetryAttachment = useCallback(
    async (attachmentId: string) => {
      const file = attachmentFileMapRef.current.get(attachmentId);
      if (!file) return;

      setAttachments((current) =>
        current.map((attachment) =>
          attachment.id === attachmentId
            ? { ...attachment, status: 'uploading', error: null }
            : attachment,
        ),
      );
      setComposerNotice(null);
      await uploadAttachmentFile(attachmentId, file);
    },
    [uploadAttachmentFile],
  );

  const buildCurrentRequestMetadata = useCallback(
    (clientRequestId: string): KloelChatRequestMetadata => ({
      clientRequestId,
      source: 'kloel_dashboard',
      attachments: attachments
        .filter((attachment) => attachment.status === 'ready')
        .map((attachment) => ({
          id: attachment.id,
          name: attachment.name,
          size: attachment.size,
          mimeType: attachment.mimeType,
          kind: attachment.kind,
          url: attachment.url || attachment.previewUrl || null,
        })),
      linkedProduct,
      capability: activeCapability,
    }),
    [activeCapability, attachments, linkedProduct],
  );

  const handleSendMessage = useCallback(
    async (rawText: string, requestMetadata?: KloelChatRequestMetadata) => {
      const text = rawText.trim();
      if (!text || isReplyInFlight) return;
      const clientRequestId = createClientRequestId();
      const normalizedMetadata = {
        ...(requestMetadata || buildCurrentRequestMetadata(clientRequestId)),
        clientRequestId,
        source: 'kloel_dashboard',
      } satisfies KloelChatRequestMetadata;

      const userMessage: DashboardMessage = {
        id: `user_${Date.now()}`,
        role: 'user',
        text,
        metadata: normalizedMetadata,
      };

      setMessages((current) => [...current, userMessage]);
      setInput('');
      clearAllAttachments();
      setComposerNotice(null);
      setIsThinking(true);

      try {
        const assistantId = `assistant_${Date.now()}`;
        let streamedReply = '';
        let renderBuffer = '';
        let nextConversationId = activeConversationId || null;
        let nextTitle = conversationTitle;
        let streamEnded = false;
        let finalized = false;
        let finalError: string | null = null;
        let hasExitedThinking = false;
        const thinkingStartedAt = Date.now();
        const minimumThinkingMs = 420;

        setMessages((current) => [
          ...current,
          {
            id: assistantId,
            role: 'assistant',
            text: '',
            metadata: {
              clientRequestId,
            },
          },
        ]);
        setStreamingMessageId(assistantId);

        const syncAssistantText = (nextText: string) => {
          setMessages((current) =>
            current.map((message) =>
              message.id === assistantId ? { ...message, text: nextText } : message,
            ),
          );
        };

        const clearPlaybackTimer = () => {
          if (playbackTimerRef.current) {
            clearTimeout(playbackTimerRef.current);
            playbackTimerRef.current = null;
          }
        };

        const finalizeStream = () => {
          if (finalized) return;
          finalized = true;
          clearPlaybackTimer();
          activeStreamRef.current = null;
          setIsThinking(false);
          setStreamingMessageId(null);

          if (nextConversationId) {
            upsertConversation({
              id: nextConversationId,
              title: nextTitle || 'Nova conversa',
              updatedAt: new Date().toISOString(),
              lastMessagePreview: streamedReply.trim() || 'Resposta gerada pelo Kloel',
            });
            void refreshConversations();
            void loadConversation(nextConversationId);
          }
        };

        const drainBufferedReply = () => {
          playbackTimerRef.current = null;

          if (finalized) {
            return;
          }

          if (!hasExitedThinking && renderBuffer.length > 0) {
            const remainingThinking = minimumThinkingMs - (Date.now() - thinkingStartedAt);
            if (remainingThinking > 0) {
              playbackTimerRef.current = setTimeout(drainBufferedReply, remainingThinking);
              return;
            }

            hasExitedThinking = true;
            setIsThinking(false);
          }

          if (renderBuffer.length > 0) {
            const step =
              renderBuffer.length > 280
                ? 28
                : renderBuffer.length > 120
                  ? 18
                  : renderBuffer.length > 48
                    ? 10
                    : 5;
            const nextSlice = renderBuffer.slice(0, step);
            renderBuffer = renderBuffer.slice(step);
            streamedReply += nextSlice;
            syncAssistantText(streamedReply);
            playbackTimerRef.current = setTimeout(drainBufferedReply, 20);
            return;
          }

          if (streamEnded) {
            if (finalError && !streamedReply.trim()) {
              streamedReply = finalError;
              syncAssistantText(streamedReply);
            }
            finalizeStream();
          }
        };

        const scheduleDrain = () => {
          if (playbackTimerRef.current) {
            return;
          }
          playbackTimerRef.current = setTimeout(drainBufferedReply, 0);
        };

        activeStreamRef.current = streamAuthenticatedKloelMessage(
          {
            message: text,
            conversationId: activeConversationId || undefined,
            mode: 'chat',
            metadata: normalizedMetadata,
          },
          {
            onEvent: (event) => {
              if (
                event.type === 'status' &&
                (event.phase === 'thinking' ||
                  event.phase === 'tool_calling' ||
                  event.phase === 'tool_result')
              ) {
                setIsThinking(true);
              }

              setMessages((current) =>
                current.map((message) =>
                  message.id === assistantId
                    ? {
                        ...message,
                        metadata: appendAssistantTraceFromEvent(message.metadata, event) || null,
                      }
                    : message,
                ),
              );
            },
            onChunk: (chunk) => {
              renderBuffer += chunk;
              scheduleDrain();
            },
            onThread: (thread) => {
              nextConversationId = thread.conversationId;
              nextTitle =
                thread.title ||
                (thread.conversationId ? conversationTitleMap.get(thread.conversationId) : null) ||
                nextTitle ||
                'Nova conversa';

              loadedConversationIdRef.current = thread.conversationId;
              setActiveConversationId(thread.conversationId);
              setConversationTitle(nextTitle || 'Nova conversa');
              setActiveConversation(thread.conversationId);

              if (requestedConversationId !== thread.conversationId) {
                router.replace(
                  `${KLOEL_CHAT_ROUTE}?conversationId=${encodeURIComponent(thread.conversationId)}`,
                  {
                    scroll: false,
                  },
                );
              }
            },
            onDone: () => {
              streamEnded = true;
              scheduleDrain();
            },
            onError: (error) => {
              finalError =
                error || 'Desculpe, ocorreu uma instabilidade ao continuar sua conversa.';
              if (!streamedReply.trim() && !renderBuffer.trim()) {
                renderBuffer = finalError;
              }
              streamEnded = true;
              scheduleDrain();
            },
          },
        );
      } catch (error: unknown) {
        if (playbackTimerRef.current) {
          clearTimeout(playbackTimerRef.current);
          playbackTimerRef.current = null;
        }
        setIsThinking(false);
        setStreamingMessageId(null);
        setMessages((current) => [
          ...current,
          {
            id: `assistant_error_${Date.now()}`,
            role: 'assistant',
            text: toErrorMessage(
              error,
              'Desculpe, ocorreu uma instabilidade ao continuar sua conversa.',
            ),
            metadata: null,
          },
        ]);
      }
    },
    [
      activeConversationId,
      buildCurrentRequestMetadata,
      clearAllAttachments,
      conversationTitle,
      conversationTitleMap,
      isReplyInFlight,
      refreshConversations,
      loadConversation,
      requestedConversationId,
      router,
      setActiveConversation,
      upsertConversation,
    ],
  );

  const handleSend = useCallback(() => {
    if (attachments.some((attachment) => attachment.status === 'uploading')) {
      setComposerNotice('Aguarde o envio dos anexos terminar antes de continuar.');
      return;
    }

    void handleSendMessage(input);
  }, [attachments, handleSendMessage, input]);

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
            ? {
                ...message,
                metadata: toMessageMetadata(updatedMessage.metadata),
              }
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
        if (targetIndex === -1) {
          return current;
        }

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
            metadata: {
              ...(targetMessage.metadata || {}),
              responseVersions: preservedVersions,
            },
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
          if (targetIndex === -1) {
            return current;
          }

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

  const hasMessages = messages.length > 0;
  const composerPlaceholder = capabilityPromptLabel(activeCapability, hasMessages);

  return (
    <div
      style={{
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
      <style>{`
        @keyframes kloel-stream-caret {
          0%, 49% {
            opacity: 1;
          }

          50%, 100% {
            opacity: 0.18;
          }
        }

        @keyframes spin {
          from {
            transform: rotate(0deg);
          }

          to {
            transform: rotate(360deg);
          }
        }

        textarea::placeholder {
          color: ${MUTED};
        }

        ::-webkit-scrollbar {
          width: 4px;
        }

        ::-webkit-scrollbar-thumb {
          background: ${DIVIDER};
          border-radius: 999px;
        }
      `}</style>

      <input
        ref={fileInputRef}
        type="file"
        hidden
        multiple
        accept="image/jpeg,image/png,image/gif,image/webp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/csv,audio/mpeg,audio/wav,audio/webm,audio/ogg,audio/mp4,audio/x-m4a"
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
            <div style={{ width: '100%', flexShrink: 0 }}>
              <div
                style={{
                  maxWidth: CHAT_MAX_WIDTH,
                  width: '100%',
                  margin: '0 auto',
                  padding: `10px ${CHAT_INLINE_PADDING} 0`,
                  boxSizing: 'border-box',
                  minHeight: 54,
                  display: 'flex',
                  alignItems: 'center',
                  borderBottom: '1px solid var(--app-border-subtle)',
                }}
              >
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: TEXT,
                    letterSpacing: '-0.01em',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {conversationTitle}
                </span>
              </div>
            </div>

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
              {!hasMessages ? (
                <motion.div
                  key="kloel-empty-state"
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -24 }}
                  transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    textAlign: 'center',
                    gap: 22,
                    marginBottom: 20,
                  }}
                >
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 'clamp(14px, 2vw, 18px)',
                    }}
                  >
                    <Image
                      src="/kloel-mushroom-animated.svg"
                      alt=""
                      aria-hidden
                      draggable={false}
                      unoptimized
                      width={60}
                      height={60}
                      style={{
                        width: 'clamp(48px, 4.8vw, 60px)',
                        height: 'auto',
                        display: 'block',
                        flexShrink: 0,
                        userSelect: 'none',
                        pointerEvents: 'none',
                      }}
                    />

                    <h1
                      suppressHydrationWarning
                      style={{
                        fontSize: 'clamp(30px, 5vw, 42px)',
                        fontWeight: 700,
                        letterSpacing: '-0.03em',
                        margin: 0,
                        color: TEXT,
                        lineHeight: 1.02,
                      }}
                    >
                      {greetingLine}
                    </h1>
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>

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
              {hasMessages ? (
                <motion.div
                  key="kloel-chat-disclaimer"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  transition={{ duration: 0.18, ease: 'easeOut' }}
                  style={{
                    margin: '12px auto 0',
                    width: '100%',
                    fontSize: 11,
                    color: MUTED_2,
                    lineHeight: 1.35,
                    textAlign: 'center',
                    letterSpacing: '-0.01em',
                  }}
                >
                  <span>Kloel é uma IA e pode errar. Confira informações importantes. </span>
                  <button
                    type="button"
                    onClick={openCookiePreferences}
                    style={{
                      appearance: 'none',
                      border: 'none',
                      background: 'transparent',
                      padding: 0,
                      margin: 0,
                      font: 'inherit',
                      color: 'inherit',
                      textDecoration: 'underline',
                      textUnderlineOffset: '2px',
                      cursor: 'pointer',
                    }}
                  >
                    Consulte as Preferências de cookies.
                  </button>
                </motion.div>
              ) : null}
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
    </div>
  );
}
