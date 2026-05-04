import { extname } from 'node:path';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { PrismaService } from '../../prisma/prisma.service';
import type { StorageService } from '../../common/storage/storage.service';
import type { KloelService } from '../kloel.service';
import { buildTimestampedRuntimeId } from '../kloel-id.util';
import { detectUploadedMime } from '../../common/file-signature.util';
import { normalizeStorageUrlForRequest } from '../../common/storage/public-storage-url.util';

export interface ControllerDeps {
  prisma: PrismaService;
  storage: StorageService;
  kloelService: KloelService;
}

// ── Thread helpers ──

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
  if (!thread) throw new NotFoundException('Conversa não encontrada');
  const messages = await deps.prisma.chatMessage.findMany({
    where: { threadId: id },
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
      data: { threadId: id, role: dto.role, content: dto.content, metadata: dto.metadata as any },
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

// ── Upload handlers ──

export interface UploadedControllerFile {
  buffer: Buffer;
  originalname?: string;
  mimetype?: string;
  size?: number;
}

export async function handleUploadFile(
  deps: Pick<ControllerDeps, 'storage'>,
  file: UploadedControllerFile,
  workspaceId: string,
  folder: string,
  req: Request,
) {
  if (!file) return { success: false, error: 'Nenhum arquivo enviado' };
  const detectedMime = detectUploadedMime(file);
  if (!detectedMime)
    return { success: false, error: 'Tipo de arquivo não permitido ou assinatura inválida' };
  file.mimetype = detectedMime;
  const uniqueSuffix = buildTimestampedRuntimeId('upload');
  const filename = `${uniqueSuffix}${extname(file.originalname || '')}`;
  const stored = await deps.storage.upload(file.buffer, {
    filename,
    mimeType: detectedMime,
    folder,
    workspaceId,
  });
  return {
    success: true,
    url: normalizeStorageUrlForRequest(stored.url, req),
    name: file.originalname,
    size: file.size,
    mimeType: detectedMime,
  };
}

export async function handleUploadChatFile(
  deps: Pick<ControllerDeps, 'storage'>,
  file: UploadedControllerFile,
  workspaceId: string,
  req: Request,
) {
  if (!file) return { success: false, error: 'Nenhum arquivo enviado' };
  const detectedMime = detectUploadedMime(file);
  if (!detectedMime)
    return { success: false, error: 'Tipo de arquivo não permitido ou assinatura inválida' };
  file.mimetype = detectedMime;
  const uniqueSuffix = buildTimestampedRuntimeId('upload');
  const filename = `${uniqueSuffix}${extname(file.originalname || '')}`;
  const stored = await deps.storage.upload(file.buffer, {
    filename,
    mimeType: detectedMime,
    folder: 'chat',
    workspaceId,
  });
  let fileType: 'image' | 'document' | 'audio' = 'document';
  if (detectedMime.startsWith('image/')) fileType = 'image';
  else if (detectedMime.startsWith('audio/')) fileType = 'audio';
  return {
    success: true,
    url: normalizeStorageUrlForRequest(stored.url, req),
    type: fileType,
    name: file.originalname,
    size: file.size,
    mimeType: detectedMime,
  };
}

// ── LGPD handlers ──

export async function requestDataDeletion(
  deps: { prisma: PrismaService },
  workspaceId: string,
  agentId?: string,
) {
  await deps.prisma.contact.updateMany({
    where: { workspaceId },
    data: { name: 'DELETED', email: null, phone: 'DELETED', avatarUrl: null },
  });
  await deps.prisma.message.updateMany({
    where: { workspaceId },
    data: { content: '[DADOS REMOVIDOS POR SOLICITACAO LGPD]' },
  });
  await deps.prisma.auditLog.create({
    data: {
      workspaceId,
      action: 'lgpd_data_deletion',
      resource: 'workspace',
      resourceId: workspaceId,
      agentId,
      details: { requestedAt: new Date().toISOString() },
    },
  });
}

export async function exportData(deps: { prisma: PrismaService }, workspaceId: string) {
  const [contacts, messages, sales] = await Promise.all([
    deps.prisma.contact.findMany({
      where: { workspaceId },
      select: { name: true, email: true, phone: true, createdAt: true },
      take: 10000,
    }),
    deps.prisma.message.findMany({
      where: { workspaceId },
      select: { content: true, direction: true, createdAt: true },
      take: 10000,
    }),
    deps.prisma.kloelSale.findMany({
      where: { workspaceId },
      select: { amount: true, status: true, createdAt: true },
      take: 10000,
    }),
  ]);
  return { contacts, messages, sales, exportedAt: new Date().toISOString() };
}

// ── Update thread message ──

function normalizeMessageMetadata(metadata: any) {
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata))
    return { ...(metadata as Record<string, unknown>) };
  return {} as Record<string, unknown>;
}

export async function updateThreadMessage(
  deps: Pick<ControllerDeps, 'prisma'>,
  id: string,
  dto: { content?: string },
  workspaceId: string,
) {
  const content = String(dto?.content || '').trim();
  if (!content) throw new BadRequestException('Conteúdo da mensagem é obrigatório.');
  const existing = await deps.prisma.chatMessage.findFirst({
    where: { id, thread: { workspaceId } },
    select: { id: true, threadId: true, role: true, metadata: true, createdAt: true },
  });
  if (!existing) throw new NotFoundException('Mensagem não encontrada.');
  if (existing.role !== 'user')
    throw new BadRequestException('Somente mensagens do usuário podem ser editadas.');
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
  if (type === undefined)
    throw new BadRequestException('Feedback inválido. Use positive, negative ou null.');

  return deps.prisma.$transaction(async (tx) => {
    const existing = await tx.chatMessage.findFirst({
      where: { id, thread: { workspaceId } },
      select: { id: true, threadId: true, role: true, metadata: true, createdAt: true },
    });
    if (!existing) throw new NotFoundException('Mensagem não encontrada.');
    if (existing.role !== 'assistant')
      throw new BadRequestException('Feedback só pode ser salvo em mensagens do assistente.');
    const nextMetadata = {
      ...normalizeMessageMetadata(existing.metadata),
      feedback: type ? { type, updatedAt: new Date().toISOString() } : null,
    };
    return tx.chatMessage.update({ where: { id }, data: { metadata: nextMetadata } });
  });
}
