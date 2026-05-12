import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import type { KloelService } from './kloel.service';

export interface ControllerDeps {
  prisma: PrismaService;
  kloelService: KloelService;
}

export async function listThreads(deps: Pick<ControllerDeps, 'prisma'>, workspaceId: string) {
  try {
    await deps.prisma.chatThread.deleteMany({ where: { workspaceId, messages: { none: {} } } });
    const threads = await deps.prisma.chatThread.findMany({
      where: { workspaceId, messages: { some: {} } },
      orderBy: { updatedAt: 'desc' },
      take: 50,
      select: {
        id: true,
        title: true,
        updatedAt: true,
        messages: {
          take: 5,
          orderBy: { createdAt: 'desc' },
          select: { content: true, role: true },
        },
      },
    });
    return threads
      .filter((t) => t.messages.some((m) => String(m?.content || '').trim().length > 0))
      .map((t) => ({
        id: t.id,
        title: String(t.title || '').trim() || 'Nova conversa',
        updatedAt: t.updatedAt,
        lastMessagePreview:
          t.messages.find((m) => String(m?.content || '').trim().length > 0)?.content || '',
      }));
  } catch {
    return [];
  }
}

export async function createThread(
  deps: Pick<ControllerDeps, 'prisma'>,
  workspaceId: string,
  dto: { title?: string; idempotencyKey?: string },
) {
  try {
    return await deps.prisma.chatThread.create({
      data: { workspaceId, title: dto.title || 'Nova conversa' },
    });
  } catch {
    return { id: `local_${Date.now()}`, title: dto.title || 'Nova conversa' };
  }
}

export async function updateThread(
  deps: Pick<ControllerDeps, 'prisma'>,
  id: string,
  title: string,
  workspaceId: string,
) {
  try {
    await deps.prisma.chatThread.findFirstOrThrow({
      where: { id, workspaceId },
      select: { id: true },
    });
    await deps.prisma.chatThread.updateMany({ where: { id, workspaceId }, data: { title } });
    return await deps.prisma.chatThread.findFirst({ where: { id, workspaceId } });
  } catch {
    return { success: false };
  }
}

export async function deleteThread(
  deps: Pick<ControllerDeps, 'prisma'>,
  id: string,
  workspaceId: string,
) {
  try {
    await deps.prisma.chatThread.findFirstOrThrow({
      where: { id, workspaceId },
      select: { id: true },
    });
    await deps.prisma.chatThread.deleteMany({ where: { id, workspaceId } });
    return { success: true };
  } catch {
    return { success: false };
  }
}

export async function getThreadMessages(
  deps: Pick<ControllerDeps, 'prisma'>,
  id: string,
  workspaceId: string,
) {
  const thread = await deps.prisma.chatThread.findFirst({
    where: { id, workspaceId },
    select: { id: true },
  });
  if (!thread) {
    throw new NotFoundException('Conversa não encontrada');
  }
  const messages = await deps.prisma.chatMessage.findMany({
    where: { threadId: id, workspaceId },
    select: {
      id: true,
      threadId: true,
      role: true,
      content: true,
      metadata: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
    take: 200,
  });
  return messages.filter((m) => String(m.content || '').trim().length > 0);
}

export async function addThreadMessage(
  deps: Pick<ControllerDeps, 'prisma'>,
  id: string,
  dto: { role: string; content: string; metadata?: Record<string, unknown> },
  workspaceId: string,
) {
  try {
    await deps.prisma.chatThread.findFirstOrThrow({
      where: { id, workspaceId },
      select: { id: true },
    });
    const msg = await deps.prisma.chatMessage.create({
      data: {
        thread: { connect: { id } },
        workspaceId,
        role: dto.role,
        content: dto.content,
        metadata: dto.metadata as Prisma.InputJsonValue,
      },
    });
    await deps.prisma.chatThread.updateMany({
      where: { id, workspaceId },
      data: { updatedAt: new Date() },
    });
    return msg;
  } catch {
    return { success: false };
  }
}

function normalizeMessageMetadata(metadata: Prisma.JsonValue): Record<string, unknown> {
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    return { ...(metadata as Record<string, unknown>) };
  }
  return {};
}

export async function updateThreadMessage(
  deps: Pick<ControllerDeps, 'prisma'>,
  id: string,
  dto: { content?: string },
  workspaceId: string,
) {
  const content = String(dto?.content || '').trim();
  if (!content) {
    throw new BadRequestException('Conteúdo da mensagem é obrigatório.');
  }
  const existing = await deps.prisma.chatMessage.findFirst({
    where: { id, thread: { workspaceId } },
    select: { id: true, threadId: true, role: true, metadata: true, createdAt: true },
  });
  if (!existing) {
    throw new NotFoundException('Mensagem não encontrada.');
  }
  if (existing.role !== 'user') {
    throw new BadRequestException('Somente mensagens do usuário podem ser editadas.');
  }
  const nextMetadata = {
    ...normalizeMessageMetadata(existing.metadata),
    editedAt: new Date().toISOString(),
  };
  const [message] = await deps.prisma.$transaction(
    [
      deps.prisma.chatMessage.update({ where: { id }, data: { content, metadata: nextMetadata } }),
      deps.prisma.chatThread.updateMany({
        where: { id: existing.threadId, workspaceId },
        data: { updatedAt: new Date() },
      }),
    ],
    { isolationLevel: 'ReadCommitted' },
  );
  return message;
}

export async function updateMessageFeedback(
  deps: Pick<ControllerDeps, 'prisma'>,
  id: string,
  dto: { type?: 'positive' | 'negative' | null },
  workspaceId: string,
) {
  const type =
    dto?.type === 'positive' || dto?.type === 'negative'
      ? dto.type
      : dto?.type === null
        ? null
        : undefined;
  if (type === undefined) {
    throw new BadRequestException('Feedback inválido. Use positive, negative ou null.');
  }

  return deps.prisma.$transaction(async (tx) => {
    const existing = await tx.chatMessage.findFirst({
      where: { id, thread: { workspaceId } },
      select: { id: true, threadId: true, role: true, metadata: true, createdAt: true },
    });
    if (!existing) {
      throw new NotFoundException('Mensagem não encontrada.');
    }
    if (existing.role !== 'assistant') {
      throw new BadRequestException('Feedback só pode ser salvo em mensagens do assistente.');
    }
    const nextMetadata = {
      ...normalizeMessageMetadata(existing.metadata),
      feedback: type ? { type, updatedAt: new Date().toISOString() } : null,
    };
    return tx.chatMessage.update({ where: { id }, data: { metadata: nextMetadata } });
  });
}
