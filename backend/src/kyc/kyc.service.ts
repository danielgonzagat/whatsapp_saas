import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { compare as bcryptCompare, hash as bcryptHash } from 'bcrypt';
import { Prisma } from '@prisma/client';
import { AccountMfaService } from '../auth/account-mfa.service';
import { AuditService } from '../audit/audit.service';
import { BCRYPT_ROUNDS } from '../common/constants';
import { ConnectService } from '../payments/connect/connect.service';
import { StorageService } from '../common/storage/storage.service';
import { PrismaService } from '../prisma/prisma.service';
import { KycEventEmitterService } from '../kloel/kyc-emitter/kyc-event-emitter.service';
import { KycChangePasswordDto } from './dto/change-password.dto';
import { KycMfaCodeDto, KycMfaDisableDto } from './dto/mfa.dto';
import { UpdateBankDto } from './dto/update-bank.dto';
import { UpdateFiscalDto } from './dto/update-fiscal.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

import {
  trimToUndefined,
  digitsOnly,
  buildPersonName,
  buildDateOfBirth,
  buildConnectAddress,
} from './kyc.helpers';
import type { UploadedFile, SubmitKycContext } from './kyc.helpers';
export { trimToUndefined, digitsOnly, buildPersonName, buildDateOfBirth, buildConnectAddress };
export type { UploadedFile, SubmitKycContext };
import {
  doAdminApprove,
  doApproveIfConnectEnabled,
  isConnectKycApproved,
  syncSellerConnectOnboarding,
} from './kyc.connect-onboarding';
import {
  validateKycAvatarFile,
  validateKycDocumentFile,
  validateKycDocumentType,
  generateStorageFilename,
  extractExtension,
  deriveDisplayAccount,
  computeKycCompletion,
} from './kyc.service.helpers';
import {
  lookupCnpj as lookupCnpjProvider,
  lookupCep as lookupCepProvider,
  listBrazilianBanks as listBrazilianBanksProvider,
} from './kyc.lookup.helpers';

const PROFILE_SELECT = Prisma.validator<Prisma.AgentSelect>()({
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
});

/** Kyc service. */
@Injectable()
export class KycService {
  private readonly logger = new Logger(KycService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly auditService: AuditService,
    private readonly connectService: ConnectService,
    private readonly kycEventEmitter: KycEventEmitterService,
    private readonly accountMfaService: AccountMfaService,
  ) {}

  private get syncDeps() {
    return {
      prisma: this.prisma,
      connectService: this.connectService,
      buildConnectAddress,
    };
  }

  // ═══ PROFILE ═══

  async getProfile(agentId: string) {
    return this.prisma.agent.findUnique({
      where: { id: agentId, workspaceId: { not: '' } },
      select: PROFILE_SELECT,
    });
  }

  /** Update profile. */
  async updateProfile(agentId: string, dto: UpdateProfileDto) {
    const data: Prisma.AgentUpdateInput = { ...dto };
    if (dto.birthDate) {
      data.birthDate = new Date(dto.birthDate);
    }

    return this.prisma.$transaction(
      async (tx) => {
        const agent = await tx.agent.findUnique({
          where: { id: agentId, workspaceId: { not: '' } },
          select: { kycStatus: true, workspaceId: true },
        });
        if (!agent) {
          throw new Error('Agent not found');
        }
        if (agent.kycStatus === 'rejected') {
          data.kycStatus = 'pending';
          data.kycRejectedReason = null;
        }
        return tx.agent.update({
          where: { id: agentId, workspaceId: agent.workspaceId },
          data,
          select: PROFILE_SELECT,
        });
      },
      { isolationLevel: 'ReadCommitted' },
    );
  }

  /** Upload avatar. */
  async uploadAvatar(agentId: string, file: UploadedFile) {
    validateKycAvatarFile(file);
    const ext = extractExtension(file.originalname);
    const filename = generateStorageFilename('avatars', 'avatar', agentId, ext);
    const result = await this.storage.upload(file.buffer, { filename, mimeType: file.mimetype });
    await this.prisma.agent.update({
      where: { id: agentId, workspaceId: { not: '' } },
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

  async lookupCnpj(cnpj: string): Promise<unknown> {
    return lookupCnpjProvider(cnpj);
  }

  async lookupCep(cep: string): Promise<unknown> {
    return lookupCepProvider(cep);
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
        rejectedReason: true,
        reviewedAt: true,
        fileUrl: true,
        fileName: true,
        fileSize: true,
        mimeType: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  /** Upload document. */
  async uploadDocument(agentId: string, workspaceId: string, type: string, file: UploadedFile) {
    validateKycDocumentType(type);
    validateKycDocumentFile(file);
    const ext = extractExtension(file.originalname, 'pdf');
    const filename = generateStorageFilename('documents', `kyc_${type}`, agentId, ext);
    const result = await this.storage.upload(file.buffer, { filename, mimeType: file.mimetype });
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
  async deleteDocument(agentId: string, documentId: string, workspaceId?: string) {
    const doc = await this.prisma.kycDocument.findUnique({
      where: workspaceId ? { id: documentId, workspaceId } : { id: documentId },
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
    const deleted = await this.prisma.kycDocument.delete({
      where: { id: documentId, workspaceId: doc.workspaceId },
      select: { id: true },
    });
    return { success: deleted.id === documentId };
  }

  async listBrazilianBanks(): Promise<
    Array<{ code: number; name: string; fullName: string; ispb: string }>
  > {
    return listBrazilianBanksProvider();
  }

  // ═══ BANK ═══

  async getBankAccount(workspaceId: string) {
    const defaultAccount = await this.prisma.bankAccount.findFirst({
      where: { workspaceId, isDefault: true },
    });
    return (
      defaultAccount ??
      this.prisma.bankAccount.findFirst({ where: { workspaceId }, orderBy: { createdAt: 'desc' } })
    );
  }

  /** Update bank account. */
  async updateBankAccount(workspaceId: string, dto: UpdateBankDto) {
    const { displayAccount } = deriveDisplayAccount(dto);

    return this.prisma.$transaction(
      async (tx) => {
        const existing = await tx.bankAccount.findFirst({
          where: { workspaceId, isDefault: true },
        });
        if (existing) {
          return tx.bankAccount.update({
            where: { id: existing.id, workspaceId },
            data: { ...dto, displayAccount },
          });
        }
        return tx.bankAccount.create({
          data: { workspaceId, ...dto, isDefault: true, displayAccount },
        });
      },
      { isolationLevel: 'ReadCommitted' },
    );
  }

  // ═══ SECURITY ═══

  async changePassword(agentId: string, dto: KycChangePasswordDto) {
    return this.prisma.$transaction(
      async (tx) => {
        const agent = await tx.agent.findUnique({
          where: { id: agentId, workspaceId: { not: '' } },
          select: { password: true, provider: true, workspaceId: true },
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
        const updated = await tx.agent.update({
          where: { id: agentId, workspaceId: agent.workspaceId },
          data: { password: hashedPassword },
          select: { id: true },
        });
        return { success: updated.id === agentId };
      },
      { isolationLevel: 'ReadCommitted' },
    );
  }

  async getSecurity(agentId: string) {
    const agent = await this.prisma.agent.findUnique({
      where: { id: agentId, workspaceId: { not: '' } },
      select: { mfaEnabled: true, mfaPendingSetup: true },
    });
    if (!agent) {
      throw new NotFoundException('Agent not found');
    }
    return {
      mfa: {
        enabled: agent.mfaEnabled,
        pendingSetup: agent.mfaPendingSetup,
      },
      sessions: await this.listSecuritySessions(agentId),
    };
  }

  async listSecuritySessions(agentId: string) {
    const rows = await this.prisma.refreshToken.findMany({
      where: { agentId, revoked: false, expiresAt: { gt: new Date() } },
      select: { id: true, createdAt: true, expiresAt: true },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((session) => ({
      id: session.id,
      createdAt: session.createdAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
    }));
  }

  async revokeSecuritySession(agentId: string, sessionId: string) {
    const result = await this.prisma.refreshToken.updateMany({
      where: { id: sessionId, agentId, revoked: false },
      data: { revoked: true },
    });
    if (result.count === 0) {
      throw new NotFoundException('Security session not found');
    }
    return { success: result.count === 1 };
  }

  async startMfaSetup(agentId: string) {
    return this.prisma.$transaction(async (tx) => {
      const agent = await tx.agent.findUnique({
        where: { id: agentId, workspaceId: { not: '' } },
        select: {
          id: true,
          email: true,
          workspaceId: true,
          mfaSecret: true,
          mfaEnabled: true,
          mfaPendingSetup: true,
        },
      });
      if (!agent) {
        throw new NotFoundException('Agent not found');
      }
      if (agent.mfaEnabled && !agent.mfaPendingSetup) {
        throw new BadRequestException('2FA ja esta ativo nesta conta.');
      }

      const setup =
        agent.mfaSecret && agent.mfaPendingSetup && !agent.mfaEnabled
          ? await this.accountMfaService.resumeSetup(agent.email, agent.mfaSecret)
          : await this.accountMfaService.createSetup(agent.email);

      if (!agent.mfaSecret || !agent.mfaPendingSetup || agent.mfaEnabled) {
        await tx.agent.update({
          where: { id: agent.id, workspaceId: agent.workspaceId },
          data: {
            mfaSecret: setup.encryptedSecret,
            mfaEnabled: false,
            mfaPendingSetup: true,
          },
        });
      }

      return {
        mfa: { enabled: false, pendingSetup: true },
        qrDataUrl: setup.qrDataUrl,
        otpauthUrl: setup.otpauthUrl,
      };
    });
  }

  async verifyMfaSetup(agentId: string, dto: KycMfaCodeDto) {
    return this.prisma.$transaction(async (tx) => {
      const agent = await tx.agent.findUnique({
        where: { id: agentId, workspaceId: { not: '' } },
        select: { id: true, workspaceId: true, mfaSecret: true, mfaPendingSetup: true },
      });
      if (!agent) {
        throw new NotFoundException('Agent not found');
      }
      if (!agent.mfaSecret || !agent.mfaPendingSetup) {
        throw new BadRequestException('Inicie a configuracao 2FA antes de confirmar.');
      }
      this.accountMfaService.verifyCode(agent.mfaSecret, dto.code);
      await tx.agent.update({
        where: { id: agent.id, workspaceId: agent.workspaceId },
        data: { mfaEnabled: true, mfaPendingSetup: false },
      });
      return { mfa: { enabled: true, pendingSetup: false } };
    });
  }

  async disableMfa(agentId: string, dto: KycMfaDisableDto) {
    return this.prisma.$transaction(async (tx) => {
      const agent = await tx.agent.findUnique({
        where: { id: agentId, workspaceId: { not: '' } },
        select: {
          id: true,
          workspaceId: true,
          mfaSecret: true,
          mfaEnabled: true,
          mfaPendingSetup: true,
        },
      });
      if (!agent) {
        throw new NotFoundException('Agent not found');
      }
      if (agent.mfaEnabled) {
        if (!dto.code) {
          throw new BadRequestException('Informe o codigo 2FA para desativar.');
        }
        this.accountMfaService.verifyCode(agent.mfaSecret, dto.code);
      }
      await tx.agent.update({
        where: { id: agent.id, workspaceId: agent.workspaceId },
        data: { mfaSecret: null, mfaEnabled: false, mfaPendingSetup: false },
      });
      return { mfa: { enabled: false, pendingSetup: false } };
    });
  }
  // ═══ KYC STATUS & COMPLETION ═══

  async getStatus(agentId: string) {
    return this.prisma.agent.findUnique({
      where: { id: agentId, workspaceId: { not: '' } },
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
        where: { id: agentId, workspaceId },
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
    return computeKycCompletion(agent, fiscal, documentTypes, !!bankAccount);
  }

  /** Submit kyc. */
  async submitKyc(agentId: string, workspaceId: string, context?: SubmitKycContext) {
    const completion = await this.getCompletion(agentId, workspaceId);
    if (completion.percentage < 100) {
      throw new BadRequestException('Complete all required sections before submitting');
    }

    await this.prisma.$transaction(
      async (tx) => {
        const agent = await tx.agent.findUnique({
          where: { id: agentId, workspaceId },
          select: { kycStatus: true },
        });
        if (agent?.kycStatus === 'submitted') {
          throw new BadRequestException('KYC already submitted and under review');
        }
        if (agent?.kycStatus === 'approved') {
          throw new BadRequestException('KYC already approved');
        }

        await tx.agent.update({
          where: { id: agentId, workspaceId },
          data: { kycStatus: 'submitted', kycSubmittedAt: new Date() },
        });
      },
      { isolationLevel: 'ReadCommitted' },
    );

    this.logger.log('Calling Stripe Connect', {
      context: 'KycService.submitKyc',
      action: 'syncSellerConnectOnboarding',
    });
    const onboardingStatus = await syncSellerConnectOnboarding(
      this.syncDeps,
      agentId,
      workspaceId,
      context,
    );

    this.kycEventEmitter.emitDocumentSubmitted({
      agentId,
      workspaceId,
    });

    // Approval is gated SOLELY by the Stripe Connect account being fully enabled
    // (charges + payouts, no requirements due). Self-reported form completion is
    // never sufficient — submitting only moves the agent to 'submitted'/'pending'
    // review, and Stripe (via the account.updated webhook or this status check)
    // is what flips it to 'approved'.
    if (isConnectKycApproved(onboardingStatus)) {
      await this.prisma.agent.update({
        where: { id: agentId, workspaceId },
        data: { kycStatus: 'approved', kycApprovedAt: new Date() },
      });
      this.kycEventEmitter.emitApproved({
        agentId,
        workspaceId,
        autoApproved: true,
      });
      return {
        success: true,
        status: 'approved',
        autoApproved: true,
      };
    }
    return { success: true, status: 'submitted' };
  }

  /**
   * Re-checks a seller's live Stripe Connect onboarding status and promotes their
   * KYC to 'approved' only when the account is fully enabled. Used by the
   * auto-check endpoint and after webhook-driven account.updated events. NEVER
   * approves based on self-reported form completion.
   */
  async autoApproveIfComplete(agentId: string, workspaceId: string) {
    return doApproveIfConnectEnabled(
      { prisma: this.prisma, connectService: this.connectService },
      agentId,
      workspaceId,
    );
  }

  async adminApprove(agentId: string) {
    const agent = await this.prisma.agent.findUnique({
      where: { id: agentId },
      select: { workspaceId: true },
    });
    const result = await doAdminApprove({ prisma: this.prisma }, agentId);
    this.kycEventEmitter.emitApproved({
      agentId,
      workspaceId: agent?.workspaceId ?? '',
      autoApproved: false,
    });
    return result;
  }
}
