// Pure helpers extracted from KloelDashboard.tsx to reduce cyclomatic
// complexity. No React, no JSX — these are data-shape transforms only.

import {
  KLOEL_CHAT_CAPABILITY_PLACEHOLDERS,
  type KloelChatAttachment,
  type KloelChatCapability,
} from '@/lib/kloel-chat';

export type JsonRecord = Record<string, unknown>;

export function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function unwrapApiPayload<T>(payload: unknown): T {
  if (isRecord(payload) && payload.data !== undefined) {
    return payload.data as T;
  }
  return payload as T;
}

export function toMessageMetadata(metadata: unknown): JsonRecord | null {
  return isRecord(metadata) ? metadata : null;
}

export function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  if (isRecord(error) && typeof error.message === 'string' && error.message.trim()) {
    return error.message;
  }

  return fallback;
}

export function capabilityPromptLabel(
  capability: KloelChatCapability | null,
  hasMessages: boolean,
) {
  if (capability) {
    return KLOEL_CHAT_CAPABILITY_PLACEHOLDERS[capability];
  }
  return hasMessages ? 'Responder...' : 'Como posso ajudar você hoje?';
}

export function createClientRequestId() {
  return (
    globalThis.crypto?.randomUUID?.() ||
    `kloel_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
  );
}

export function hasDraggedFiles(dataTransfer: DataTransfer | null | undefined) {
  if (!dataTransfer) return false;
  if (dataTransfer.files && dataTransfer.files.length > 0) return true;
  return Array.from(dataTransfer.items || []).some((item) => item.kind === 'file');
}

export function getGreeting() {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'Bom dia';
  if (hour >= 12 && hour < 18) return 'Boa tarde';
  if (hour >= 18) return 'Boa noite';
  return 'Boa madrugada';
}

export function computeAttachmentKind(file: File): KloelChatAttachment['kind'] {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('audio/')) return 'audio';
  return 'document';
}

export function computeDrainStep(bufferLength: number) {
  if (bufferLength > 280) return 28;
  if (bufferLength > 120) return 18;
  if (bufferLength > 48) return 10;
  return 5;
}
