import { Prisma } from '@prisma/client';
import { GMAIL_SCOPES } from './constants';
import type { GoogleTokenResponse, GoogleUserInfoResponse } from './types';

export function buildMetadata(
  token: GoogleTokenResponse,
  profile: GoogleUserInfoResponse,
): Prisma.InputJsonObject {
  return {
    scope: token.scope || GMAIL_SCOPES.join(' '),
    tokenType: token.token_type || 'Bearer',
    name: profile.name || null,
    picture: profile.picture || null,
    provider: 'gmail',
    updatedAt: new Date().toISOString(),
  } satisfies Prisma.InputJsonObject;
}

export function readSyncedMessageIds(
  metadata: Prisma.JsonValue | null,
): string[] {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return [];
  }
  const ids = (metadata as Record<string, unknown>).syncedMessageIds;
  if (!Array.isArray(ids)) {
    return [];
  }
  return ids
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .slice(0, 500);
}

export function mergeSyncMetadata(
  metadata: Prisma.JsonValue | null,
  syncedMessageIds: string[],
): Prisma.InputJsonObject {
  const base =
    metadata && typeof metadata === 'object' && !Array.isArray(metadata)
      ? (metadata as Record<string, unknown>)
      : {};
  return {
    ...base,
    syncedMessageIds: syncedMessageIds.slice(-500),
    lastSyncAt: new Date().toISOString(),
  } satisfies Prisma.InputJsonObject;
}
