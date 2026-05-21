import type { Prisma } from '@prisma/client';

export interface SignedGmailState {
  workspaceId: string;
  returnTo: string;
  ts: number;
}

export interface GoogleTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
}

export interface GoogleUserInfoResponse {
  id?: string;
  email?: string;
  verified_email?: boolean;
  name?: string;
  picture?: string;
  error?: {
    message?: string;
  };
}

export interface GmailMailboxRecord {
  id: string;
  workspaceId: string;
  email: string;
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: Date | null;
  metadata: Prisma.JsonValue | null;
}

export interface GmailListResponse {
  messages?: Array<{ id?: string; threadId?: string }>;
  resultSizeEstimate?: number;
}

export interface GmailMessagePart {
  mimeType?: string;
  filename?: string;
  body?: {
    data?: string;
  };
  parts?: GmailMessagePart[];
}

export interface GmailMessageResponse {
  id?: string;
  threadId?: string;
  historyId?: string;
  snippet?: string;
  payload?: GmailMessagePart & {
    headers?: Array<{
      name?: string;
      value?: string;
    }>;
  };
}

export interface GmailSendResponse {
  id?: string;
  threadId?: string;
  labelIds?: string[];
}
