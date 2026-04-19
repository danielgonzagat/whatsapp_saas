import { randomBytes } from 'node:crypto';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { hashAuthToken } from '../auth/auth-token-hash';
import { EmailService } from '../auth/email.service';
import { PrismaService } from '../prisma/prisma.service';
import { createGoogleRiscJwks, validateSecurityEventToken } from './utils/jwt-set.validator';
import { validateSignedRequest } from './utils/signed-request.validator';

const GOOGLE_RISC_ISSUER = 'https://accounts.google.com';
const GOOGLE_RISC_EVENT = {
  SESSIONS_REVOKED: 'https://schemas.openid.net/secevent/risc/event-type/sessions-revoked',
  TOKENS_REVOKED: 'https://schemas.openid.net/secevent/risc/event-type/tokens-revoked',
  ACCOUNT_DISABLED: 'https://schemas.openid.net/secevent/risc/event-type/account-disabled',
  ACCOUNT_PURGED: 'https://schemas.openid.net/secevent/risc/event-type/account-purged',
} as const;

@Injectable()
export class ComplianceService {
  private readonly logger = new Logger(ComplianceService.name);
  private readonly googleRiscJwks = createGoogleRiscJwks();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly emailService: EmailService,
  ) {}

  async createFacebookDeletionRequest(signedRequest: string) {
    let payload: ReturnType<typeof validateSignedRequest>;
    try {
      payload = validateSignedRequest(
        signedRequest,
        String(this.config.get<string>('META_APP_SECRET') || '').trim(),
      );
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Malformed Meta signed_request.',
      );
    }
    const providerUserId = this.readOptionalString(payload.user_id);
    const agent = await this.findAgentByProviderIdentity('facebook', providerUserId);
    const confirmationCode = this.generateConfirmationCode();
    const storedConfirmationCode = hashAuthToken(confirmationCode);
    const completedAt = agent ? null : new Date();

    const created = await this.prisma.dataDeletionRequest.create({
      data: {
        provider: 'facebook',
        providerUserId,
        agentId: agent?.id,
        status: agent ? 'processing' : 'completed',
        confirmationCode: storedConfirmationCode,
        completedAt,
        rawPayload: payload as Prisma.InputJsonValue,
      },
    });

    if (agent) {
      await this.purgeAgentForDeletion(agent.id);
      await this.prisma.dataDeletionRequest.update({
        where: { id: created.id },
        data: {
          status: 'completed',
          completedAt: new Date(),
        },
      });
    }

    return {
      url: `${this.resolvePublicBaseUrl()}/data-deletion/status/${confirmationCode}`,
      confirmation_code: confirmationCode,
    };
  }

  async handleFacebookDeauthorize(signedRequest: string) {
    let payload: ReturnType<typeof validateSignedRequest>;
    try {
      payload = validateSignedRequest(
        signedRequest,
        String(this.config.get<string>('META_APP_SECRET') || '').trim(),
      );
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Malformed Meta signed_request.',
      );
    }
    const providerUserId = this.readOptionalString(payload.user_id);
    if (!providerUserId) {
      return { revoked: false, providerUserId: null };
    }

    const agent = await this.findAgentByProviderIdentity('facebook', providerUserId);

    if (!agent) {
      return { revoked: false, providerUserId };
    }

    await this.prisma.refreshToken.updateMany({
      where: { agentId: agent.id, revoked: false },
      data: { revoked: true },
    });

    await this.prisma.socialAccount.deleteMany({
      where: {
        agentId: agent.id,
        provider: 'facebook',
        providerUserId,
      },
    });

    if (agent.provider === 'facebook' && agent.providerId === providerUserId) {
      await this.prisma.agent.update({
        where: { id: agent.id },
        data: {
          provider: null,
          providerId: null,
          avatarUrl: null,
        },
      });
    }

    return { revoked: true, providerUserId };
  }

  async handleGoogleRiscEvent(rawJwt: string) {
    let payload: Awaited<ReturnType<typeof validateSecurityEventToken>>;
    try {
      payload = await validateSecurityEventToken(rawJwt, {
        issuer: GOOGLE_RISC_ISSUER,
        audience: this.resolveGoogleAudience(),
        jwks: this.googleRiscJwks,
      });
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Invalid Google RISC token.',
      );
    }

    const subject = this.readOptionalString(payload.sub);
    const eventTypes = Object.keys(payload.events || {});
    if (!subject || eventTypes.length === 0) {
      throw new BadRequestException('Malformed Google RISC event payload.');
    }

    for (const eventType of eventTypes) {
      const created = await this.prisma.riscEvent.create({
        data: {
          subject,
          eventType,
          rawJwt,
        },
      });

      await this.applyGoogleRiscEvent(subject, eventType);

      await this.prisma.riscEvent.update({
        where: { id: created.id },
        data: {
          processed: true,
          processedAt: new Date(),
        },
      });
    }

    return {
      accepted: true,
      subject,
      eventTypes,
    };
  }

  async getDeletionStatus(code: string) {
    const select = {
      provider: true,
      status: true,
      requestedAt: true,
      completedAt: true,
    } as const;
    const request =
      (await this.prisma.dataDeletionRequest.findUnique({
        where: { confirmationCode: hashAuthToken(code) },
        select,
      })) ||
      (await this.prisma.dataDeletionRequest.findUnique({
        where: { confirmationCode: code },
        select,
      }));

    if (!request) {
      return null;
    }

    return {
      provider: request.provider,
      status: request.status,
      requestedAt: request.requestedAt,
      completedAt: request.completedAt,
    };
  }

  async exportAgentData(agentId: string, workspaceId?: string | null) {
    const [agent, workspace, auditLogs, messages, socialAccounts, complianceState, deletionRequests, sessions] =
      await Promise.all([
      this.prisma.agent.findUnique({
        where: { id: agentId },
      }),
      workspaceId
        ? this.prisma.workspace.findUnique({
            where: { id: workspaceId },
          })
        : null,
      this.prisma.auditLog.findMany({
        where: { agentId },
        orderBy: { createdAt: 'desc' },
        take: 1000,
      }),
      workspaceId
        ? this.prisma.message.findMany({
            where: { workspaceId },
            orderBy: { createdAt: 'desc' },
            take: 500,
          })
        : [],
      this.prisma.socialAccount.findMany({
        where: { agentId },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.agentComplianceState.findUnique({
        where: { agentId },
      }),
      this.prisma.dataDeletionRequest.findMany({
        where: { agentId },
        orderBy: { requestedAt: 'desc' },
      }),
      this.prisma.refreshToken.findMany({
        where: { agentId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          revoked: true,
          expiresAt: true,
          revokedAt: true,
          lastUsedAt: true,
          userAgent: true,
          ipAddress: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    ]);

    return {
      exportedAt: new Date().toISOString(),
      user: agent,
      workspace,
      socialAccounts,
      complianceState,
      deletionRequests,
      sessions,
      auditLogs,
      messages,
    };
  }

  async requestSelfDeletion(agentId: string, workspaceId?: string | null) {
    const confirmationCode = this.generateConfirmationCode();
    const storedConfirmationCode = hashAuthToken(confirmationCode);
    const agent = await this.prisma.agent.findUnique({
      where: { id: agentId },
      select: {
        id: true,
        email: true,
        name: true,
      },
    });
    const statusUrl = `${this.resolvePublicBaseUrl()}/data-deletion/status/${confirmationCode}`;

    const created = await this.prisma.dataDeletionRequest.create({
      data: {
        provider: 'self',
        status: 'processing',
        confirmationCode: storedConfirmationCode,
        agentId,
        rawPayload: {
          requestedBy: 'self-service',
        } satisfies Prisma.InputJsonValue,
      },
    });

    await this.purgeAgentForDeletion(agentId);
    await this.prisma.dataDeletionRequest.update({
      where: { id: created.id },
      data: {
        status: 'completed',
        completedAt: new Date(),
      },
    });

    if (agent?.email) {
      await this.emailService.sendDataDeletionConfirmationEmail(
        agent.email,
        confirmationCode,
        statusUrl,
        agent.name || undefined,
      );
    }

    return {
      confirmationCode,
      status: 'completed',
    };
  }

  private async applyGoogleRiscEvent(subject: string, eventType: string) {
    const agent = await this.findAgentByProviderIdentity('google', subject);

    if (!agent) {
      this.logger.warn(`google_risc_subject_not_found: ${subject}`);
      return;
    }

    if (
      eventType === GOOGLE_RISC_EVENT.SESSIONS_REVOKED ||
      eventType === GOOGLE_RISC_EVENT.TOKENS_REVOKED
    ) {
      await this.prisma.refreshToken.updateMany({
        where: { agentId: agent.id, revoked: false },
        data: { revoked: true },
      });
      return;
    }

    if (eventType === GOOGLE_RISC_EVENT.ACCOUNT_DISABLED) {
      await this.prisma.refreshToken.updateMany({
        where: { agentId: agent.id, revoked: false },
        data: { revoked: true },
      });
      await this.prisma.agentComplianceState.upsert({
        where: { agentId: agent.id },
        create: {
          agentId: agent.id,
          disabledAt: new Date(),
        },
        update: {
          disabledAt: new Date(),
        },
      });
      return;
    }

    if (eventType === GOOGLE_RISC_EVENT.ACCOUNT_PURGED) {
      await this.purgeAgentForDeletion(agent.id);
    }
  }

  private resolveGoogleAudience() {
    const audience = this.readOptionalString(this.config.get<string>('GOOGLE_CLIENT_ID'));
    const publicAudience = this.readOptionalString(
      this.config.get<string>('NEXT_PUBLIC_GOOGLE_CLIENT_ID'),
    );

    return audience || publicAudience || '';
  }

  private async findAgentByProviderIdentity(provider: string, providerUserId: string | null) {
    if (!providerUserId) {
      return null;
    }

    return this.prisma.agent.findFirst({
      where: {
        OR: [
          {
            provider,
            providerId: providerUserId,
          },
          {
            socialAccounts: {
              some: {
                provider,
                providerUserId,
              },
            },
          },
        ],
      },
      select: {
        id: true,
        email: true,
        name: true,
        provider: true,
        providerId: true,
      },
    });
  }

  private async purgeAgentForDeletion(agentId: string) {
    await this.prisma.refreshToken.updateMany({
      where: { agentId, revoked: false },
      data: { revoked: true },
    });

    await this.prisma.socialAccount.deleteMany({
      where: { agentId },
    });

    await this.prisma.agent.update({
      where: { id: agentId },
      data: {
        name: '[DELETED]',
        email: `deleted-${agentId}@removed.local`,
        avatarUrl: null,
        provider: null,
        providerId: null,
      },
    });

    await this.prisma.agentComplianceState.upsert({
      where: { agentId },
      create: {
        agentId,
        purgedAt: new Date(),
      },
      update: {
        purgedAt: new Date(),
      },
    });
  }

  private resolvePublicBaseUrl() {
    const candidates = [
      this.config.get<string>('MARKETING_URL'),
      this.config.get<string>('PUBLIC_SITE_URL'),
      this.config.get<string>('FRONTEND_URL'),
      'https://kloel.com',
    ]
      .map((value) => String(value || '').trim())
      .filter(Boolean);

    return candidates[0].replace(/\/+$/g, '');
  }

  private generateConfirmationCode() {
    return randomBytes(12)
      .toString('base64url')
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(0, 16);
  }

  private readOptionalString(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }
}
