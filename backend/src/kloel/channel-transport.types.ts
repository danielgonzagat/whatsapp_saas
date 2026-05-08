import type { MindActionContext } from './mind-code-native.types';

export type ChannelName = 'whatsapp' | 'instagram' | 'messenger' | 'tiktok' | 'email';

export interface ChannelCapability {
  channel: ChannelName;
  sendAvailable: boolean;
  sendBlockedReason: string | null;
  requiredSetup: string[];
}

export interface ChannelSendRequest {
  workspaceId: string;
  channel: ChannelName;
  recipientId: string;
  content: string;
  mediaUrl?: string;
  mediaType?: 'image' | 'video' | 'audio' | 'document';
  guardContext?: MindActionContext;
}

export interface ChannelSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
  blocked: boolean;
  blockedReason?: string;
}

export interface ChannelTransportProvider {
  readonly channel: ChannelName;

  capability(workspaceId: string): Promise<ChannelCapability>;

  send(workspaceId: string, request: ChannelSendRequest): Promise<ChannelSendResult>;

  isConfigured(): boolean;
}

export const CHANNEL_TRANSPORT_REGISTRY = Symbol('CHANNEL_TRANSPORT_REGISTRY');
