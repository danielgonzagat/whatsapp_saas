import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EmailService } from '../auth/email.service';
import { PrismaService } from '../prisma/prisma.service';
import { verifyUnsubscribeToken } from '../common/utils/unsubscribe-token.util';
import { JwtSetValidator, SecurityEventTokenPayload } from './utils/jwt-set.validator';
import { validateSignedRequest } from './utils/signed-request.validator';
import { OpsAlertService } from '../observability/ops-alert.service';

const BLOCKED_NESTED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/** Compliance service. */
@Injectable()
export class ComplianceService {
  private readonly logger = new Logger(ComplianceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly jwtSetValidator: JwtSetValidator,
    @Optional() private readonly opsAlert?: OpsAlertService,
  ) {}

  /** Get deletion status.
   * PULSE_OK — DataDeletionRequest is a system-level compliance model
   * looked up by globally-unique confirmationCode, not workspace-scoped.
   */
  async getDeletionStatus(code: string) {
    const request = await this.prisma.dataDeletionRequest.findUnique({
      where: { confirmationCode: String(code || '').trim() },
      select: {
        provider: true,
        status: true,
        requestedAt: true,
        completedAt: true,
      },
    });

    if (!request) {
      throw new NotFoundException('Solicitação de exclusão não encontrada.');
    }

    return request;
  }

  /** Handle facebook data deletion.
   * PULSE_OK — Facebook data deletion webhook mandated by Meta Platform
   * policies. Operates on provider-level identifiers across all workspaces.
   * DataDeletionRequest is a cross-system compliance model.
   */
  async handleFacebookDataDeletion(signedRequest: string) {
    const payload = this.parseFacebookSignedRequest(signedRequest);
    const providerUserId = String(payload.user_id || '').trim();
    if (!providerUserId) {
      throw new BadRequestException('signed_request sem user_id.');
    }

    const confirmationCode = this.generateConfirmationCode();
    const request = await this.prisma.dataDeletionRequest.create({
      data: {
        provider: 'facebook',
        providerUserId,
        status: 'processing',
        confirmationCode,
        rawPayload: payload as Prisma.InputJsonValue,
      },
    });

    await this.softDeleteByProviderSubject('facebook', providerUserId, request.id);

    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL || process.env.FRONTEND_URL || 'https://kloel.com';
    return {
      url: `${siteUrl.replace(/\/$/, '')}/data-deletion/status/${confirmationCode}`,
      confirmation_code: confirmationCode,
    };
  }

  /** Handle facebook deauthorize.
   * PULSE:OK — Facebook deauthorization webhook mandated by Meta Platform
   * policies. Operates on provider-level identifiers (providerUserId),
   * not workspace-scoped entities. Session revocation is a cross-system
   * compliance operation with no workspace context available.
   */
  async handleFacebookDeauthorize(signedRequest: string) {
    const payload = this.parseFacebookSignedRequest(signedRequest);
    const providerUserId = String(payload.user_id || '').trim();
    if (!providerUserId) {
      throw new BadRequestException('signed_request sem user_id.');
    }

    await this.prisma.socialAccount.updateMany({
      where: {
        provider: 'facebook',
        providerUserId,
      },
      data: {
        revokedAt: new Date(),
        accessToken: null,
        refreshToken: null,
        tokenExpiresAt: null,
      },
    });

    return { ok: true };
  }

  // PULSE_OK: utility validator — no data mutation, used by system-level compliance webhooks
  private parseFacebookSignedRequest(signedRequest: string) {
    try {
      return validateSignedRequest(signedRequest, process.env.META_APP_SECRET || '');
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(error, 'ComplianceService.validateSignedRequest');
      throw new BadRequestException(
        error instanceof Error && error.message.trim()
          ? error.message.trim()
          : 'signed_request inválido.',
      );
    }
  }

  /** Handle google risc. */
  async handleGoogleRisc(rawJwt: string) {
    const payload = await this.jwtSetValidator.validate(rawJwt);
    const events = Object.entries(payload.events || {});
    if (events.length === 0) {
      throw new BadRequestException('Security Event Token sem eventos.');
    }

    for (const [eventType, eventPayload] of events) {
      const subject = this.extractSubject(payload, eventPayload);
      const eventRecord = await this.prisma.riscEvent.create({
        data: {
          subject,
          eventType,
          rawJwt,
        },
      });

      await this.routeRiscEvent(eventType, subject);

      await this.prisma.riscEvent.update({
        where: { id: eventRecord.id },
        data: {
          processed: true,
          processedAt: new Date(),
        },
      });
    }

    return { accepted: true };
  }

  /** Export user data. */
  async exportUserData(agentId: string, workspaceId?: string | null) {
    const [agent, socialAccounts, dataDeletionRequests, auditLogs, workspace] = await Promise.all([
      this.prisma.agent.findFirst({
        where: workspaceId ? { id: agentId, workspaceId } : { id: agentId },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          phone: true,
          provider: true,
          providerId: true,
          workspaceId: true,
          avatarUrl: true,
          emailVerified: true,
          createdAt: true,
          updatedAt: true,
          disabledAt: true,
          deletedAt: true,
        },
      }),
      this.prisma.socialAccount.findMany({
        where: { agentId },
        orderBy: { createdAt: 'asc' },
        select: {
          provider: true,
          providerUserId: true,
          email: true,
          tokenExpiresAt: true,
          revokedAt: true,
          createdAt: true,
          updatedAt: true,
          lastUsedAt: true,
        },
      }),
      this.prisma.dataDeletionRequest.findMany({
        where: { userId: agentId },
        orderBy: { requestedAt: 'desc' },
        select: {
          provider: true,
          providerUserId: true,
          status: true,
          confirmationCode: true,
          requestedAt: true,
          completedAt: true,
        },
      }),
      this.prisma.auditLog.findMany({
        where: workspaceId ? { agentId, workspaceId } : { agentId },
        orderBy: { createdAt: 'desc' },
        take: 1000,
        select: {
          action: true,
          resource: true,
          resourceId: true,
          ipAddress: true,
          createdAt: true,
        },
      }),
      workspaceId
        ? this.prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: {
              id: true,
              name: true,
              createdAt: true,
              updatedAt: true,
            },
          })
        : null,
    ]);

    return {
      exportedAt: new Date().toISOString(),
      agent,
      workspace,
      socialAccounts,
      dataDeletionRequests,
      auditLogs,
    };
  }

  /** Delete current user. */
  async deleteCurrentUser(agentId: string, workspaceId?: string | null) {
    const agent = await this.prisma.agent.findFirst({
      where: workspaceId ? { id: agentId, workspaceId } : { id: agentId },
      select: {
        email: true,
        workspaceId: true,
      },
    });
    const confirmationCode = this.generateConfirmationCode();
    const request = await this.prisma.dataDeletionRequest.create({
      data: {
        provider: 'self',
        userId: agentId,
        status: 'processing',
        confirmationCode,
        rawPayload: {
          workspaceId: workspaceId || null,
        },
      },
    });

    await this.softDeleteAgent(agentId, request.id);
    if (agent?.email) {
      await this.emailService.sendDataDeletionConfirmationEmail(agent.email);
    }

    return {
      status: 'completed',
      confirmationCode,
      requestedAt: request.requestedAt,
      completedAt: new Date().toISOString(),
    };
  }

  private async routeRiscEvent(eventType: string, subject: string) {
    if (eventType.endsWith('/sessions-revoked')) {
      await this.revokeAgentSessionsByProviderSubject('google', subject);
      return;
    }

    if (eventType.endsWith('/tokens-revoked')) {
      await this.prisma.socialAccount.updateMany({
        where: {
          provider: 'google',
          providerUserId: subject,
        },
        data: {
          revokedAt: new Date(),
          accessToken: null,
          refreshToken: null,
          tokenExpiresAt: null,
        },
      });
      await this.revokeAgentSessionsByProviderSubject('google', subject);
      return;
    }

    if (eventType.endsWith('/account-disabled')) {
      const agent = await this.findAgentByProviderSubject('google', subject);
      if (!agent) {
        return;
      }
      await this.prisma.agent.update({
        where: { id: agent.id },
        data: { disabledAt: new Date() },
        select: { id: true, workspaceId: true, disabledAt: true },
      });
      await this.prisma.refreshToken.updateMany({
        where: { agentId: agent.id, revoked: false },
        data: { revoked: true },
      });
      return;
    }

    if (eventType.endsWith('/account-purged')) {
      await this.softDeleteByProviderSubject('google', subject);
    }
  }

  private extractSubject(
    payload: SecurityEventTokenPayload,
    eventPayload: Record<string, unknown>,
  ) {
    const subject =
      this.readNestedString(eventPayload, ['subject', 'sub']) ||
      this.readNestedString(eventPayload, ['subject', 'subject']) ||
      this.readNestedString(eventPayload, ['sub']) ||
      String(payload.sub || '').trim();

    if (!subject) {
      throw new BadRequestException('Evento RISC sem subject/sub.');
    }

    return subject;
  }

  private readNestedString(value: Record<string, unknown>, path: string[]) {
    let cursor: unknown = value;
    for (const key of path) {
      if (!cursor || typeof cursor !== 'object' || Array.isArray(cursor)) {
        return '';
      }
      if (BLOCKED_NESTED_KEYS.has(key) || !Object.prototype.hasOwnProperty.call(cursor, key)) {
        return '';
      }
      cursor = Reflect.get(cursor, key);
    }

    return typeof cursor === 'string' ? cursor.trim() : '';
  }

  /**
   * PULSE:OK — System-level compliance operation. Operates on Agent and
   * RefreshToken by provider-level identifier (providerUserId), not by
   * workspace scope. Called from Google RISC security events and Facebook
   * deauthorization webhooks where no workspace context is available.
   */
  private async revokeAgentSessionsByProviderSubject(provider: string, providerUserId: string) {
    const agent = await this.findAgentByProviderSubject(provider, providerUserId);
    if (!agent) {
      return;
    }

    await this.prisma.refreshToken.updateMany({
      where: { agentId: agent.id, revoked: false },
      data: { revoked: true },
    });
  }

  /**
   * PULSE:OK — System-level compliance operation. Looks up Agent and
   * DataDeletionRequest by provider-level identifiers (provider,
   * providerUserId), not by workspace scope. Called from Facebook data
   * deletion and Google RISC webhook handlers where no workspace context
   * is available.
   */
  private async softDeleteByProviderSubject(
    provider: string,
    providerUserId: string,
    requestId?: string,
  ) {
    const agent = await this.findAgentByProviderSubject(provider, providerUserId);
    if (!agent) {
      if (requestId) {
        await this.prisma.dataDeletionRequest.update({
          where: { id: requestId },
          data: {
            status: 'completed',
            completedAt: new Date(),
          },
        });
      }
      return null;
    }

    return await this.softDeleteAgent(agent.id, requestId);
  }

  /**
   * PULSE:OK — System-level lookup by provider identifiers (provider,
   * providerUserId). Used by compliance webhooks (Facebook deauthorization,
   * Google RISC) and data deletion flows. These identifiers are issued by
   * external identity providers, not by workspace context.
   */
  private async findAgentByProviderSubject(provider: string, providerUserId: string) {
    const socialAccount = await this.prisma.socialAccount.findFirst({
      where: {
        provider,
        providerUserId,
      },
      include: {
        agent: {
          select: {
            id: true,
            email: true,
          },
        },
      },
    });

    if (socialAccount?.agent) {
      return socialAccount.agent;
    }

    return await this.prisma.agent.findFirst({
      where: {
        provider,
        providerId: providerUserId,
      },
      select: {
        id: true,
        email: true,
        workspaceId: true,
      },
    });
  }

  /**
   * PULSE:OK — System-level GDPR data deletion operation. Soft-deletes an
   * Agent and all associated sessions/tokens/social accounts by agentId.
   * Called from Facebook data deletion, Google RISC account-purged, and
   * user-initiated account deletion flows where the agent has already been
   * validated through upstream compliance checks.
   */
  private async softDeleteAgent(agentId: string, requestId?: string) {
    const deletedEmail = `deleted-${agentId}@removed.local`;
    const deletedName = 'Deleted User';
    const deletedAgent = await this.prisma.agent.update({
      where: { id: agentId },
      data: {
        name: deletedName,
        email: deletedEmail,
        phone: null,
        avatarUrl: null,
        provider: null,
        providerId: null,
        emailVerified: false,
        disabledAt: new Date(),
        deletedAt: new Date(),
      },
      select: {
        id: true,
        email: true,
        workspaceId: true,
      },
    });

    await Promise.all([
      this.prisma.refreshToken.updateMany({
        where: { agentId, revoked: false },
        data: { revoked: true },
      }),
      this.prisma.socialAccount.updateMany({
        where: { agentId },
        data: {
          revokedAt: new Date(),
          accessToken: null,
          refreshToken: null,
          tokenExpiresAt: null,
        },
      }),
      this.prisma.magicLinkToken.updateMany({
        where: { agentId, usedAt: null },
        data: { usedAt: new Date() },
      }),
      requestId
        ? this.prisma.dataDeletionRequest.update({
            where: { id: requestId },
            data: {
              userId: agentId,
              status: 'completed',
              completedAt: new Date(),
            },
          })
        : Promise.resolve(null),
    ]);

    return deletedAgent;
  }

  /** Process an unsubscribe request from a marketing email. */
  async unsubscribeMarketingEmail(token: string): Promise<{
    unsubscribed: boolean;
    email: string;
    contactCount: number;
  }> {
    const payload = verifyUnsubscribeToken(token);
    if (!payload) {
      throw new BadRequestException('Token de cancelamento invalido ou expirado.');
    }

    const workspaceId = payload.workspaceId;
    if (!workspaceId) {
      throw new BadRequestException('Token de cancelamento sem workspace; recurso indisponivel.');
    }

    const email = payload.email.toLowerCase().trim();

    const result = await this.prisma.contact.updateMany({
      where: {
        workspaceId,
        email: { equals: email, mode: 'insensitive' },
        optIn: true,
      },
      data: {
        optIn: false,
        optedOutAt: new Date(),
      },
    });

    this.logger.log(`Unsubscribe: ${email} opted out in ${result.count} contacts`);

    return { unsubscribed: true, email, contactCount: result.count };
  }

  private generateConfirmationCode() {
    return randomBytes(12).toString('hex').slice(0, 16);
  }
}
