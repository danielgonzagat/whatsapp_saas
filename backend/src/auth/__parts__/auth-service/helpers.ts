import { createHash, randomBytes } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

export function normalizeEmail(email: string): string {
  return String(email || '')
    .trim()
    .toLowerCase();
}

export function assertAgentCanAuthenticate(agent: {
  disabledAt?: Date | null;
  deletedAt?: Date | null;
}): void {
  if (agent.deletedAt) {
    throw new UnauthorizedException('Esta conta foi excluída.');
  }
  if (agent.disabledAt) {
    throw new UnauthorizedException('Esta conta está temporariamente desativada.');
  }
}

export function buildDeletedEmail(agentId: string): string {
  return `deleted-${agentId}@removed.local`;
}

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
