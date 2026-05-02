'use client';

import {
  type KloelChatAttachment,
  type KloelChatCapability,
  type KloelChatRequestMetadata,
  type KloelLinkedProduct,
} from '@/lib/kloel-chat';
import { streamAuthenticatedKloelMessage } from '@/lib/kloel-conversations';
import { KLOEL_CHAT_ROUTE } from '@/lib/kloel-dashboard-context';
import { appendAssistantTraceFromEvent } from '@/lib/kloel-message-ui';
import { uploadChatFile } from '@/lib/api/kloel';
import {
  computeAttachmentKind,
  computeDrainStep,
  createClientRequestId,
  hasDraggedFiles,
  toErrorMessage,
} from './KloelDashboard.helpers';
import { type DashboardMessage } from './KloelDashboard.message';
import { MAX_ATTACHMENTS_PER_PROMPT } from './KloelDashboard.subcomponents';
import {
  type Dispatch,
  type DragEvent as ReactDragEvent,
  type MutableRefObject,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useRouter } from 'next/navigation';

// ─── useKloelFiles ───────────────────────────────────────────────────────────

interface UseKloelFilesReturn {
  attachments: KloelChatAttachment[];
  composerNotice: string | null;
  setComposerNotice: Dispatch<SetStateAction<string | null>>;
  clearAttachmentById: (attachmentId: string) => void;
  clearAllAttachments: () => void;
  queueFilesForUpload: (selectedFiles: FileList | File[] | null) => Promise<void>;
  handleRetryAttachment: (attachmentId: string) => Promise<void>;
  attachmentFileMapRef: MutableRefObject<Map<string, File>>;
  fileInputRef: MutableRefObject<HTMLInputElement | null>;
}

export function useKloelFiles(): UseKloelFilesReturn {
  const [attachments, setAttachments] = useState<KloelChatAttachment[]>([]);
  const [composerNotice, setComposerNotice] = useState<string | null>(null);
  const attachmentFileMapRef = useRef<Map<string, File>>(new Map());
  const attachmentPreviewUrlMapRef = useRef<Map<string, string>>(new Map());
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      if (files.length === 0) {
        return;
      }

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
          kind: computeAttachmentKind(file),
          status: 'uploading',
          previewUrl,
          error: null,
        } satisfies KloelChatAttachment;
      });

      setAttachments((current) => [...current, ...staged]);
      await Promise.all(
        staged.map((attachment, index) => {
          const file = acceptedFiles[index];
          if (!file) {
            return Promise.resolve();
          }
          return uploadAttachmentFile(attachment.id, file);
        }),
      );
    },
    [attachments.length, uploadAttachmentFile],
  );

  const handleRetryAttachment = useCallback(
    async (attachmentId: string) => {
      const file = attachmentFileMapRef.current.get(attachmentId);
      if (!file) {
        return;
      }

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

  return {
    attachments,
    composerNotice,
    setComposerNotice,
    clearAttachmentById,
    clearAllAttachments,
    queueFilesForUpload,
    handleRetryAttachment,
    attachmentFileMapRef,
    fileInputRef,
  };
}

// ─── useKloelDragDrop ────────────────────────────────────────────────────────

interface UseKloelDragDropDeps {
  isReplyInFlight: boolean;
  queueFilesForUpload: (selectedFiles: FileList | File[] | null) => Promise<void>;
  setComposerNotice: Dispatch<SetStateAction<string | null>>;
  inputRef: MutableRefObject<HTMLTextAreaElement | null>;
}

interface UseKloelDragDropReturn {
  isDragActive: boolean;
  handleDragEnter: (event: ReactDragEvent<HTMLElement>) => void;
  handleDragOver: (event: ReactDragEvent<HTMLElement>) => void;
  handleDragLeave: (event: ReactDragEvent<HTMLElement>) => void;
  handleDropFiles: (event: ReactDragEvent<HTMLElement>) => Promise<void>;
}

export function useKloelDragDrop(deps: UseKloelDragDropDeps): UseKloelDragDropReturn {
  const { isReplyInFlight, queueFilesForUpload, setComposerNotice, inputRef } = deps;
  const [isDragActive, setIsDragActive] = useState(false);
  const dragDepthRef = useRef(0);

  const clearDragState = useCallback(() => {
    dragDepthRef.current = 0;
    setIsDragActive(false);
  }, []);

  const handleDragEnter = useCallback((event: ReactDragEvent<HTMLElement>) => {
    if (!hasDraggedFiles(event.dataTransfer)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current += 1;
    setIsDragActive(true);
  }, []);

  const handleDragOver = useCallback(
    (event: ReactDragEvent<HTMLElement>) => {
      if (!hasDraggedFiles(event.dataTransfer)) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = 'copy';
      if (!isDragActive) {
        setIsDragActive(true);
      }
    },
    [isDragActive],
  );

  const handleDragLeave = useCallback((event: ReactDragEvent<HTMLElement>) => {
    if (!hasDraggedFiles(event.dataTransfer)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setIsDragActive(false);
    }
  }, []);

  const handleDropFiles = useCallback(
    async (event: ReactDragEvent<HTMLElement>) => {
      if (!hasDraggedFiles(event.dataTransfer)) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      clearDragState();

      if (isReplyInFlight) {
        setComposerNotice('Aguarde a resposta atual antes de anexar novos arquivos.');
        return;
      }

      await queueFilesForUpload(event.dataTransfer.files);
      inputRef.current?.focus();
    },
    [clearDragState, isReplyInFlight, queueFilesForUpload, inputRef, setComposerNotice],
  );

  useEffect(() => {
    const handleWindowDrop = (event: DragEvent) => {
      if (!hasDraggedFiles(event.dataTransfer)) {
        return;
      }
      event.preventDefault();
      clearDragState();
    };

    const handleWindowDragOver = (event: DragEvent) => {
      if (!hasDraggedFiles(event.dataTransfer)) {
        return;
      }
      event.preventDefault();
    };

    const handleWindowDragEnd = () => {
      clearDragState();
    };

    window.addEventListener('drop', handleWindowDrop);
    window.addEventListener('dragover', handleWindowDragOver);
    window.addEventListener('dragend', handleWindowDragEnd);
    return () => {
      window.removeEventListener('drop', handleWindowDrop);
      window.removeEventListener('dragover', handleWindowDragOver);
      window.removeEventListener('dragend', handleWindowDragEnd);
    };
  }, [clearDragState]);

  return {
    isDragActive,
    handleDragEnter,
    handleDragOver,
    handleDragLeave,
    handleDropFiles,
  };
}

// ─── createSendMessageHandler ─────────────────────────────────────────────────

export interface SendMessageContext {
  setMessages: Dispatch<SetStateAction<DashboardMessage[]>>;
  setIsThinking: Dispatch<SetStateAction<boolean>>;
  setStreamingMessageId: Dispatch<SetStateAction<string | null>>;
  setActiveConversationId: Dispatch<SetStateAction<string | null>>;
  setConversationTitle: Dispatch<SetStateAction<string>>;
  isReplyInFlight: boolean;
  activeConversationId: string | null;
  conversationTitle: string;
  conversationTitleMap: Map<string, string>;
  clearAllAttachments: () => void;
  loadConversation: (id: string) => Promise<void>;
  refreshConversations: () => Promise<void>;
  upsertConversation: (conv: {
    id: string;
    title: string;
    updatedAt: string;
    lastMessagePreview: string;
  }) => void;
  setActiveConversation: (id: string | null) => void;
  requestedConversationId: string | null;
  router: ReturnType<typeof useRouter>;
  attachments: KloelChatAttachment[];
  linkedProduct: KloelLinkedProduct | null;
  activeCapability: KloelChatCapability | null;
  activeStreamRef: MutableRefObject<{ abort: () => void } | null>;
  streamingMessageId: string | null;
}

export function createSendMessageHandler(ctx: SendMessageContext) {
  return async (rawText: string, requestMetadata?: KloelChatRequestMetadata) => {
    const text = rawText.trim();
    if (!text || ctx.isReplyInFlight) {
      return;
    }
    const clientRequestId = createClientRequestId();
    const buildMetadata = (cid: string): KloelChatRequestMetadata => ({
      clientRequestId: cid,
      source: 'kloel_dashboard',
      attachments: ctx.attachments
        .filter((a) => a.status === 'ready')
        .map((a) => ({
          id: a.id,
          name: a.name,
          size: a.size,
          mimeType: a.mimeType,
          kind: a.kind,
          url: a.url || a.previewUrl || null,
        })),
      linkedProduct: ctx.linkedProduct,
      capability: ctx.activeCapability,
    });

    const normalizedMetadata = {
      ...(requestMetadata || buildMetadata(clientRequestId)),
      clientRequestId,
      source: 'kloel_dashboard',
    } satisfies KloelChatRequestMetadata;

    const userMessage: DashboardMessage = {
      id: `user_${Date.now()}`,
      role: 'user',
      text,
      metadata: normalizedMetadata,
    };

    ctx.setMessages((current) => [...current, userMessage]);
    ctx.clearAllAttachments();
    ctx.setIsThinking(true);

    const assistantId = `assistant_${Date.now()}`;
    let streamedReply = '';
    let renderBuffer = '';
    let nextConversationId = ctx.activeConversationId || null;
    let nextTitle = ctx.conversationTitle;
    let streamEnded = false;
    let finalized = false;
    let finalError: string | null = null;
    let hasExitedThinking = false;
    const thinkingStartedAt = Date.now();
    const minimumThinkingMs = 420;
    const playbackTimerRef: { current: ReturnType<typeof setTimeout> | null } = { current: null };

    const syncAssistantText = (nextText: string) => {
      ctx.setMessages((current) =>
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
      if (finalized) {
        return;
      }
      finalized = true;
      clearPlaybackTimer();
      ctx.activeStreamRef.current = null;
      ctx.setIsThinking(false);
      ctx.setStreamingMessageId(null);

      if (nextConversationId) {
        ctx.upsertConversation({
          id: nextConversationId,
          title: nextTitle || 'Nova conversa',
          updatedAt: new Date().toISOString(),
          lastMessagePreview: streamedReply.trim() || 'Resposta gerada pelo Kloel',
        });
        void ctx.refreshConversations();
        void ctx.loadConversation(nextConversationId);
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
        ctx.setIsThinking(false);
      }

      if (renderBuffer.length > 0) {
        const step = computeDrainStep(renderBuffer.length);
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

    try {
      ctx.setMessages((current) => [
        ...current,
        {
          id: assistantId,
          role: 'assistant',
          text: '',
          metadata: { clientRequestId },
        },
      ]);
      ctx.setStreamingMessageId(assistantId);

      ctx.activeStreamRef.current = streamAuthenticatedKloelMessage(
        {
          message: text,
          conversationId: ctx.activeConversationId || undefined,
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
              ctx.setIsThinking(true);
            }

            ctx.setMessages((current) =>
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
              (thread.conversationId
                ? ctx.conversationTitleMap.get(thread.conversationId)
                : null) ||
              nextTitle ||
              'Nova conversa';

            ctx.setActiveConversationId(thread.conversationId);
            ctx.setConversationTitle(nextTitle || 'Nova conversa');
            ctx.setActiveConversation(thread.conversationId);

            if (ctx.requestedConversationId !== thread.conversationId) {
              ctx.router.replace(
                `${KLOEL_CHAT_ROUTE}?conversationId=${encodeURIComponent(thread.conversationId)}`,
                { scroll: false },
              );
            }
          },
          onDone: () => {
            streamEnded = true;
            scheduleDrain();
          },
          onError: (error) => {
            finalError = error || 'Desculpe, ocorreu uma instabilidade ao continuar sua conversa.';
            if (!streamedReply.trim() && !renderBuffer.trim()) {
              renderBuffer = finalError;
            }
            streamEnded = true;
            scheduleDrain();
          },
        },
      );
    } catch (error: unknown) {
      clearPlaybackTimer();
      ctx.activeStreamRef.current = null;
      ctx.setIsThinking(false);
      ctx.setStreamingMessageId(null);
      ctx.setMessages((current) => [
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
  };
}
