import {
  BadRequestException,
  Injectable,
  Logger,
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
import { KycEventEmitterService } from '../kloel/kyc-emitter/kyc-event-emitter.service';
import { KycChangePasswordDto } from './dto/change-password.dto';
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
  doAutoApproveIfComplete,
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
        return tx.agent.update({ where: { id: agentId, workspaceId: agent.workspaceId }, data });
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
    await this.prisma.kycDocument.delete({
      where: { id: documentId, workspaceId: doc.workspaceId },
    });
    return { success: true };
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
        await tx.agent.update({
          where: { id: agentId, workspaceId: agent.workspaceId },
          data: { password: hashedPassword },
        });
        return { success: true };
      },
      { isolationLevel: 'ReadCommitted' },
    );
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
    await syncSellerConnectOnboarding(this.syncDeps, agentId, workspaceId, context);

    this.kycEventEmitter.emitDocumentSubmitted({
      agentId,
      workspaceId,
    });

    const autoResult = await this.autoApproveIfComplete(agentId, workspaceId);
    if (autoResult.approved) {
      this.kycEventEmitter.emitApproved({
        agentId,
        workspaceId,
        autoApproved: true,
      });
      return {
        success: true,
        status: 'approved',
        autoApproved: true,
        percentage: autoResult.percentage,
      };
    }
    return { success: true, status: 'submitted' };
  }

  async autoApproveIfComplete(agentId: string, workspaceId: string) {
    return doAutoApproveIfComplete(
      { prisma: this.prisma },
      (a, w) => this.getCompletion(a, w),
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
