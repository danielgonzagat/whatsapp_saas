import type { Prisma } from '@prisma/client';

import { normalizeEmail } from '../common/string';
export { normalizeEmail };

import { assertAgentCanAuthenticate } from './auth.helpers';
export { assertAgentCanAuthenticate };

export function asJsonObject(value: Prisma.JsonValue | null | undefined): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value;
}

export function buildAuthLogMessage(event: string, payload: Record<string, unknown>): string {
  return JSON.stringify({
    event,
    ...payload,
  });
}

// Opaque-token-at-rest codec delegates to the shared auth-core primitive so a
// fix to the hashing/generation surface propagates to every consumer. The
// re-exported names keep this file's public surface byte-identical.
export { hashOpaqueToken, generateOpaqueToken } from '../common/auth-core/opaque-token';
