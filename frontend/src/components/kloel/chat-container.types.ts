// Types shared across chat-container split files.
// No 'use client' — pure type module.

export type { Message } from './chat-message.types';

export interface ChatContainerProps {
  initialOpenSettings?: boolean;
  initialSettingsTab?: 'account' | 'billing' | 'brain' | 'activity';
  initialScrollToCreditCard?: boolean;
}

export interface AgentStreamEvent {
  type:
    | 'thought'
    | 'status'
    | 'error'
    | 'backlog'
    | 'prompt'
    | 'contact'
    | 'summary'
    | 'sale'
    | 'heartbeat'
    | 'typing'
    | 'action'
    | 'proof'
    | 'account';
  workspaceId: string;
  ts?: string;
  message: string;
  phase?: string;
  runId?: string;
  persistent?: boolean;
  streaming?: boolean;
  token?: string;
  meta?: Record<string, unknown>;
}

export interface AgentTraceEntry {
  id: string;
  type: AgentStreamEvent['type'];
  phase?: string;
  message: string;
  timestamp: Date;
}

export interface AgentCursorTarget {
  x: number;
  y: number;
  actionType?: string;
  text?: string;
  timestamp: number;
}
