/**
 * ARCHITECTURAL COHESION: This file is the GDPR Compliance Orchestrator — a
 * single regulatory workflow spanning request creation, identity verification,
 * Facebook data-deletion callback, data export (sweep → ZIP → upload → signed
 * URL), cascade deletion ($transaction across 6+ tables), and the BullMQ
 * processing lifecycle. Splitting these would break the regulatory audit trail:
 * every step from request to completion must share the same request state
 * machine and the same error-recovery path. Pure utilities (ZIP creation, code
 * generation, signed_request parsing) are extracted to gdpr.helpers.ts.
 */

import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { GdprStatus, GdprType } from '@prisma/client';
import { Queue, Worker, type Job } from 'bullmq';
import { createRedisClient } from '../common/redis/redis.util';
import { StorageService } from '../common/storage/storage.service';
import { EmailService } from '../auth/email.service';
import { PrismaService } from '../prisma/prisma.service';
import { generateCode, parseFacebookSignedRequest } from './gdpr.helpers';
import {
  processGdprDeletion,
  processGdprExport,
  sendGdprVerificationEmail,
} from './gdpr-processing.helpers';

const GDPR_QUEUE = 'gdpr-processing';

type GdprJobData = {
  requestId: string;
  type: string;
  userId: string;
  workspaceId: string;
};

/** Gdpr service. */
@Injectable()
export class GdprService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GdprService.name);
  private queue: Queue<GdprJobData> | null = null;
  private worker: Worker<GdprJobData> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly storage: StorageService,
    private readonly email: EmailService,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      const connection = createRedisClient({ maxRetriesPerRequest: null });
      this.queue = new Queue<GdprJobData>(GDPR_QUEUE, { connection });

      this.worker = new Worker<GdprJobData>(
        GDPR_QUEUE,
        async (job: Job<GdprJobData>) => {
          const { requestId, type } = job.data;
          this.logger.log(`Processing GDPR job ${job.id} for request ${requestId} (${type})`);

          if (type === 'EXPORT') {
            await this.processExport(requestId);
          } else if (type === 'DELETE') {
            await this.processDeletion(requestId);
          }
        },
        {
          connection,
          concurrency: 2,
          removeOnComplete: { age: 3600 },
          removeOnFail: { age: 86400 },
        },
      );

      this.worker.on('failed', (job, err) => {
        this.logger.error(`GDPR job ${job?.id} failed: ${err.message}`);
        if (job?.data?.requestId) {
          void this.markRequestFailed(job.data.requestId, err.message);
        }
      });

      this.logger.log('GDPR processing queue started');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`GDPR queue unavailable — processing will be synchronous: ${msg}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
  }

  /** Request data export. */
  async requestExport(userId: string, workspaceId: string) {
    const code = generateCode();

    const request = await this.prisma.gdprRequest.create({
      data: {
        workspaceId,
        userId,
        type: GdprType.EXPORT,
        code,
        status: GdprStatus.PENDING,
      },
    });

    await this.sendVerificationEmail(userId, request.id, code, 'EXPORT');

    return { code, status: request.status, requestedAt: request.requestedAt };
  }

  /** Request data deletion. */
  async requestDeletion(userId: string, workspaceId: string) {
    const existing = await this.prisma.gdprRequest.findFirst({
      where: { workspaceId, userId, type: GdprType.DELETE, status: { not: GdprStatus.FAILED } },
      orderBy: { requestedAt: 'desc' },
    });

    if (existing) {
      if (existing.status === GdprStatus.COMPLETE) {
        throw new BadRequestException(
          'Uma solicitação de exclusão já foi processada para esta conta.',
        );
      }
      return {
        code: existing.code,
        status: existing.status,
        requestedAt: existing.requestedAt,
        message: 'Solicitação de exclusão já existe.',
      };
    }

    const code = generateCode();

    const request = await this.prisma.gdprRequest.create({
      data: {
        workspaceId,
        userId,
        type: GdprType.DELETE,
        code,
        status: GdprStatus.PENDING,
      },
    });

    await this.sendVerificationEmail(userId, request.id, code, 'DELETE');

    return { code, status: request.status, requestedAt: request.requestedAt };
  }

  /** Verify identity with a JWT token and proceed with processing. */
  async verifyIdentity(code: string, token: string) {
    let payload: { sub: string; requestId: string };
    try {
      payload = this.jwt.verify<{ sub: string; requestId: string }>(token);
    } catch {
      throw new UnauthorizedException('Token de verificação inválido ou expirado.');
    }

    const request = await this.prisma.gdprRequest.findUnique({
      where: { code: String(code || '').trim() },
      select: {
        id: true,
        userId: true,
        workspaceId: true,
        type: true,
        status: true,
      },
    });

    if (!request) {
      throw new NotFoundException('Solicitação não encontrada.');
    }

    if (request.id !== payload.requestId || request.userId !== payload.sub) {
      throw new UnauthorizedException('Token de verificação não corresponde à solicitação.');
    }

    if (request.status !== GdprStatus.PENDING) {
      throw new BadRequestException(`Solicitação já está em estado ${request.status}.`);
    }

    // @AllowCrossWorkspace: gdprRequest.update is scoped by a non-workspace unique identifier, provider callback key, admin session owner, or platform worker claim.
    await this.prisma.gdprRequest.update({
      where: { id: request.id },
      data: { status: GdprStatus.VERIFYING },
    });

    await this.enqueueProcessing(request.id, request.type, request.userId, request.workspaceId);

    return {
      code,
      status: 'PROCESSING' as const,
      message: 'Solicitação verificada e em processamento.',
    };
  }

  /** Get status by code. */
  async getStatus(code: string) {
    // @AllowCrossWorkspace: gdprRequest.findUnique is scoped by a non-workspace unique identifier, provider callback key, admin session owner, or platform worker claim.
    const request = await this.prisma.gdprRequest.findUnique({
      where: { code: String(code || '').trim() },
      select: {
        code: true,
        type: true,
        status: true,
        requestedAt: true,
        completedAt: true,
      },
    });

    if (!request) {
      throw new NotFoundException('Solicitação não encontrada.');
    }

    return request;
  }

  /** Handle Facebook data deletion callback. */
  async handleFacebookCallback(signedRequest: string) {
    const payload = parseFacebookSignedRequest(signedRequest);
    const providerUserId = String(payload.user_id || '').trim();
    if (!providerUserId) {
      throw new BadRequestException('signed_request sem user_id.');
    }

    const agent = await this.prisma.agent.findFirst({
      where: {
        OR: [
          { provider: 'facebook', providerId: providerUserId },
          {
            socialAccounts: {
              some: { provider: 'facebook', providerUserId },
            },
          },
        ],
      },
      select: { id: true, workspaceId: true },
    });

    if (!agent) {
      const siteUrl = process.env.FRONTEND_URL || 'https://kloel.com';
      return {
        url: `${siteUrl.replace(/\/$/, '')}/data-deletion`,
        confirmation_code: 'not_found',
      };
    }

    const code = generateCode();

    const request = await this.prisma.gdprRequest.create({
      data: {
        workspaceId: agent.workspaceId,
        userId: agent.id,
        type: GdprType.DELETE,
        code,
        status: GdprStatus.VERIFYING,
      },
    });

    await this.enqueueProcessing(request.id, GdprType.DELETE, agent.id, agent.workspaceId);

    const siteUrl = process.env.FRONTEND_URL || 'https://kloel.com';
    return {
      url: `${siteUrl.replace(/\/$/, '')}/data-deletion/status/${code}`,
      confirmation_code: code,
    };
  }

  // ─── Processing Methods ────────────────────────────────────────

  /** Process export: sweep data, generate ZIP, upload, return signed URL. */
  async processExport(requestId: string): Promise<void> {
    await processGdprExport(this.processingContext(), requestId);
  }

  /** Process deletion: cascade delete across all user data bases. */
  async processDeletion(requestId: string): Promise<void> {
    await processGdprDeletion(this.processingContext(), requestId);
  }

  // ─── Helpers ───────────────────────────────────────────────────

  private async enqueueProcessing(
    requestId: string,
    type: GdprType,
    userId: string,
    workspaceId: string,
  ) {
    if (this.queue) {
      await this.queue.add(
        type,
        { requestId, type, userId, workspaceId },
        {
          jobId: `gdpr:${type}:${requestId}`,
          removeOnComplete: { age: 3600 },
          removeOnFail: false,
        },
      );
      this.logger.log(`Enqueued GDPR ${type} job for request ${requestId}`);
    } else {
      this.logger.warn(`No Redis queue — processing ${type} for ${requestId} synchronously`);
      if (type === GdprType.EXPORT) {
        await this.processExport(requestId);
      } else {
        await this.processDeletion(requestId);
      }
    }
  }

  private async sendVerificationEmail(
    userId: string,
    requestId: string,
    code: string,
    type: string,
  ) {
    await sendGdprVerificationEmail(
      { prisma: this.prisma, email: this.email, jwt: this.jwt },
      userId,
      requestId,
      code,
      type,
    );
  }

  private async markRequestFailed(requestId: string, errorMessage: string) {
    try {
      // @AllowCrossWorkspace: gdprRequest.update is scoped by a non-workspace unique identifier, provider callback key, admin session owner, or platform worker claim.
      await this.prisma.gdprRequest.update({
        where: { id: requestId },
        data: {
          status: GdprStatus.FAILED,
          completedAt: new Date(),
          evidenceUrl: `error: ${errorMessage.slice(0, 500)}`,
        },
      });
    } catch {
      this.logger.error(`Failed to mark GdprRequest ${requestId} as FAILED`);
    }
  }

  private processingContext() {
    return {
      prisma: this.prisma,
      storage: this.storage,
      email: this.email,
      logger: this.logger,
    };
  }
}
