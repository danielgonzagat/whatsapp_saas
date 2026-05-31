import { extname } from 'node:path';
import type { Request } from 'express';
import type { PrismaService } from '../prisma/prisma.service';
import type { StorageService } from '../common/storage/storage.service';
import { buildTimestampedRuntimeId } from './kloel-id.util';
import { detectUploadedMime } from '../common/file-signature.util';
import { normalizeStorageUrlForRequest } from '../common/storage/public-storage-url.util';

export interface UploadedControllerFile {
  buffer: Buffer;
  originalname?: string;
  mimetype?: string;
  size?: number;
}

export const KLOEL_UPLOAD_GENERIC_MIME_RE =
  /^(image\/(jpeg|png|gif|webp)|application\/pdf|application\/msword|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document)$/;

export const KLOEL_UPLOAD_CHAT_MIME_RE =
  /^(image\/(jpeg|png|gif|webp)|application\/pdf|application\/msword|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document|application\/vnd\.ms-excel|application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet|text\/plain|text\/csv|audio\/(mpeg|wav|webm|ogg|mp4|x-m4a))$/;

export const KLOEL_UPLOAD_MAX_BYTES = 25 * 1024 * 1024;

const KLOEL_UPLOAD_GENERIC_MIMES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

const KLOEL_UPLOAD_CHAT_MIMES = [
  ...KLOEL_UPLOAD_GENERIC_MIMES,
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/csv',
  'audio/mpeg',
  'audio/wav',
  'audio/webm',
  'audio/ogg',
  'audio/mp4',
  'audio/x-m4a',
];

type MulterFileFilter = (
  _req: unknown,
  file: { mimetype: string },
  cb: (error: Error | null, accept: boolean) => void,
) => void;

function buildMimeFilter(allowed: string[]): MulterFileFilter {
  return (_req, file, cb) => {
    const accept = allowed.includes(file.mimetype);
    cb(accept ? null : new Error('Tipo de arquivo não permitido'), accept);
  };
}

export const kloelGenericUploadFileFilter: MulterFileFilter = buildMimeFilter(
  KLOEL_UPLOAD_GENERIC_MIMES,
);

export const kloelChatUploadFileFilter: MulterFileFilter = buildMimeFilter(KLOEL_UPLOAD_CHAT_MIMES);

export async function handleUploadFile(
  deps: { storage: StorageService },
  file: UploadedControllerFile,
  workspaceId: string,
  folder: string,
  req: Request,
) {
  if (!file) {
    return { success: false, error: 'Nenhum arquivo enviado' };
  }
  const detectedMime = detectUploadedMime(file);
  if (!detectedMime) {
    return { success: false, error: 'Tipo de arquivo não permitido ou assinatura inválida' };
  }
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
  deps: { storage: StorageService },
  file: UploadedControllerFile,
  workspaceId: string,
  req: Request,
) {
  if (!file) {
    return { success: false, error: 'Nenhum arquivo enviado' };
  }
  const detectedMime = detectUploadedMime(file);
  if (!detectedMime) {
    return { success: false, error: 'Tipo de arquivo não permitido ou assinatura inválida' };
  }
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
  if (detectedMime.startsWith('image/')) {
    fileType = 'image';
  } else if (detectedMime.startsWith('audio/')) {
    fileType = 'audio';
  }
  return {
    success: true,
    url: normalizeStorageUrlForRequest(stored.url, req),
    type: fileType,
    name: file.originalname,
    size: file.size,
    mimeType: detectedMime,
  };
}

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
      ...(agentId !== undefined ? { agentId } : {}),
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
