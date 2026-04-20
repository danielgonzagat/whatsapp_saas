import { randomBytes } from 'node:crypto';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EmailService } from '../auth/email.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtSetValidator, SecurityEventTokenPayload } from './utils/jwt-set.validator';
import { validateSignedRequest } from './utils/signed-request.validator';

/** Compliance service. */
@Injectable()
export class ComplianceService {
  private readonly logger = new Logger(ComplianceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly jwtSetValidator: JwtSetValidator,
  ) {}

  /** Get deletion status. */
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

  /** Handle facebook data deletion. */
  async handleFacebookDataDeletion(signedRequest: string) {
    const payload = validateSignedRequest(signedRequest, process.env.META_APP_SECRET || '');
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

  /** Handle facebook deauthorize. */
  async handleFacebookDeauthorize(signedRequest: string) {
    const payload = validateSignedRequest(signedRequest, process.env.META_APP_SECRET || '');
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
      this.prisma.agent.findUnique({
        where: { id: agentId },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          phone: true,
          provider: true,
          providerId: true,
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
        where: { agentId },
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
    const agent = await this.prisma.agent.findUnique({
      where: { id: agentId },
      select: {
        email: true,
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
      if (!agent) return;
      await this.prisma.agent.update({
        where: { id: agent.id },
        data: { disabledAt: new Date() },
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
      cursor = (cursor as Record<string, unknown>)[key];
    }

    return typeof cursor === 'string' ? cursor.trim() : '';
  }

  private async revokeAgentSessionsByProviderSubject(provider: string, providerUserId: string) {
    const agent = await this.findAgentByProviderSubject(provider, providerUserId);
    if (!agent) return;

    await this.prisma.refreshToken.updateMany({
      where: { agentId: agent.id, revoked: false },
      data: { revoked: true },
    });
  }

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
      },
    });
  }

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

  private generateConfirmationCode() {
    return randomBytes(12).toString('hex').slice(0, 16);
  }
}
