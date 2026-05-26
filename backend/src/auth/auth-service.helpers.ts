import { createHash, randomBytes } from 'node:crypto';
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

export function hashOpaqueToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function generateOpaqueToken(size = 32): string {
  return randomBytes(size).toString('base64url');
}
