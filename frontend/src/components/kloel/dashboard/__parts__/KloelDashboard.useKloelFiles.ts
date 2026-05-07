'use client';

import type { KloelChatAttachment } from '@/lib/kloel-chat';
import { uploadChatFile } from '@/lib/api/kloel';
import {
  computeAttachmentKind,
  createClientRequestId,
  toErrorMessage,
} from '../KloelDashboard.helpers';
import { MAX_ATTACHMENTS_PER_PROMPT } from '../KloelDashboard.subcomponents';
import {
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
  useCallback,
  useRef,
  useState,
} from 'react';

export interface UseKloelFilesReturn {
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
