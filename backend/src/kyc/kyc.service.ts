import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { compare as bcryptCompare, hash as bcryptHash } from 'bcrypt';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { BCRYPT_ROUNDS } from '../common/constants';
import { ConnectService } from '../payments/connect/connect.service';
import { StorageService } from '../common/storage/storage.service';
import { PrismaService } from '../prisma/prisma.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateBankDto } from './dto/update-bank.dto';
import { UpdateFiscalDto } from './dto/update-fiscal.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

interface UploadedFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

interface SubmitKycContext {
  ipAddress?: string;
  userAgent?: string;
}

function trimToUndefined(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function digitsOnly(value: unknown): string | undefined {
  const raw = trimToUndefined(value);
  if (!raw) {
    return undefined;
  }
  const normalized = raw.replace(/\D/g, '');
  return normalized || undefined;
}

function buildPersonName(name: string | null | undefined): {
  firstName?: string;
  lastName?: string;
} {
  const normalized = trimToUndefined(name);
  if (!normalized) {
    return {};
  }

  const parts = normalized.split(/\s+/);
  const firstName = parts.shift();
  const lastName = parts.join(' ') || undefined;
  return {
    firstName,
    lastName,
  };
}

function buildDateOfBirth(date: Date | null | undefined):
  | {
      day: number;
      month: number;
      year: number;
    }
  | undefined {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return undefined;
  }

  return {
    day: date.getUTCDate(),
    month: date.getUTCMonth() + 1,
    year: date.getUTCFullYear(),
  };
}

/** Kyc service. */
@Injectable()
export class KycService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly auditService: AuditService,
    private readonly connectService: ConnectService,
  ) {}

  private buildConnectAddress(fiscal: {
    street?: string | null;
    number?: string | null;
    complement?: string | null;
    neighborhood?: string | null;
    city?: string | null;
    state?: string | null;
    cep?: string | null;
  }) {
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
      country: 'BR',
    };
  }

  private async ensureSellerConnectAccount(params: {
    workspaceId: string;
    email: string;
    displayName: string;
  }) {
    const existing = await this.prisma.connectAccountBalance.findFirst({
      where: { workspaceId: params.workspaceId, accountType: 'SELLER' },
    });
    if (existing?.stripeAccountId) {
      return existing.stripeAccountId;
    }

    const created = await this.connectService.createCustomAccount({
      workspaceId: params.workspaceId,
      accountType: 'SELLER',
      email: params.email,
      displayName: params.displayName,
    });
    return created.stripeAccountId;
  }

  private async syncSellerConnectOnboarding(
    agentId: string,
    workspaceId: string,
    context?: SubmitKycContext,
  ) {
    const [agent, workspace, fiscal, bankAccount] = await Promise.all([
      this.prisma.agent.findUnique({
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
      this.prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: {
          id: true,
          name: true,
        },
      }),
      this.prisma.fiscalData.findUnique({ where: { workspaceId } }),
      this.prisma.bankAccount.findFirst({
        where: { workspaceId, isDefault: true },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    if (!agent?.email) {
      throw new NotFoundException('Agente responsavel nao encontrado para onboarding financeiro');
    }
    if (!workspace) {
      throw new NotFoundException('Workspace nao encontrado para onboarding financeiro');
    }
    if (!fiscal) {
      throw new BadRequestException('Dados fiscais ausentes para onboarding financeiro');
    }
    if (!bankAccount) {
      throw new BadRequestException('Conta bancaria ausente para onboarding financeiro');
    }

    const businessType = fiscal.type === 'PJ' ? 'company' : 'individual';
    const address = this.buildConnectAddress(fiscal);
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
        ? trimToUndefined(fiscal.responsavelCpf) ||
          trimToUndefined(agent.documentNumber) ||
          undefined
        : trimToUndefined(fiscal.cpf) || trimToUndefined(agent.documentNumber) || undefined;
    const { firstName, lastName } = buildPersonName(representativeName);
    const routingNumber =
      [digitsOnly(bankAccount.bankCode), digitsOnly(bankAccount.agency)].filter(Boolean).join('') ||
      undefined;
    const accountNumber = digitsOnly(bankAccount.account);
    const stripeAccountId = await this.ensureSellerConnectAccount({
      workspaceId,
      email: agent.email,
      displayName: businessName,
    });

    await this.connectService.submitOnboardingProfile({
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

  // ═══ PROFILE ═══

  async getProfile(agentId: string) {
    return this.prisma.agent.findUnique({
      where: { id: agentId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        avatarUrl: true,
        birthDate: true,
        documentType: true,
        documentNumber: true,
        kycStatus: true,
        kycSubmittedAt: true,
        kycApprovedAt: true,
        kycRejectedReason: true,
        publicName: true,
        bio: true,
        website: true,
        instagram: true,
      },
    });
  }

  /** Update profile. */
  async updateProfile(agentId: string, dto: UpdateProfileDto) {
    const data: Prisma.AgentUpdateInput = { ...dto };
    if (dto.birthDate) {
      data.birthDate = new Date(dto.birthDate);
    }

    // If agent was rejected, reset to pending so they can re-submit
    const agent = await this.prisma.agent.findUnique({
      where: { id: agentId },
      select: { kycStatus: true },
    });
    if (agent?.kycStatus === 'rejected') {
      data.kycStatus = 'pending';
      data.kycRejectedReason = null;
    }

    return this.prisma.agent.update({ where: { id: agentId }, data });
  }

  /** Upload avatar. */
  async uploadAvatar(agentId: string, file: UploadedFile) {
    if (!file) {
      throw new BadRequestException('No file provided');
    }
    if (file.size > 5 * 1024 * 1024) {
      throw new BadRequestException('File too large (max 5MB)');
    }

    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedMimes.includes(file.mimetype)) {
      throw new BadRequestException('Only JPG, PNG, and WebP images are allowed');
    }

    const ext = file.originalname?.split('.').pop() || 'jpg';
    const filename = `kyc/avatars/avatar_${agentId}_${Date.now()}.${ext}`;

    const result = await this.storage.upload(file.buffer, {
      filename,
      mimeType: file.mimetype,
    });

    await this.prisma.agent.update({
      where: { id: agentId },
      data: { avatarUrl: result.url },
    });

    return { avatarUrl: result.url };
  }

  // ═══ FISCAL ═══

  async getFiscal(workspaceId: string) {
    return this.prisma.fiscalData.findUnique({ where: { workspaceId } });
  }

  /** Update fiscal. */
  async updateFiscal(workspaceId: string, dto: UpdateFiscalDto) {
    return this.prisma.fiscalData.upsert({
      where: { workspaceId },
      create: { workspaceId, ...dto },
      update: { ...dto },
    });
  }

  // ═══ DOCUMENTS ═══

  async getDocuments(agentId: string, workspaceId: string) {
    return this.prisma.kycDocument.findMany({
      where: { agentId, workspaceId },
      select: {
        id: true,
        agentId: true,
        workspaceId: true,
        type: true,
        status: true,
        fileUrl: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  /** Upload document. */
  async uploadDocument(agentId: string, workspaceId: string, type: string, file: UploadedFile) {
    const allowedTypes = [
      'DOCUMENT_FRONT',
      'DOCUMENT_BACK',
      'PROOF_OF_ADDRESS',
      'COMPANY_DOCUMENT',
    ];
    if (!allowedTypes.includes(type)) {
      throw new BadRequestException(`Invalid document type. Allowed: ${allowedTypes.join(', ')}`);
    }

    if (!file) {
      throw new BadRequestException('No file provided');
    }
    if (file.size > 10 * 1024 * 1024) {
      throw new BadRequestException('File too large (max 10MB)');
    }

    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowedMimes.includes(file.mimetype)) {
      throw new BadRequestException('Only JPG, PNG, WebP, and PDF files are allowed');
    }

    const ext = file.originalname?.split('.').pop() || 'pdf';
    const filename = `kyc/documents/kyc_${type}_${agentId}_${Date.now()}.${ext}`;

    const result = await this.storage.upload(file.buffer, {
      filename,
      mimeType: file.mimetype,
    });

    return this.prisma.kycDocument.create({
      data: {
        workspaceId,
        agentId,
        type,
        fileUrl: result.url,
        fileName: file.originalname || filename,
        fileSize: file.size,
        mimeType: file.mimetype,
      },
    });
  }

  /** Delete document. */
  async deleteDocument(agentId: string, documentId: string) {
    const doc = await this.prisma.kycDocument.findUnique({
      where: { id: documentId },
    });
    if (!doc) {
      throw new NotFoundException('Document not found');
    }
    if (doc.agentId !== agentId) {
      throw new BadRequestException('Not your document');
    }
    if (doc.status !== 'pending') {
      throw new BadRequestException(
        'Cannot delete a document that is already under review or approved',
      );
    }

    await this.auditService.log({
      workspaceId: doc.workspaceId,
      action: 'DELETE_RECORD',
      resource: 'KycDocument',
      resourceId: documentId,
      agentId,
      details: { deletedBy: 'user', type: doc.type },
    });
    await this.prisma.kycDocument.delete({ where: { id: documentId } });
    return { success: true };
  }

  // ═══ BANK ═══

  async getBankAccount(workspaceId: string) {
    const defaultAccount = await this.prisma.bankAccount.findFirst({
      where: { workspaceId, isDefault: true },
    });
    return (
      defaultAccount ??
      this.prisma.bankAccount.findFirst({
        where: { workspaceId },
        orderBy: { createdAt: 'desc' },
      })
    );
  }

  /** Update bank account. */
  async updateBankAccount(workspaceId: string, dto: UpdateBankDto) {
    const existing = await this.prisma.bankAccount.findFirst({
      where: { workspaceId, isDefault: true },
    });

    const last4 = dto.account?.slice(-4) || dto.pixKey?.slice(-4) || '';
    const displayAccount = last4 ? `****${last4}` : null;

    if (existing) {
      return this.prisma.bankAccount.update({
        where: { id: existing.id },
        data: { ...dto, displayAccount },
      });
    }

    return this.prisma.bankAccount.create({
      data: { workspaceId, ...dto, isDefault: true, displayAccount },
    });
  }

  // ═══ SECURITY ═══

  async changePassword(agentId: string, dto: ChangePasswordDto) {
    const agent = await this.prisma.agent.findUnique({
      where: { id: agentId },
      select: { password: true, provider: true },
    });

    if (!agent) {
      throw new NotFoundException('Agent not found');
    }
    if (agent.provider && !agent.password) {
      throw new BadRequestException('OAuth users cannot change password here');
    }

    const valid = await bcryptCompare(dto.currentPassword, agent.password);
    if (!valid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const hashedPassword = await bcryptHash(dto.newPassword, BCRYPT_ROUNDS);
    await this.prisma.agent.update({
      where: { id: agentId },
      data: { password: hashedPassword },
    });

    return { success: true };
  }

  // ═══ KYC STATUS & COMPLETION ═══

  async getStatus(agentId: string) {
    return this.prisma.agent.findUnique({
      where: { id: agentId },
      select: {
        kycStatus: true,
        kycSubmittedAt: true,
        kycApprovedAt: true,
        kycRejectedReason: true,
      },
    });
  }

  /** Get completion. */
  async getCompletion(agentId: string, workspaceId: string) {
    const [agent, fiscal, documents, bankAccount] = await Promise.all([
      this.prisma.agent.findUnique({
        where: { id: agentId },
        select: { name: true, phone: true, birthDate: true },
      }),
      this.prisma.fiscalData.findUnique({ where: { workspaceId } }),
      this.prisma.kycDocument.findMany({
        take: 50,
        where: { agentId, workspaceId },
        select: { type: true },
      }),
      this.prisma.bankAccount.findFirst({ where: { workspaceId } }),
    ]);

    const documentTypes = new Set(documents.map((d) => d.type));

    const sections = [
      {
        name: 'profile',
        complete: !!(agent?.name && agent?.phone && agent?.birthDate),
        weight: 25,
      },
      {
        name: 'fiscal',
        complete: !!(
          fiscal?.type &&
          ((fiscal.type === 'PF' && fiscal.cpf && fiscal.fullName) ||
            (fiscal.type === 'PJ' && fiscal.cnpj && fiscal.razaoSocial)) &&
          fiscal.cep &&
          fiscal.city &&
          fiscal.state
        ),
        weight: 25,
      },
      {
        name: 'documents',
        complete:
          documentTypes.has('DOCUMENT_FRONT') &&
          (fiscal?.type === 'PJ'
            ? documentTypes.has('COMPANY_DOCUMENT')
            : documentTypes.has('PROOF_OF_ADDRESS')),
        weight: 25,
      },
      {
        name: 'bank',
        complete: !!bankAccount,
        weight: 25,
      },
    ];

    const percentage = sections.reduce((sum, s) => sum + (s.complete ? s.weight : 0), 0);

    return {
      percentage,
      sections: sections.map((s) => ({
        name: s.name,
        complete: s.complete,
        percentage: s.complete ? s.weight : 0,
      })),
      canSubmit: percentage >= 100,
    };
  }

  /** Submit kyc. */
  async submitKyc(agentId: string, workspaceId: string, context?: SubmitKycContext) {
    const completion = await this.getCompletion(agentId, workspaceId);
    if (completion.percentage < 100) {
      throw new BadRequestException('Complete all required sections before submitting');
    }

    const agent = await this.prisma.agent.findUnique({
      where: { id: agentId },
      select: { kycStatus: true },
    });

    if (agent?.kycStatus === 'submitted') {
      throw new BadRequestException('KYC already submitted and under review');
    }
    if (agent?.kycStatus === 'approved') {
      throw new BadRequestException('KYC already approved');
    }

    await this.syncSellerConnectOnboarding(agentId, workspaceId, context);

    await this.prisma.agent.update({
      where: { id: agentId },
      data: { kycStatus: 'submitted', kycSubmittedAt: new Date() },
    });

    // Auto-approve if completion is sufficient
    const autoResult = await this.autoApproveIfComplete(agentId, workspaceId);
    if (autoResult.approved) {
      return {
        success: true,
        status: 'approved',
        autoApproved: true,
        percentage: autoResult.percentage,
      };
    }

    return { success: true, status: 'submitted' };
  }

  // ═══ AUTO-APPROVAL ═══

  async autoApproveIfComplete(agentId: string, workspaceId: string) {
    const completion = await this.getCompletion(agentId, workspaceId);

    // Auto-approve if KYC completion >= 75% (MVP threshold)
    if (completion.percentage >= 75) {
      await this.prisma.agent.update({
        where: { id: agentId },
        data: {
          kycStatus: 'approved',
          kycApprovedAt: new Date(),
        },
      });
      return { approved: true, percentage: completion.percentage };
    }

    return { approved: false, percentage: completion.percentage };
  }

  /** Admin approve. */
  async adminApprove(agentId: string) {
    const agent = await this.prisma.agent.findUnique({
      where: { id: agentId },
      select: { id: true, kycStatus: true },
    });

    if (!agent) {
      throw new NotFoundException('Agent not found');
    }
    if (agent.kycStatus === 'approved') {
      throw new BadRequestException('KYC already approved');
    }

    await this.prisma.agent.update({
      where: { id: agentId },
      data: {
        kycStatus: 'approved',
        kycApprovedAt: new Date(),
      },
    });

    return { success: true, status: 'approved', agentId };
  }
}
