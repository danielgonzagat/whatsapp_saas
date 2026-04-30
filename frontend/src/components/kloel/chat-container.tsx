'use client';

// Legacy shell kept compatible with the published dashboard thread model.
import { useConversationHistory } from '@/hooks/useConversationHistory';
import { billingApi, tokenStorage, whatsappApi } from '@/lib/api';
import { loadKloelThreadMessages } from '@/lib/kloel-conversations';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AgentActivity, AgentStats } from './AgentConsole';
import { useAuth } from './auth/auth-provider';
import { AUTH_ERROR_MESSAGES, SEED_PRODUCT_KNOWLEDGE_PROMPT } from './chat-container.data';
import { applyAgentStatsEvent } from './chat-container.helpers';
import { connectAgentStream } from './chat-container.agent-stream';
import { processAgentEvent, currentTraceDayKey } from './chat-container.event-handler';
import { runGuestChat, runAuthedChat, extractErrorMessage } from './chat-container.message-sender';
import { useMessageActions } from './chat-container.message-actions';
import { useWhatsApp } from './chat-container.whatsapp-hook';
import { ChatLayout } from './chat-container.layout';
import type { Message } from './chat-message.types';
import type {
  AgentStreamEvent,
  AgentTraceEntry,
  AgentCursorTarget,
  ChatContainerProps,
} from './chat-container.types';
import { secureRandomFloat } from '@/lib/secure-random';

const SLOW_HINT_DELAY_MS = 30_000;

function mapThreadMessageToChatMessage(message: {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  metadata?: Record<string, unknown> | null;
}) {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    meta: message.metadata || undefined,
  } satisfies Message;
}

function normalizeMessageMeta(metadata: unknown): Record<string, unknown> | undefined {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return undefined;
  return metadata as Record<string, unknown>;
}

function createClientRequestId() {
  return (
    globalThis.crypto?.randomUUID?.() ||
    `kloel_${Date.now()}_${secureRandomFloat().toString(36).slice(2, 10)}`
  );
}

const EMPTY_AGENT_STATS: AgentStats = {
  messagesReceived: 0,
  messagesSent: 0,
  actionsExecuted: 0,
  leadsQualified: 0,
  activeConversations: 0,
  avgResponseTime: 'ao vivo',
};
