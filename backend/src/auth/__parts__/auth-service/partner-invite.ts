import {
  BadRequestException,
  ConflictException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Agent, ConnectAccountType, Prisma, Workspace } from '@prisma/client';
import type { PrismaService } from '../../../prisma/prisma.service';
import type { ConnectService } from '../../../payments/connect/connect.service';
import { hashOpaqueToken, asJsonObject } from './helpers';

export const PARTNER_INVITE_ACCOUNT_TYPES: Record<string, ConnectAccountType> = {
  AFFILIATE: 'AFFILIATE',
  SUPPLIER: 'SUPPLIER',
  COPRODUCER: 'COPRODUCER',
  MANAGER: 'MANAGER',
};

export function resolvePartnerInviteAccountType(type: string): ConnectAccountType {
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

export async function resolvePartnerInvite(
  prisma: PrismaService,
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

  const inviteTokenHash = hashOpaqueToken(rawToken);
  const partner = await prisma.affiliatePartner.findFirst({
    where: {
      partnerEmail: email,
      metadata: {
        path: ['inviteTokenHash'],
        equals: inviteTokenHash,
      },
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

export async function finalizePartnerInviteRegistration(
  connectService: ConnectService,
  prisma: PrismaService,
  input: {
    invite: {
      id: string;
      metadata: Prisma.JsonValue | null;
      type: string;
    };
    workspace: Workspace;
    agent: Agent;
    email: string;
  },
): Promise<void> {
  let createdAccountBalanceId: string | null = null;

  try {
    const connectResult = await connectService.createCustomAccount({
      workspaceId: input.workspace.id,
      accountType: resolvePartnerInviteAccountType(input.invite.type),
      email: input.email,
      displayName: input.workspace.name,
    });
    createdAccountBalanceId = connectResult.accountBalanceId;

    const metadata = asJsonObject(input.invite.metadata);
    await prisma.affiliatePartner.update({
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
    });
  } catch (_error) {
    const rollbackOperations: Promise<unknown>[] = [
      prisma.agent.delete({ where: { id: input.agent.id } }).catch(() => undefined),
      prisma.workspace.delete({ where: { id: input.workspace.id } }).catch(() => undefined),
    ];

    if (createdAccountBalanceId) {
      rollbackOperations.push(
        prisma.connectAccountBalance
          .deleteMany({ where: { id: createdAccountBalanceId } })
          .catch(() => undefined),
      );
    }

    await Promise.all(rollbackOperations);
    throw new ServiceUnavailableException(
      'Nao foi possivel provisionar sua conta de parceria agora. Tente novamente em instantes.',
    );
  }
}
