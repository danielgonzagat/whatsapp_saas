import type { Prisma } from '@prisma/client';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ThinkRequest {
  message: string;
  workspaceId?: string;
  userId?: string;
  userName?: string;
  conversationId?: string;
  mode?: 'chat' | 'onboarding' | 'sales';
  companyContext?: string;
  metadata?: Prisma.InputJsonValue;
}

export interface ThinkSyncResult {
  response: string;
  conversationId?: string;
  title?: string;
}
