import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditService } from '../audit/audit.service';
import { EmailService } from '../auth/email.service';
import { generateUniquePublicCheckoutCode } from '../checkout/checkout-code.util';
import { buildPayCheckoutUrl } from '../checkout/checkout-public-url.util';
import { isPublicCodeTaken } from './partnerships.helpers';
import { getChatContacts, getMessages, sendMessage, markAsRead } from './partnerships.chat.helpers';
import { generateOpaqueToken, hashOpaqueToken } from './partnerships.crypto.helpers';
import {
  INVITABLE_PARTNER_TYPES,
  buildPartnerInviteUrl,
  getPartnerRoleLabel,
} from './partnerships.invite.helpers';
import {
  ATTRIBUTED_ORDER_STATUSES,
  DEFAULT_PARTNER_COMMISSION_RATE,
  aggregateMonthlyPerformance,
  buildAttributedOrderFilters,
  buildListAffiliatesWhere,
  computeAffiliateStats,
  extractLastSaleAt,
  getCurrentYearStartUtc,
  normalizeCreatePartnerInput,
} from './partnerships.service.helpers';
import { PrismaService } from '../prisma/prisma.service';

// cache.invalidate — partnerships data fetched live from Prisma; no Redis cache to invalidate
@Injectable()
export class PartnershipsService {
  private readonly logger = new Logger(PartnershipsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
  ) {}

  private async isPublicCodeTaken(code: string) {
    return isPublicCodeTaken(this.prisma, code);
  }

  private async generateAffiliateCode() {
    return generateUniquePublicCheckoutCode((candidate) => this.isPublicCodeTaken(candidate));
  }

  // ═══ COLLABORATORS ═══

  async listCollaborators(workspaceId: string) {
    const agents = await this.prisma.agent.findMany({
      where: { workspaceId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        displayRole: true,
        isOnline: true,
        avatarUrl: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });
    const invites = await this.prisma.collaboratorInvite.findMany({
      where: { workspaceId, status: 'PENDING' },
      select: {
        id: true,
        workspaceId: true,
        email: true,
        role: true,
        status: true,
        invitedBy: true,
        token: true,
        expiresAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return { agents, invites };
  }

  /** Get collaborator stats. */
  async getCollaboratorStats(workspaceId: string) {
    const [totalAgents, onlineAgents, pendingInvites] = await Promise.all([
      this.prisma.agent.count({ where: { workspaceId } }),
      this.prisma.agent.count({ where: { workspaceId, isOnline: true } }),
      this.prisma.collaboratorInvite.count({
        where: { workspaceId, status: 'PENDING' },
      }),
    ]);
    return { total: totalAgents, online: onlineAgents, pendingInvites };
  }

  /** Invite collaborator. */
  async inviteCollaborator(workspaceId: string, email: string, role: string, invitedBy: string) {
    const existing = await this.prisma.agent.findFirst({
      where: { email, workspaceId },
    });
    if (existing) {
      throw new ConflictException('Colaborador já existe neste workspace');
    }

    const existingInvite = await this.prisma.collaboratorInvite.findFirst({
      where: { email, workspaceId, status: 'PENDING' },
    });
    if (existingInvite) {
      throw new ConflictException('Convite já enviado para este email');
    }

    const invite = await this.prisma.collaboratorInvite.create({
      data: {
        workspaceId,
        email,
        role,
        invitedBy,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
    this.logger.log(`Invite sent to ${email} for workspace ${workspaceId}`);
    return invite;
  }

  /** Revoke invite. */
  async revokeInvite(id: string, workspaceId: string) {
    return this.prisma.collaboratorInvite.updateMany({
      where: { id, workspaceId, status: 'PENDING' },
      data: { status: 'REVOKED' },
    });
  }

  /** Update collaborator role. */
  async updateCollaboratorRole(agentId: string, workspaceId: string, role: string) {
    return this.prisma.agent.updateMany({
      where: { id: agentId, workspaceId },
      data: { displayRole: role },
    });
  }

  /** Remove collaborator. */
  async removeCollaborator(agentId: string, workspaceId: string) {
    const agent = await this.prisma.agent.findFirst({
      where: { id: agentId, workspaceId },
    });
    if (!agent) {
      throw new NotFoundException('Colaborador não encontrado');
    }
    if (agent.role === 'ADMIN') {
      throw new ConflictException('Não é possível remover o admin');
    }
    await this.auditService.log({
      workspaceId,
      action: 'DELETE_RECORD',
      resource: 'Agent',
      resourceId: agentId,
      details: { deletedBy: 'user', email: agent.email },
    });
    await this.prisma.agent.deleteMany({ where: { id: agentId, workspaceId } });
    return agent;
  }

  // ═══ AFFILIATES & PRODUCERS ═══

  async listAffiliates(
    workspaceId: string,
    params?: { type?: string; status?: string; search?: string },
  ) {
    const where = buildListAffiliatesWhere(workspaceId, params);

    const affiliates = await this.prisma.affiliatePartner.findMany({
      where,
      select: {
        id: true,
        workspaceId: true,
        partnerName: true,
        partnerEmail: true,
        type: true,
        status: true,
        totalSales: true,
        totalRevenue: true,
        totalCommission: true,
        commissionRate: true,
        temperature: true,
        productIds: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { totalRevenue: 'desc' },
      take: 200,
    });
    return { affiliates };
  }

  /** Get affiliate stats. */
  async getAffiliateStats(workspaceId: string) {
    const partners = await this.prisma.affiliatePartner.findMany({
      where: { workspaceId },
      select: {
        type: true,
        status: true,
        totalRevenue: true,
        totalCommission: true,
        partnerName: true,
      },
      take: 1000,
    });
    return computeAffiliateStats(partners);
  }

  /** Get affiliate detail. */
  async getAffiliateDetail(id: string, workspaceId: string) {
    const affiliate = await this.prisma.affiliatePartner.findFirst({
      where: { id, workspaceId },
    });
    if (!affiliate) {
      throw new NotFoundException('Parceiro não encontrado');
    }
    return { affiliate };
  }

  /** Create partner. */
  async createPartner(
    workspaceId: string,
    data: {
      partnerName: string;
      partnerEmail: string;
      partnerPhone?: string;
      type: string;
      commissionRate?: number;
      productIds?: string[];
    },
  ) {
    const code = await this.generateAffiliateCode();
    const { partnerName, partnerEmail, partnerType } = normalizeCreatePartnerInput(data);
    const existingPartner = await this.prisma.affiliatePartner.findFirst({
      where: { workspaceId, partnerEmail },
    });

    if (existingPartner) {
      if (existingPartner.type !== partnerType) {
        throw new ConflictException(
          'Ja existe um parceiro com este email vinculado a outro papel neste workspace.',
        );
      }
      return existingPartner;
    }

    const requiresInvite = INVITABLE_PARTNER_TYPES.has(partnerType);
    const inviteToken = requiresInvite ? generateOpaqueToken() : null;
    const inviteTokenHash = inviteToken ? hashOpaqueToken(inviteToken) : null;
    const workspace = requiresInvite
      ? await this.prisma.workspace.findUnique({
          where: { id: workspaceId },
          select: { name: true },
        })
      : null;

    const partner = await this.prisma.affiliatePartner.create({
      data: {
        workspaceId,
        partnerName,
        partnerEmail,
        ...(data.partnerPhone !== undefined ? { partnerPhone: data.partnerPhone } : {}),
        type: partnerType,
        commissionRate: data.commissionRate || DEFAULT_PARTNER_COMMISSION_RATE,
        status: requiresInvite ? 'PENDING' : 'ACTIVE',
        affiliateCode: code,
        affiliateLink: buildPayCheckoutUrl(undefined, code),
        productIds: data.productIds || [],
        ...(inviteTokenHash !== null
          ? {
              metadata: {
                inviteTokenHash,
                inviteSentAt: new Date().toISOString(),
              },
            }
          : {}),
        approvedAt: requiresInvite ? null : new Date(),
      },
    });

    if (!requiresInvite || !inviteToken) {
      return partner;
    }

    const inviteUrl = buildPartnerInviteUrl({
      inviteToken,
      partnerEmail: partner.partnerEmail,
      partnerName: partner.partnerName,
      workspaceName: workspace?.name || 'Kloel',
      frontendUrl: this.configService.get<string>('FRONTEND_URL') || undefined,
    });
    const delivered = await this.emailService.sendPartnerInviteEmail(
      partner.partnerEmail,
      partner.partnerName,
      workspace?.name || 'Kloel',
      inviteUrl,
      getPartnerRoleLabel(partnerType),
    );

    if (!delivered) {
      try {
        await this.prisma.affiliatePartner.deleteMany({
          where: { id: partner.id, workspaceId },
        });
      } catch {
        // Best-effort rollback when invite delivery fails after persistence.
      }
      throw new ServiceUnavailableException(
        'Nao foi possivel enviar o convite do afiliado agora. Tente novamente em instantes.',
      );
    }

    return partner;
  }

  /** Create affiliate. */
  async createAffiliate(
    workspaceId: string,
    data: {
      partnerName: string;
      partnerEmail: string;
      partnerPhone?: string;
      type: string;
      commissionRate?: number;
      productIds?: string[];
    },
  ) {
    return this.createPartner(workspaceId, data);
  }

  /** Approve affiliate. */
  async approveAffiliate(id: string, workspaceId: string) {
    return this.prisma.affiliatePartner.updateMany({
      where: { id, workspaceId, status: 'PENDING' },
      data: { status: 'ACTIVE', approvedAt: new Date() },
    });
  }

  /** Revoke affiliate. */
  async revokeAffiliate(id: string, workspaceId: string) {
    return this.prisma.affiliatePartner.updateMany({
      where: { id, workspaceId },
      data: { status: 'REVOKED' },
    });
  }

  /** Get affiliate performance. */
  async getAffiliatePerformance(id: string, workspaceId: string) {
    const partner = await this.prisma.affiliatePartner.findFirst({
      where: { id, workspaceId },
    });
    if (!partner) {
      throw new NotFoundException('Parceiro não encontrado');
    }

    const attributedOrderFilters = buildAttributedOrderFilters(partner);

    let monthlyPerformance = new Array<number>(12).fill(0);
    let lastSaleAt: string | undefined;

    if (attributedOrderFilters.length > 0) {
      const currentYearStart = getCurrentYearStartUtc();
      const validStatuses = [...ATTRIBUTED_ORDER_STATUSES];
      const [orders, latestOrder] = await Promise.all([
        this.prisma.checkoutOrder.findMany({
          where: {
            workspaceId,
            status: { in: validStatuses },
            createdAt: { gte: currentYearStart },
            OR: attributedOrderFilters,
          },
          select: {
            createdAt: true,
            paidAt: true,
          },
          take: 5000,
        }),
        this.prisma.checkoutOrder.findFirst({
          where: {
            workspaceId,
            status: { in: validStatuses },
            OR: attributedOrderFilters,
          },
          select: {
            createdAt: true,
            paidAt: true,
          },
          orderBy: { createdAt: 'desc' },
        }),
      ]);

      monthlyPerformance = aggregateMonthlyPerformance(orders);
      lastSaleAt = extractLastSaleAt(latestOrder);
    }

    return {
      totalSales: partner.totalSales,
      totalRevenue: partner.totalRevenue,
      commission: partner.commissionRate,
      monthlyPerformance,
      lastSaleAt,
    };
  }

  // ═══ CHAT ═══

  async getChatContacts(workspaceId: string) {
    return getChatContacts(this.prisma, workspaceId);
  }

  /** Get messages. */
  async getMessages(partnerId: string, cursor?: string) {
    return getMessages(this.prisma, partnerId, cursor);
  }

  // messageLimit: partner chat is internal DB-only, not WhatsApp; no rate limit applies
  /**
   * @canonical-status delegate — Wave 22 canonicalization
   * @canonical-path backend/src/partnerships/partnerships.chat.helpers.ts::sendMessage
   * @notes Intentional service-layer delegate to keep DI clean; the leaf writes
   *        to the partnerMessage table (DB-only, no external dispatch).
   */
  async sendMessage(partnerId: string, content: string, senderId: string, senderName: string) {
    return sendMessage(this.prisma, partnerId, content, senderId, senderName);
  }

  /** Mark as read. */
  async markAsRead(partnerId: string) {
    return markAsRead(this.prisma, partnerId);
  }
}
