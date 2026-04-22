import { createHash, randomBytes } from 'node:crypto';
import { OrderStatus } from '@prisma/client';
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
import { PrismaService } from '../prisma/prisma.service';

const INVITABLE_PARTNER_TYPES = new Set(['AFFILIATE', 'SUPPLIER', 'COPRODUCER', 'MANAGER']);
const PARTNER_ROLE_LABELS: Record<string, string> = {
  AFFILIATE: 'afiliado',
  SUPPLIER: 'fornecedor',
  COPRODUCER: 'coprodutor',
  MANAGER: 'gerente',
  PRODUCER: 'produtor',
};

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

  private generateOpaqueToken(size = 32) {
    return randomBytes(size).toString('base64url');
  }

  private hashOpaqueToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private buildPartnerInviteUrl(params: {
    inviteToken: string;
    partnerEmail: string;
    partnerName: string;
    workspaceName: string;
  }) {
    const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';
    const url = new URL('/register', frontendUrl);
    url.searchParams.set('affiliateInviteToken', params.inviteToken);
    url.searchParams.set('email', params.partnerEmail);
    url.searchParams.set('partnerName', params.partnerName);
    url.searchParams.set('inviterWorkspaceName', params.workspaceName);
    return url.toString();
  }

  private getPartnerRoleLabel(type: string) {
    return PARTNER_ROLE_LABELS[type] || 'parceiro';
  }

  private async isPublicCodeTaken(code: string) {
    const [plan, checkoutLink, affiliateLink] = await Promise.all([
      this.prisma.checkoutProductPlan.findFirst({
        where: { referenceCode: code },
        select: { id: true },
      }),
      this.prisma.checkoutPlanLink.findFirst({
        where: { referenceCode: code },
        select: { id: true },
      }),
      this.prisma.affiliateLink.findFirst({
        where: { code },
        select: { id: true },
      }),
    ]);

    return Boolean(plan || checkoutLink || affiliateLink);
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
    return this.prisma.agent.delete({ where: { id: agentId } });
  }

  // ═══ AFFILIATES & PRODUCERS ═══

  async listAffiliates(
    workspaceId: string,
    params?: { type?: string; status?: string; search?: string },
  ) {
    const where: Record<string, unknown> = { workspaceId };
    if (params?.type && params.type !== 'todos') {
      where.type = params.type.trim().toUpperCase();
    }
    if (params?.status) {
      where.status = params.status.trim().toUpperCase();
    }
    if (params?.search) {
      where.partnerName = { contains: params.search, mode: 'insensitive' };
    }

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
    const activeAffiliates = partners.filter(
      (p) => p.type === 'AFFILIATE' && p.status === 'ACTIVE',
    ).length;
    const producers = partners.filter((p) => p.type === 'PRODUCER').length;
    const totalRevenue = partners
      .filter((p) => p.type === 'AFFILIATE')
      .reduce((s, p) => s + p.totalRevenue, 0);
    const totalCommissions = partners.reduce((s, p) => s + p.totalCommission, 0);
    const top = [...partners].sort((a, b) => b.totalRevenue - a.totalRevenue)[0];
    return {
      activeAffiliates,
      producers,
      totalRevenue,
      totalCommissions,
      topPartner: top ? { name: top.partnerName, revenue: top.totalRevenue } : null,
    };
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
    const partnerName = String(data.partnerName || '').trim();
    const partnerEmail = String(data.partnerEmail || '')
      .trim()
      .toLowerCase();
    const partnerType = String(data.type || '')
      .trim()
      .toUpperCase();
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
    const inviteToken = requiresInvite ? this.generateOpaqueToken() : null;
    const inviteTokenHash = inviteToken ? this.hashOpaqueToken(inviteToken) : null;
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
        partnerPhone: data.partnerPhone,
        type: partnerType,
        commissionRate: data.commissionRate || 30,
        status: requiresInvite ? 'PENDING' : 'ACTIVE',
        affiliateCode: code,
        affiliateLink: buildPayCheckoutUrl(undefined, code),
        productIds: data.productIds || [],
        metadata: inviteTokenHash
          ? {
              inviteTokenHash,
              inviteSentAt: new Date().toISOString(),
            }
          : undefined,
        approvedAt: requiresInvite ? null : new Date(),
      },
    });

    if (!requiresInvite || !inviteToken) {
      return partner;
    }

    const inviteUrl = this.buildPartnerInviteUrl({
      inviteToken,
      partnerEmail: partner.partnerEmail,
      partnerName: partner.partnerName,
      workspaceName: workspace?.name || 'Kloel',
    });
    const delivered = await this.emailService.sendPartnerInviteEmail(
      partner.partnerEmail,
      partner.partnerName,
      workspace?.name || 'Kloel',
      inviteUrl,
      this.getPartnerRoleLabel(partnerType),
    );

    if (!delivered) {
      try {
        await this.prisma.affiliatePartner.delete({ where: { id: partner.id } });
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

    const attributedOrderFilters: Record<string, unknown>[] = [];
    if (partner.affiliateCode) {
      attributedOrderFilters.push({
        metadata: { path: ['affiliateCode'], equals: partner.affiliateCode },
      });
    }
    if (partner.partnerWorkspaceId) {
      attributedOrderFilters.push({ affiliateId: partner.partnerWorkspaceId });
      attributedOrderFilters.push({
        metadata: { path: ['affiliateWorkspaceId'], equals: partner.partnerWorkspaceId },
      });
    }

    const monthlyPerformance = new Array<number>(12).fill(0);
    let lastSaleAt: string | undefined;

    if (attributedOrderFilters.length > 0) {
      const currentYear = new Date().getUTCFullYear();
      const currentYearStart = new Date(Date.UTC(currentYear, 0, 1));
      const validStatuses = [OrderStatus.PAID, OrderStatus.SHIPPED, OrderStatus.DELIVERED];
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

      for (const order of orders) {
        const saleDate = order.paidAt ?? order.createdAt;
        monthlyPerformance[saleDate.getUTCMonth()] += 1;
      }

      if (latestOrder) {
        lastSaleAt = (latestOrder.paidAt ?? latestOrder.createdAt).toISOString();
      }
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
    const partners = await this.prisma.affiliatePartner.findMany({
      where: { workspaceId, status: 'ACTIVE' },
      select: { id: true, partnerName: true, partnerEmail: true, type: true },
      take: 100,
    });

    const partnerIds = partners.map((p) => p.id);

    // Batch: count unread per partner
    const unreadCounts = await this.prisma.partnerMessage.groupBy({
      by: ['partnerId'],
      where: {
        partnerId: { in: partnerIds },
        senderType: 'PARTNER',
        readAt: null,
      },
      _count: { id: true },
    });
    const unreadByPartnerId = new Map(unreadCounts.map((r) => [r.partnerId, r._count.id]));

    // Batch: last message per partner
    const lastMessages = await this.prisma.partnerMessage.findMany({
      where: { partnerId: { in: partnerIds } },
      select: { partnerId: true, content: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: partnerIds.length * 2,
    });
    const lastMessageByPartnerId = new Map<
      string,
      { content: string | null; createdAt: Date | null }
    >();
    for (const msg of lastMessages) {
      if (!lastMessageByPartnerId.has(msg.partnerId)) {
        lastMessageByPartnerId.set(msg.partnerId, {
          content: msg.content,
          createdAt: msg.createdAt,
        });
      }
    }

    const contacts = partners.map((p) => {
      const lastMsg = lastMessageByPartnerId.get(p.id);
      return {
        id: p.id,
        name: p.partnerName,
        email: p.partnerEmail,
        type: p.type,
        avatar: p.partnerName
          .split(' ')
          .map((n) => n[0])
          .join('')
          .slice(0, 2)
          .toUpperCase(),
        lastMessage: lastMsg?.content || null,
        lastMessageTime: lastMsg?.createdAt || null,
        unread: unreadByPartnerId.get(p.id) || 0,
        online: false,
      };
    });

    contacts.sort((a, b) => {
      if (!a.lastMessageTime && !b.lastMessageTime) {
        return 0;
      }
      if (!a.lastMessageTime) {
        return 1;
      }
      if (!b.lastMessageTime) {
        return -1;
      }
      return new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime();
    });

    return { contacts };
  }

  /** Get messages. */
  async getMessages(partnerId: string, cursor?: string) {
    const messages = await this.prisma.partnerMessage.findMany({
      take: 50,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      where: { partnerId },
      select: {
        id: true,
        partnerId: true,
        senderId: true,
        senderName: true,
        senderType: true,
        content: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return { messages: messages.reverse() };
  }

  // messageLimit: partner chat is internal DB-only, not WhatsApp; no rate limit applies
  async sendMessage(partnerId: string, content: string, senderId: string, senderName: string) {
    return this.prisma.partnerMessage.create({
      data: { partnerId, senderId, senderType: 'OWNER', senderName, content },
    });
  }

  /** Mark as read. */
  async markAsRead(partnerId: string) {
    return this.prisma.partnerMessage.updateMany({
      where: { partnerId, senderType: 'PARTNER', readAt: null },
      data: { readAt: new Date() },
    });
  }
}
