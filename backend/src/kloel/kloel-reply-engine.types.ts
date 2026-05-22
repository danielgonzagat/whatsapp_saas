export type ExpertiseLevel = 'INICIANTE' | 'INTERMEDIÁRIO' | 'AVANÇADO' | 'EXPERT';

export interface ReplyMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export type LocalToolExecutor = (
  workspaceId: string,
  toolName: string,
  args: Record<string, unknown>,
  userId?: string,
) => Promise<{ success: boolean; message?: string; error?: string; [key: string]: unknown }>;
