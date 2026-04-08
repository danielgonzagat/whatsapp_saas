import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { StorageService } from '../common/storage/storage.service';
import * as bcrypt from 'bcrypt';
import { BCRYPT_ROUNDS } from '../common/constants';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateFiscalDto } from './dto/update-fiscal.dto';
import { UpdateBankDto } from './dto/update-bank.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

@Injectable()
export class KycService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly auditService: AuditService,
  ) {}

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

  async updateProfile(agentId: string, dto: UpdateProfileDto) {
    const data: any = { ...dto };
    if (dto.birthDate) data.birthDate = new Date(dto.birthDate);

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

  async uploadAvatar(agentId: string, file: any) {
    if (!file) throw new BadRequestException('No file provided');
    if (file.size > 5 * 1024 * 1024) throw new BadRequestException('File too large (max 5MB)');

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

  async uploadDocument(agentId: string, workspaceId: string, type: string, file: any) {
    const allowedTypes = [
      'DOCUMENT_FRONT',
      'DOCUMENT_BACK',
      'PROOF_OF_ADDRESS',
      'COMPANY_DOCUMENT',
    ];
    if (!allowedTypes.includes(type)) {
      throw new BadRequestException(`Invalid document type. Allowed: ${allowedTypes.join(', ')}`);
    }

    if (!file) throw new BadRequestException('No file provided');
    if (file.size > 10 * 1024 * 1024) throw new BadRequestException('File too large (max 10MB)');

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

  async deleteDocument(agentId: string, documentId: string) {
    const doc = await this.prisma.kycDocument.findUnique({
      where: { id: documentId },
    });
    if (!doc) throw new NotFoundException('Document not found');
    if (doc.agentId !== agentId) throw new BadRequestException('Not your document');
    if (doc.status !== 'pending')
      throw new BadRequestException(
        'Cannot delete a document that is already under review or approved',
      );

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

    if (!agent) throw new NotFoundException('Agent not found');
    if (agent.provider && !agent.password) {
      throw new BadRequestException('OAuth users cannot change password here');
    }

    const valid = await bcrypt.compare(dto.currentPassword, agent.password);
    if (!valid) throw new UnauthorizedException('Current password is incorrect');

    const hashedPassword = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);
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
          fiscal &&
          fiscal.type &&
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

  async submitKyc(agentId: string, workspaceId: string) {
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

  async adminApprove(agentId: string) {
    const agent = await this.prisma.agent.findUnique({
      where: { id: agentId },
      select: { id: true, kycStatus: true },
    });

    if (!agent) throw new NotFoundException('Agent not found');
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
