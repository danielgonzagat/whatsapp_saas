import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service';
import type { ConnectService } from '../../payments/connect/connect.service';

export interface UploadedFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

export interface SubmitKycContext {
  ipAddress?: string;
  userAgent?: string;
}

export interface ConnectAddressInput {
  street?: string | null;
  number?: string | null;
  complement?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  cep?: string | null;
}

export function trimToUndefined(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function digitsOnly(value: unknown): string | undefined {
  const raw = trimToUndefined(value);
  if (!raw) return undefined;
  const normalized = raw.replace(/\D/g, '');
  return normalized || undefined;
}

export function buildPersonName(name: string | null | undefined): {
  firstName?: string;
  lastName?: string;
} {
  const normalized = trimToUndefined(name);
  if (!normalized) return {};
  const parts = normalized.split(/\s+/);
  const firstName = parts.shift();
  const lastName = parts.join(' ') || undefined;
  return { firstName, lastName };
}

export function buildDateOfBirth(
  date: Date | null | undefined,
): { day: number; month: number; year: number } | undefined {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return undefined;
  return { day: date.getUTCDate(), month: date.getUTCMonth() + 1, year: date.getUTCFullYear() };
}

export function buildConnectAddress(fiscal: ConnectAddressInput) {
  const line1 = [trimToUndefined(fiscal.street), trimToUndefined(fiscal.number)]
    .filter(Boolean)
    .join(', ');
  const line2 = [trimToUndefined(fiscal.complement), trimToUndefined(fiscal.neighborhood)]
    .filter(Boolean)
    .join(' - ');
  return {
    line1: line1 || undefined,
    line2: line2 || undefined,
    city: trimToUndefined(fiscal.city),
    state: trimToUndefined(fiscal.state),
    postalCode: trimToUndefined(fiscal.cep),
    country: 'BR' as const,
  };
}

export type KycSyncDeps = {
  prisma: PrismaService;
  connectService: ConnectService;
};

export async function doAdminApprove(deps: { prisma: any }, agentId: string) {
  const agent = await deps.prisma.agent.findUnique({
    where: { id: agentId },
    select: { id: true, kycStatus: true },
  });
  if (!agent) throw new NotFoundException('Agent not found');
  if (agent.kycStatus === 'approved') throw new BadRequestException('KYC already approved');
  await deps.prisma.agent.update({
    where: { id: agentId },
    data: { kycStatus: 'approved', kycApprovedAt: new Date() },
  });
  return { success: true, status: 'approved', agentId };
}

export async function doAutoApproveIfComplete(
  deps: { prisma: any },
  getCompletion: (agentId: string, workspaceId: string) => Promise<{ percentage: number }>,
  agentId: string,
  workspaceId: string,
) {
  const completion = await getCompletion(agentId, workspaceId);
  if (completion.percentage >= 75) {
    await deps.prisma.agent.update({
      where: { id: agentId },
      data: { kycStatus: 'approved', kycApprovedAt: new Date() },
    });
    return { approved: true, percentage: completion.percentage };
  }
  return { approved: false, percentage: completion.percentage };
}

export async function ensureSellerConnectAccount(
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
      where: { id: agentId },
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

  await deps.connectService.submitOnboardingProfile({
    stripeAccountId,
    email: agent.email,
    country: 'BR',
    businessType,
    businessProfile: {
      name: businessName,
      url: trimToUndefined(agent.website),
      supportEmail: agent.email,
      supportPhone: trimToUndefined(agent.phone),
    },
    individual:
      firstName || lastName || representativeDocument || representativeName
        ? {
            firstName,
            lastName,
            email: agent.email,
            phone: trimToUndefined(agent.phone),
            dateOfBirth: buildDateOfBirth(agent.birthDate),
            idNumber: representativeDocument,
            address,
          }
        : undefined,
    company:
      businessType === 'company'
        ? {
            name: trimToUndefined(fiscal.razaoSocial) || businessName,
            taxId: trimToUndefined(fiscal.cnpj),
            phone: trimToUndefined(agent.phone),
            address,
          }
        : undefined,
    externalAccount:
      accountNumber && routingNumber
        ? {
            country: 'BR',
            currency: 'BRL',
            accountHolderName: trimToUndefined(bankAccount.holderName) || businessName,
            accountHolderType: businessType,
            routingNumber,
            accountNumber,
          }
        : undefined,
    tosAcceptance:
      context?.ipAddress || context?.userAgent
        ? {
            acceptedAt: new Date().toISOString(),
            ipAddress: trimToUndefined(context.ipAddress),
            userAgent: trimToUndefined(context.userAgent),
          }
        : undefined,
    metadata: {
      kycWorkspaceId: workspaceId,
      kycAgentId: agentId,
      kycSource: 'kyc_submit',
    },
  });
}
