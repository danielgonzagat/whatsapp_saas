import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import type { ConnectService } from '../payments/connect/connect.service';
import {
  trimToUndefined,
  digitsOnly,
  buildPersonName,
  buildDateOfBirth,
  buildConnectAddress,
  type SubmitKycContext,
  type ConnectAddressInput,
} from './kyc.helpers';

type KycSyncDeps = {
  prisma: PrismaService;
  connectService: ConnectService;
};

export async function doAdminApprove(
  deps: { prisma: Pick<PrismaService, '$transaction'> },
  agentId: string,
) {
  await deps.prisma.$transaction(
    async (tx: Prisma.TransactionClient) => {
      const a = await tx.agent.findFirst({
        where: { id: agentId },
        select: { id: true, workspaceId: true, kycStatus: true },
      });
      if (!a) throw new NotFoundException('Agent not found');
      if (a.kycStatus === 'approved') throw new BadRequestException('KYC already approved');
      await tx.agent.update({
        where: { id: agentId, workspaceId: a.workspaceId },
        data: { kycStatus: 'approved', kycApprovedAt: new Date() },
      });
      return a;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
  );
  return { success: true, status: 'approved', agentId };
}

type AutoApprovePrisma = { prisma: Pick<PrismaService, 'agent'> };

export async function doAutoApproveIfComplete(
  deps: AutoApprovePrisma,
  getCompletion: (agentId: string, workspaceId: string) => Promise<{ percentage: number }>,
  agentId: string,
  workspaceId: string,
) {
  const completion = await getCompletion(agentId, workspaceId);
  if (completion.percentage >= 75) {
    await deps.prisma.agent.update({
      where: { id: agentId, workspaceId },
      data: { kycStatus: 'approved', kycApprovedAt: new Date() },
    });
    return { approved: true, percentage: completion.percentage };
  }
  return { approved: false, percentage: completion.percentage };
}

async function ensureSellerConnectAccount(
  deps: KycSyncDeps,
  workspaceId: string,
  email: string,
  displayName: string,
): Promise<string> {
  const existing = await deps.prisma.connectAccountBalance.findFirst({
    where: { workspaceId, accountType: 'SELLER' },
  });
  if (existing?.stripeAccountId) return existing.stripeAccountId;

  const created = await deps.connectService.createCustomAccount({
    workspaceId,
    accountType: 'SELLER',
    email,
    displayName,
  });
  return created.stripeAccountId;
}

export interface SyncOnboardingDeps extends KycSyncDeps {
  buildConnectAddress: (fiscal: ConnectAddressInput) => ReturnType<typeof buildConnectAddress>;
}

export async function syncSellerConnectOnboarding(
  deps: SyncOnboardingDeps,
  agentId: string,
  workspaceId: string,
  context?: SubmitKycContext,
): Promise<void> {
  const [agent, workspace, fiscal, bankAccount] = await Promise.all([
    deps.prisma.agent.findUnique({
      where: { id: agentId, workspaceId },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        birthDate: true,
        documentNumber: true,
        publicName: true,
        website: true,
      },
    }),
    deps.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true, name: true },
    }),
    deps.prisma.fiscalData.findUnique({ where: { workspaceId } }),
    deps.prisma.bankAccount.findFirst({
      where: { workspaceId, isDefault: true },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  if (!agent?.email)
    throw new NotFoundException('Agente responsavel nao encontrado para onboarding financeiro');
  if (!workspace)
    throw new NotFoundException('Workspace nao encontrado para onboarding financeiro');
  if (!fiscal) throw new BadRequestException('Dados fiscais ausentes para onboarding financeiro');
  if (!bankAccount)
    throw new BadRequestException('Conta bancaria ausente para onboarding financeiro');

  const businessType = fiscal.type === 'PJ' ? 'company' : 'individual';
  const address = deps.buildConnectAddress(fiscal);
  const cleanAddress = {
    ...(address.line1 !== undefined ? { line1: address.line1 } : {}),
    ...(address.line2 !== undefined ? { line2: address.line2 } : {}),
    ...(address.city !== undefined ? { city: address.city } : {}),
    ...(address.state !== undefined ? { state: address.state } : {}),
    ...(address.postalCode !== undefined ? { postalCode: address.postalCode } : {}),
    country: address.country,
  };
  const businessName =
    trimToUndefined(fiscal.nomeFantasia) ||
    trimToUndefined(fiscal.razaoSocial) ||
    trimToUndefined(fiscal.fullName) ||
    trimToUndefined(agent.publicName) ||
    trimToUndefined(agent.name) ||
    workspace.name;
  const representativeName =
    businessType === 'company'
      ? trimToUndefined(fiscal.responsavelNome) || trimToUndefined(agent.name)
      : trimToUndefined(fiscal.fullName) || trimToUndefined(agent.name);
  const representativeDocument =
    businessType === 'company'
      ? trimToUndefined(fiscal.responsavelCpf) || trimToUndefined(agent.documentNumber) || undefined
      : trimToUndefined(fiscal.cpf) || trimToUndefined(agent.documentNumber) || undefined;
  const { firstName, lastName } = buildPersonName(representativeName);
  const routingNumber =
    [digitsOnly(bankAccount.bankCode), digitsOnly(bankAccount.agency)].filter(Boolean).join('') ||
    undefined;
  const accountNumber = digitsOnly(bankAccount.account);
  const stripeAccountId = await ensureSellerConnectAccount(
    deps,
    workspaceId,
    agent.email,
    businessName,
  );
  const website = trimToUndefined(agent.website);
  const phone = trimToUndefined(agent.phone);
  const dob = buildDateOfBirth(agent.birthDate);
  const taxId = trimToUndefined(fiscal.cnpj);
  const tosIp = trimToUndefined(context?.ipAddress);
  const tosUa = trimToUndefined(context?.userAgent);

  await deps.connectService.submitOnboardingProfile({
    stripeAccountId,
    email: agent.email,
    country: 'BR',
    businessType,
    businessProfile: {
      name: businessName,
      ...(website !== undefined ? { url: website } : {}),
      supportEmail: agent.email,
      ...(phone !== undefined ? { supportPhone: phone } : {}),
    },
    ...(firstName || lastName || representativeDocument || representativeName
      ? {
          individual: {
            ...(firstName !== undefined ? { firstName } : {}),
            ...(lastName !== undefined ? { lastName } : {}),
            email: agent.email,
            ...(phone !== undefined ? { phone } : {}),
            ...(dob !== undefined ? { dateOfBirth: dob } : {}),
            ...(representativeDocument !== undefined
              ? { idNumber: representativeDocument }
              : {}),
            address: cleanAddress,
          },
        }
      : {}),
    ...(businessType === 'company'
      ? {
          company: {
            name: trimToUndefined(fiscal.razaoSocial) || businessName,
            ...(taxId !== undefined ? { taxId } : {}),
            ...(phone !== undefined ? { phone } : {}),
            address: cleanAddress,
          },
        }
      : {}),
    ...(accountNumber && routingNumber
      ? {
          externalAccount: {
            country: 'BR',
            currency: 'BRL',
            accountHolderName: trimToUndefined(bankAccount.holderName) || businessName,
            accountHolderType: businessType,
            routingNumber,
            accountNumber,
          },
        }
      : {}),
    ...(tosIp || tosUa
      ? {
          tosAcceptance: {
            acceptedAt: new Date().toISOString(),
            ...(tosIp !== undefined ? { ipAddress: tosIp } : {}),
            ...(tosUa !== undefined ? { userAgent: tosUa } : {}),
          },
        }
      : {}),
    metadata: {
      kycWorkspaceId: workspaceId,
      kycAgentId: agentId,
      kycSource: 'kyc_submit',
    },
  });
}
