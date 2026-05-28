import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthenticatedRequest } from '../common/interfaces';

export interface KloelThinkDto {
  message: string;
  workspaceId?: string;
  conversationId?: string;
  mode?: 'chat' | 'onboarding' | 'sales';
  metadata?: Record<string, unknown>;
}

export interface KloelMemoryDto {
  workspaceId: string;
  type: string;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface KloelThinkPayload {
  message: string;
  workspaceId: string;
  conversationId?: string;
  mode?: 'chat' | 'onboarding' | 'sales';
  metadata?: Prisma.InputJsonValue;
  userId?: string;
  userName?: string;
}

export interface KloelListThreadsQuery {
  limit?: number;
  cursor?: number;
  paginated: boolean;
}

/**
 * Select shape returned by GET /kloel/approvals/pending.
 *
 * Kept as a frozen literal so callers cannot mutate it across requests and so
 * unit tests can assert the exact contract without reimporting the controller.
 */
export const KLOEL_PENDING_APPROVALS_SELECT = Object.freeze({
  id: true,
  kind: true,
  scope: true,
  entityType: true,
  entityId: true,
  state: true,
  title: true,
  prompt: true,
  payload: true,
  createdAt: true,
  updatedAt: true,
} as const);

function readOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/**
 * Builds the payload forwarded to `kloelService.think` / `thinkSync` from the
 * raw controller DTO plus authenticated request context.
 *
 * - Resolves `workspaceId` from the request (request override wins over JWT).
 * - Extracts optional `userId` / `userName` only when they are real strings.
 * - Casts `metadata` to `Prisma.InputJsonValue` without forwarding `undefined`
 *   keys (keeps the downstream `...spread` semantics intact).
 */
export function buildKloelThinkPayload(
  dto: KloelThinkDto,
  req: AuthenticatedRequest,
  readUserId: (user: unknown) => string | undefined,
): KloelThinkPayload {
  const workspaceId = req.workspaceId || req.user.workspaceId;
  const userId = readUserId(req.user);
  const userName = readOptionalString(req.user.name);
  const { metadata: rawMetadata, ...rest } = dto;
  const metadata = rawMetadata as Prisma.InputJsonValue | undefined;
  return {
    ...rest,
    workspaceId,
    ...(userId !== undefined ? { userId } : {}),
    ...(userName !== undefined ? { userName } : {}),
    ...(metadata !== undefined ? { metadata } : {}),
  };
}

/**
 * Resolves the workspaceId used by the memory save endpoint and casts the
 * metadata blob to a Prisma JSON value when present.
 */
export function buildKloelMemoryArgs(
  dto: KloelMemoryDto,
  req: AuthenticatedRequest,
): {
  workspaceId: string;
  type: string;
  content: string;
  metadata: Prisma.InputJsonValue | undefined;
} {
  return {
    workspaceId: req.workspaceId || req.user.workspaceId,
    type: dto.type,
    content: dto.content,
    metadata: dto.metadata as Prisma.InputJsonValue | undefined,
  };
}

/**
 * Parses the `limit` / `cursor` query strings used by GET /kloel/threads.
 *
 * Returns numeric values only when the input parses to a finite number and
 * marks the request as `paginated` when at least one parameter was supplied,
 * preserving the existing controller semantics.
 */
export function parseListThreadsQuery(
  limit: string | undefined,
  cursor: string | undefined,
): KloelListThreadsQuery {
  const parsedLimit = limit ? Number.parseInt(limit, 10) : undefined;
  const parsedCursor = cursor ? Number.parseInt(cursor, 10) : undefined;
  const numericLimit = Number.isFinite(parsedLimit) ? parsedLimit : undefined;
  const numericCursor = Number.isFinite(parsedCursor) ? parsedCursor : undefined;
  return {
    ...(numericLimit !== undefined ? { limit: numericLimit } : {}),
    ...(numericCursor !== undefined ? { cursor: numericCursor } : {}),
    paginated: Boolean(limit || cursor),
  };
}

export interface KloelRegenerateMessageArgs {
  workspaceId: string;
  conversationId: string;
  assistantMessageId: string;
  userId?: string;
  userName?: string;
}

/**
 * Validates the regenerate-conversation DTO and assembles the payload sent to
 * `kloelService.regenerateThreadAssistantResponse`.
 *
 * Throws `BadRequestException('messageId é obrigatório.')` when the body lacks
 * a non-empty messageId.
 */
export function buildRegenerateMessageArgs(
  conversationId: string,
  body: { messageId?: string } | undefined,
  req: AuthenticatedRequest,
  workspaceId: string,
): KloelRegenerateMessageArgs {
  const messageId = String(body?.messageId || '').trim();
  if (!messageId) {
    throw new BadRequestException('messageId é obrigatório.');
  }
  const userId = readOptionalString(req.user?.sub);
  const userName = readOptionalString(req.user?.name);
  return {
    workspaceId,
    conversationId,
    assistantMessageId: messageId,
    ...(userId !== undefined ? { userId } : {}),
    ...(userName !== undefined ? { userName } : {}),
  };
}
