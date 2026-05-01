import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { extname } from 'node:path';
import type { AuthenticatedRequest } from '../../common/interfaces';
import { resolveWorkspaceId } from '../../auth/workspace-access';
import type { PrismaService } from '../../prisma/prisma.service';
import { detectUploadedMime } from '../../common/file-signature.util';
import { normalizeStorageUrlForRequest } from '../../common/storage/public-storage-url.util';
import { buildTimestampedRuntimeId } from '../kloel-id.util';
import type { StorageService } from '../../common/storage/storage.service';
import { filterEmptyThreads } from './kloel.controller.companion';
import { normalizeMessageMetadata } from './kloel.controller.companion';

export async function listThreads(prisma: PrismaService, req: AuthenticatedRequest) {
  const workspaceId = resolveWorkspaceId(req);
  await prisma.chatThread.deleteMany({
    where: { workspaceId, messages: { none: {} } },
  });

  const threads = await prisma.chatThread.findMany({
    where: { workspaceId, messages: { some: {} } },
    orderBy: { updatedAt: 'desc' },
    take: 50,
    select: {
      id: true,
      title: true,
      updatedAt: true,
      messages: {
        take: 5,
        orderBy: { createdAt: 'desc' as const },
        select: { content: true, role: true },
      },
    },
  });

  return filterEmptyThreads(threads as any);
}

export async function createThread(
  prisma: PrismaService,
  req: AuthenticatedRequest,
  dto: { title?: string; idempotencyKey?: string },
) {
  const workspaceId = resolveWorkspaceId(req);
  return prisma.chatThread.create({
    data: { workspaceId, title: dto.title || 'Nova conversa' },
  });
}

export async function updateThread(
  prisma: PrismaService,
  req: AuthenticatedRequest,
  id: string,
  dto: { title: string },
) {
  const workspaceId = resolveWorkspaceId(req);
  await prisma.chatThread.findFirstOrThrow({
    where: { id, workspaceId },
    select: { id: true },
  });
  await prisma.chatThread.updateMany({
    where: { id, workspaceId },
    data: { title: dto.title },
  });
  return prisma.chatThread.findFirst({ where: { id, workspaceId } });
}

export async function deleteThread(prisma: PrismaService, req: AuthenticatedRequest, id: string) {
  const workspaceId = resolveWorkspaceId(req);
  await prisma.chatThread.findFirstOrThrow({
    where: { id, workspaceId },
    select: { id: true },
  });
  await prisma.chatThread.deleteMany({ where: { id, workspaceId } });
  return { success: true };
}

export async function getThreadMessages(
  prisma: PrismaService,
  req: AuthenticatedRequest,
  id: string,
) {
  const workspaceId = resolveWorkspaceId(req);
  const thread = await prisma.chatThread.findFirst({
    where: { id, workspaceId },
    select: { id: true },
  });
  if (!thread) {
    throw new NotFoundException('Conversa não encontrada');
  }
  const messages = await prisma.chatMessage.findMany({
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
  prisma: PrismaService,
  req: AuthenticatedRequest,
  id: string,
  dto: {
    role: string;
    content: string;
    metadata?: Record<string, unknown>;
    idempotencyKey?: string;
  },
) {
  const workspaceId = resolveWorkspaceId(req);
  await prisma.chatThread.findFirstOrThrow({
    where: { id, workspaceId },
    select: { id: true },
  });
  const msg = await prisma.chatMessage.create({
    data: {
      threadId: id,
      role: dto.role,
      content: dto.content,
      metadata: dto.metadata as Prisma.InputJsonValue | undefined,
    },
  });
  await prisma.chatThread.updateMany({
    where: { id, workspaceId },
    data: { updatedAt: new Date() },
  });
  return msg;
}

export async function updateThreadMessage(
  prisma: PrismaService,
  req: AuthenticatedRequest,
  id: string,
  dto: { content?: string },
) {
  const content = String(dto?.content || '').trim();
  if (!content) {
    throw new BadRequestException('Conteúdo da mensagem é obrigatório.');
  }
  const workspaceId = resolveWorkspaceId(req);
  const existing = await prisma.chatMessage.findFirst({
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
  const [message] = await prisma.$transaction(
    [
      prisma.chatMessage.update({ where: { id }, data: { content, metadata: nextMetadata } }),
      prisma.chatThread.updateMany({
        where: { id: existing.threadId, workspaceId },
        data: { updatedAt: new Date() },
      }),
    ],
    { isolationLevel: 'ReadCommitted' },
  );
  return message;
}

export async function updateMessageFeedback(
  prisma: PrismaService,
  req: AuthenticatedRequest,
  id: string,
  dto: { type?: 'positive' | 'negative' | null },
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
  const workspaceId = resolveWorkspaceId(req);
  const existing = await prisma.chatMessage.findFirst({
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
  return prisma.chatMessage.update({ where: { id }, data: { metadata: nextMetadata } });
}

export async function requestDataDeletion(prisma: PrismaService, req: AuthenticatedRequest) {
  const workspaceId = (req as any).workspaceId || (req.user as any)?.workspaceId;
  const agentId = (req.user as any)?.sub;
  await prisma.contact.updateMany({
    where: { workspaceId },
    data: { name: 'DELETED', email: null, phone: 'DELETED', avatarUrl: null },
  });
  await prisma.message.updateMany({
    where: { workspaceId },
    data: { content: '[DADOS REMOVIDOS POR SOLICITACAO LGPD]' },
  });
  await prisma.auditLog.create({
    data: {
      workspaceId,
      action: 'lgpd_data_deletion',
      resource: 'workspace',
      resourceId: workspaceId,
      agentId,
      details: { requestedAt: new Date().toISOString() },
    },
  });
  return { success: true, message: 'Dados pessoais anonimizados conforme LGPD' };
}

export async function exportData(prisma: PrismaService, req: AuthenticatedRequest) {
  const workspaceId = (req as any).workspaceId || (req.user as any)?.workspaceId;
  const contacts = await prisma.contact.findMany({
    where: { workspaceId },
    select: { name: true, email: true, phone: true, createdAt: true },
    take: 10000,
  });
  const messages = await prisma.message.findMany({
    where: { workspaceId },
    select: { content: true, direction: true, createdAt: true },
    take: 10000,
  });
  const sales = await prisma.kloelSale.findMany({
    where: { workspaceId },
    select: { amount: true, status: true, createdAt: true },
    take: 10000,
  });
  return { contacts, messages, sales, exportedAt: new Date().toISOString() };
}

export async function uploadGenericFile(
  storageService: StorageService,
  prisma: PrismaService,
  req: AuthenticatedRequest,
  file: { buffer: Buffer; originalname?: string; mimetype?: string; size?: number } | null,
) {
  if (!file) return { success: false, error: 'Nenhum arquivo enviado' };
  const detectedMime = detectUploadedMime(file);
  if (!detectedMime)
    return { success: false, error: 'Tipo de arquivo não permitido ou assinatura inválida' };
  file.mimetype = detectedMime;
  const workspaceId = (req as any).workspaceId || (req.user as any)?.workspaceId;
  const folder = (req as any).body?.folder || 'general';
  const uniqueSuffix = buildTimestampedRuntimeId('upload');
  const filename = `${uniqueSuffix}${extname(file.originalname || '')}`;
  const stored = await storageService.upload(file.buffer, {
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

export async function uploadChatFile(
  storageService: StorageService,
  prisma: PrismaService,
  req: AuthenticatedRequest,
  file: { buffer: Buffer; originalname?: string; mimetype?: string; size?: number } | null,
) {
  if (!file) return { success: false, error: 'Nenhum arquivo enviado' };
  const detectedMime = detectUploadedMime(file);
  if (!detectedMime)
    return { success: false, error: 'Tipo de arquivo não permitido ou assinatura inválida' };
  file.mimetype = detectedMime;
  const workspaceId = (req as any).workspaceId || (req.user as any)?.workspaceId;
  const uniqueSuffix = buildTimestampedRuntimeId('upload');
  const filename = `${uniqueSuffix}${extname(file.originalname || '')}`;
  const stored = await storageService.upload(file.buffer, {
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
