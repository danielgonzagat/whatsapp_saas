import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Agent, Workspace } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { ConnectService } from '../payments/connect/connect.service';
import { PrismaService } from '../prisma/prisma.service';

const PARTNER_INVITE_ACCOUNT_TYPES: Record<string, import('@prisma/client').ConnectAccountType> = {
  AFFILIATE: 'AFFILIATE',
  SUPPLIER: 'SUPPLIER',
  COPRODUCER: 'COPRODUCER',
  MANAGER: 'MANAGER',
};

function asJsonObject(value: Prisma.JsonValue | null | undefined): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value;
}

/** Handles partner invite resolution and registration finalization. */
@Injectable()
export class AuthPartnerService {
  private readonly logger = new Logger(AuthPartnerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly connectService: ConnectService,
    private readonly auditService: AuditService,
  ) {}

  private hashOpaqueToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  resolvePartnerInviteAccountType(type: string): import('@prisma/client').ConnectAccountType {
    const accountType =
      PARTNER_INVITE_ACCOUNT_TYPES[
        String(type || '')
          .trim()
          .toUpperCase()
      ];
    if (!accountType) {
      throw new BadRequestException('Tipo de convite de parceria inválido.');
    }
    return accountType;
  }

  async resolvePartnerInvite(
    affiliateInviteToken: string | undefined,
    email: string,
  ): Promise<{
    id: string;
    workspaceId: string;
    partnerName: string;
    partnerEmail: string;
    type: string;
    partnerWorkspaceId: string | null;
    metadata: Prisma.JsonValue | null;
  } | null> {
    const rawToken = String(affiliateInviteToken || '').trim();
    if (!rawToken) {
      return null;
    }

    const inviteTokenHash = this.hashOpaqueToken(rawToken);
    const partner = await this.prisma.affiliatePartner.findFirst({
      where: {
        partnerEmail: email,
        metadata: { path: ['inviteTokenHash'], equals: inviteTokenHash },
      },
      select: {
        id: true,
        workspaceId: true,
        partnerName: true,
        partnerEmail: true,
        type: true,
        partnerWorkspaceId: true,
        metadata: true,
      },
    });

    if (!partner) {
      throw new BadRequestException('Convite de parceria inválido, expirado ou incompatível.');
    }

    if (partner.partnerWorkspaceId) {
      throw new ConflictException('Este convite de parceria já foi utilizado.');
    }

    return partner;
  }

  async finalizePartnerInviteRegistration(input: {
    invite: { id: string; metadata: Prisma.JsonValue | null; type: string };
    workspace: Workspace;
    agent: Agent;
    email: string;
  }) {
    let createdAccountBalanceId: string | null = null;

    try {
      const connectResult = await this.connectService.createCustomAccount({
        workspaceId: input.workspace.id,
        accountType: this.resolvePartnerInviteAccountType(input.invite.type),
        email: input.email,
        displayName: input.workspace.name,
      });
      createdAccountBalanceId = connectResult.accountBalanceId;

      const metadata = asJsonObject(input.invite.metadata);
      await this.prisma.affiliatePartner.update({
        where: { id: input.invite.id },
        data: {
          partnerWorkspaceId: input.workspace.id,
          status: 'ACTIVE',
          approvedAt: new Date(),
          metadata: {
            ...metadata,
            inviteAcceptedAt: new Date().toISOString(),
            inviteAcceptedWorkspaceId: input.workspace.id,
          },
        },
        select: { id: true, workspaceId: true },
      });
    } catch (_error: unknown) {
      const cause = _error instanceof Error ? _error : new Error(String(_error));
      this.logger.error(cause, {
        operation: 'partnerRegistration',
        step: 'connectAccountCreation',
        workspaceId: input.workspace.id,
        partnerId: input.invite.id,
      });

      try {
        await this.prisma.$transaction(
          async (tx) => {
            await tx.agent
              .delete({
                where: { id: input.agent.id },
                select: { id: true, workspaceId: true },
              })
              .catch(() => undefined);
            await tx.workspace.delete({ where: { id: input.workspace.id } }).catch(() => undefined);
            if (createdAccountBalanceId) {
              await tx.connectAccountBalance
                .deleteMany({ where: { id: createdAccountBalanceId } })
                .catch(() => undefined);
            }
            await this.auditService.logWithTx(tx, {
              workspaceId: input.workspace.id,
              action: 'PARTNER_REGISTRATION_ROLLBACK',
              resource: 'AuthPartner',
              resourceId: input.invite.id,
              agentId: input.agent.id,
              details: {
                inviteType: input.invite.type,
                hadConnectAccount: Boolean(createdAccountBalanceId),
                deletedAgentId: input.agent.id,
                deletedWorkspaceId: input.workspace.id,
              },
            });
          },
          { isolationLevel: 'ReadCommitted' },
        );
      } catch {
        // rollback transaction itself failed — surface the original error below
      }
      throw new ServiceUnavailableException(
        'Não foi possível provisionar sua conta de parceria agora. Tente novamente em instantes.',
      );
    }
  }
}
