import { prisma } from '../../db';
import { redis } from '../../redis-client';
import { log } from './autopilot-utils';
import { CIA_CONTACT_LOCK_TTL_SECONDS } from './autopilot-config';

export async function acquireCiaContactLock(contactId?: string, phone?: string) {
  const keyBase = contactId || phone;
  if (!keyBase) {
    return null;
  }

  const key = `cia:lock:${keyBase}`;
  try {
    const result = await (
      redis as never as { set: (...args: unknown[]) => Promise<string | null> }
    ).set(key, '1', 'EX', CIA_CONTACT_LOCK_TTL_SECONDS, 'NX');
    return result ? key : null;
  } catch (err: unknown) {
    const errInstanceofError =
      err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'unknown error');
    log.warn('acquireCiaContactLock redis failure', {
      key,
      error: errInstanceofError?.message || String(err),
    });
    return null;
  }
}

export async function releaseCiaContactLock(lockKey: string | null) {
  if (!lockKey) {
    return;
  }
  try {
    await redis.del(lockKey);
  } catch {
    // ignore
  }
}

export async function upsertCatalogConversationShell(input: {
  workspaceId: string;
  contactId: string;
  lastMessageAt: Date;
  unreadCount?: number;
}) {
  const existing = await prisma.conversation.findFirst({
    where: {
      workspaceId: input.workspaceId,
      contactId: input.contactId,
    },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      unreadCount: true,
      lastMessageAt: true,
    },
  });

  if (!existing) {
    await prisma.conversation.create({
      data: {
        workspaceId: input.workspaceId,
        contactId: input.contactId,
        status: 'OPEN',
        priority: 'MEDIUM',
        channel: 'WHATSAPP',
        mode: 'AI',
        unreadCount: Math.max(0, Number(input.unreadCount || 0) || 0),
        lastMessageAt: input.lastMessageAt,
      },
    });
    return;
  }

  const currentLastMessageAt =
    existing.lastMessageAt instanceof Date
      ? existing.lastMessageAt
      : new Date(existing.lastMessageAt);

  await prisma.conversation.updateMany({
    where: { id: existing.id, workspaceId: input.workspaceId },
    data: {
      unreadCount: Math.max(
        0,
        Number(existing.unreadCount || 0) || 0,
        Number(input.unreadCount || 0) || 0,
      ),
      lastMessageAt:
        Number.isFinite(currentLastMessageAt.getTime()) &&
        currentLastMessageAt > input.lastMessageAt
          ? currentLastMessageAt
          : input.lastMessageAt,
    },
  });
}
