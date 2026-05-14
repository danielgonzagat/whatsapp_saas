import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { GdprStatus, Prisma } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import { StorageService } from '../common/storage/storage.service';
import { EmailService } from '../auth/email.service';
import { PrismaService } from '../prisma/prisma.service';
import { createZip, writeJson } from './gdpr.helpers';

const SIGNED_URL_EXPIRY_SECONDS = 7 * 24 * 60 * 60;
const DELETION_MAX_DAYS = 30;
const VERIFICATION_TOKEN_EXPIRY = '24h';

type GdprProcessingLogger = {
  log(message: string): void;
  warn(message: string): void;
  error(message: string): void;
};

type GdprProcessingContext = {
  prisma: PrismaService;
  storage: StorageService;
  email: EmailService;
  logger: GdprProcessingLogger;
};

type GdprVerificationContext = {
  prisma: PrismaService;
  email: EmailService;
  jwt: JwtService;
};

export async function processGdprExport(
  ctx: GdprProcessingContext,
  requestId: string,
): Promise<void> {
  const request = await ctx.prisma.gdprRequest.findUniqueOrThrow({
    where: { id: requestId },
    select: { id: true, userId: true, workspaceId: true },
  });

  // @AllowCrossWorkspace: gdprRequest.update is scoped by a non-workspace unique identifier, provider callback key, admin session owner, or platform worker claim.
  await ctx.prisma.gdprRequest.update({
    where: { id: requestId },
    data: { status: GdprStatus.PROCESSING },
  });

  try {
    const exportDir = path.join(os.tmpdir(), `gdpr-export-${requestId}`);
    fs.mkdirSync(exportDir, { recursive: true });

    await sweepUserData(ctx, request.userId, request.workspaceId, exportDir);

    const zipPath = path.join(os.tmpdir(), `gdpr-export-${requestId}.zip`);
    await createZip(exportDir, zipPath);

    const zipBuffer = fs.readFileSync(zipPath);
    const uploadResult = await ctx.storage.upload(zipBuffer, {
      filename: `gdpr-export-${requestId}.zip`,
      mimeType: 'application/zip',
      folder: 'gdpr-exports',
      workspaceId: request.workspaceId,
    });

    const signedUrl = ctx.storage.getSignedUrl(uploadResult.path, {
      expiresInSeconds: SIGNED_URL_EXPIRY_SECONDS,
      downloadName: `data-export-${requestId}.zip`,
    });

    fs.unlinkSync(zipPath);
    fs.rmSync(exportDir, { recursive: true, force: true });

    // @AllowCrossWorkspace: gdprRequest.update is scoped by a non-workspace unique identifier, provider callback key, admin session owner, or platform worker claim.
    await ctx.prisma.gdprRequest.update({
      where: { id: requestId },
      data: {
        status: GdprStatus.COMPLETE,
        completedAt: new Date(),
        evidenceUrl: signedUrl,
      },
    });

    ctx.logger.log(`Export completed for request ${requestId}`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    ctx.logger.error(`Export failed for request ${requestId}: ${msg}`);
    throw err;
  }
}

export async function processGdprDeletion(
  ctx: GdprProcessingContext,
  requestId: string,
): Promise<void> {
  const request = await ctx.prisma.gdprRequest.findUniqueOrThrow({
    where: { id: requestId },
    select: { id: true, userId: true, workspaceId: true, requestedAt: true },
  });

  const daysSinceRequest = (Date.now() - request.requestedAt.getTime()) / (1000 * 60 * 60 * 24);

  if (daysSinceRequest > DELETION_MAX_DAYS) {
    // @AllowCrossWorkspace: gdprRequest.update is scoped by a non-workspace unique identifier, provider callback key, admin session owner, or platform worker claim.
    await ctx.prisma.gdprRequest.update({
      where: { id: requestId },
      data: { status: GdprStatus.FAILED, completedAt: new Date() },
    });
    ctx.logger.warn(`Deletion request ${requestId} exceeded 30-day window`);
    return;
  }

  // @AllowCrossWorkspace: gdprRequest.update is scoped by a non-workspace unique identifier, provider callback key, admin session owner, or platform worker claim.
  await ctx.prisma.gdprRequest.update({
    where: { id: requestId },
    data: { status: GdprStatus.PROCESSING },
  });

  try {
    await cascadeDeleteUserData(ctx.prisma, request.userId, request.workspaceId, requestId);

    // @AllowCrossWorkspace: gdprRequest.update is scoped by a non-workspace unique identifier, provider callback key, admin session owner, or platform worker claim.
    await ctx.prisma.gdprRequest.update({
      where: { id: requestId },
      data: {
        status: GdprStatus.COMPLETE,
        completedAt: new Date(),
      },
    });

    ctx.logger.log(`Deletion completed for request ${requestId}`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    ctx.logger.error(`Deletion failed for request ${requestId}: ${msg}`);
    throw err;
  }
}

export async function sendGdprVerificationEmail(
  ctx: GdprVerificationContext,
  userId: string,
  requestId: string,
  code: string,
  type: string,
): Promise<void> {
  // @AllowCrossWorkspace: agent.findUnique is scoped by a non-workspace unique identifier, provider callback key, admin session owner, or platform worker claim.
  const agent = await ctx.prisma.agent.findUnique({
    where: { id: userId },
    select: { email: true, name: true },
  });

  if (!agent) {
    return;
  }

  const token = ctx.jwt.sign({ sub: userId, requestId }, { expiresIn: VERIFICATION_TOKEN_EXPIRY });

  const siteUrl = process.env.FRONTEND_URL || 'https://kloel.com';
  const statusUrl = `${siteUrl.replace(/\/$/, '')}/data-deletion/status/${code}?token=${token}`;

  const typeLabel = type === 'EXPORT' ? 'exportação de dados' : 'exclusão de dados';
  const subject = `Confirmação de ${typeLabel} - KLOEL`;

  const { renderEmailTemplate } = await import('../common/utils/email-template-renderer.util');
  const html = renderEmailTemplate('data-request-confirmation', {
    agentName: agent.name,
    typeLabel,
    code,
    statusUrl,
  });

  await ctx.email.sendEmail({ to: agent.email, subject, html });
}

async function sweepUserData(
  ctx: GdprProcessingContext,
  userId: string,
  workspaceId: string,
  exportDir: string,
): Promise<void> {
  const data: Record<string, unknown> = {};

  // @AllowCrossWorkspace: agent.findUnique is scoped by a non-workspace unique identifier, provider callback key, admin session owner, or platform worker claim.
  const agent = await ctx.prisma.agent.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      phone: true,
      bio: true,
      website: true,
      instagram: true,
      publicName: true,
      displayRole: true,
      createdAt: true,
    },
  });
  data.agent = agent;
  writeJson(exportDir, 'agent.json', agent);

  if (agent?.email) {
    await ctx.email.sendDataDeletionConfirmationEmail(agent.email);
  }

  const conversations = await ctx.prisma.conversation.findMany({
    where: { workspaceId, assignedAgentId: userId },
    select: {
      id: true,
      status: true,
      channel: true,
      lastMessageAt: true,
      createdAt: true,
    },
    take: 10000,
  });
  data.conversations = conversations;
  writeJson(exportDir, 'conversations.json', conversations);

  const messages = await ctx.prisma.message.findMany({
    where: { agentId: userId, workspaceId },
    select: {
      id: true,
      content: true,
      direction: true,
      createdAt: true,
    },
    take: 10000,
  });
  data.messages = messages;
  writeJson(exportDir, 'messages.json', messages);

  const chatMessages = await ctx.prisma.chatMessage.findMany({
    where: { workspaceId, userId },
    select: {
      id: true,
      threadId: true,
      role: true,
      content: true,
      metadata: true,
      createdAt: true,
    },
    take: 10000,
  });
  data.chatMessages = chatMessages;
  writeJson(exportDir, 'chat_messages.json', chatMessages);

  writeJson(exportDir, 'manifest.json', {
    exportDate: new Date().toISOString(),
    userId,
    workspaceId,
    tables: Object.keys(data),
  });
}

async function cascadeDeleteUserData(
  prisma: PrismaService,
  userId: string,
  workspaceId: string,
  requestId: string,
): Promise<void> {
  await prisma.$transaction(
    async (tx) => {
      await tx.refreshToken.updateMany({
        where: { agentId: userId, revoked: false },
        data: { revoked: true },
      });

      await tx.socialAccount.updateMany({
        where: { agentId: userId },
        data: {
          revokedAt: new Date(),
          accessToken: null,
          refreshToken: null,
          tokenExpiresAt: null,
        },
      });

      await tx.magicLinkToken.updateMany({
        where: { agentId: userId, usedAt: null },
        data: { usedAt: new Date() },
      });

      const chatMessages = await tx.chatMessage.updateMany({
        where: { workspaceId, userId, deletedAt: null },
        data: {
          userId: null,
          content: '[deleted by GDPR request]',
          metadata: Prisma.JsonNull,
          deletedAt: new Date(),
        },
      });

      const conversations = await tx.conversation.updateMany({
        where: { workspaceId, assignedAgentId: userId },
        data: { assignedAgentId: null },
      });

      const messages = await tx.message.updateMany({
        where: { workspaceId, agentId: userId },
        data: { agentId: null },
      });

      // @AllowCrossWorkspace: agent.update is scoped by a non-workspace unique identifier, provider callback key, admin session owner, or platform worker claim.
      await tx.agent.update({
        where: { id: userId },
        data: {
          name: 'Deleted User',
          email: `deleted-${userId}@removed.local`,
          phone: null,
          avatarUrl: null,
          provider: null,
          providerId: null,
          emailVerified: false,
          disabledAt: new Date(),
          deletedAt: new Date(),
        },
      });

      await tx.auditLog.create({
        data: {
          workspaceId,
          action: 'GDPR_DELETE',
          resource: 'GdprRequest',
          resourceId: requestId,
          details: {
            userId,
            deletedAt: new Date().toISOString(),
            requestId,
            chatMessagesAnonymized: chatMessages.count,
            conversationsUnassigned: conversations.count,
            messagesUnassigned: messages.count,
          },
        },
      });
    },
    { isolationLevel: 'ReadCommitted' },
  );

  // @AllowCrossWorkspace: gdprRequest.update is scoped by a non-workspace unique identifier, provider callback key, admin session owner, or platform worker claim.
  await prisma.gdprRequest.update({
    where: { id: requestId },
    data: {
      evidenceUrl: `gdpr-deletion:${requestId}:${userId}:audit-trail`,
    },
  });
}
