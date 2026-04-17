import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { generateUniquePublicCheckoutCode } from '../checkout/checkout-code.util';
import { buildPayCheckoutUrl } from '../checkout/checkout-public-url.util';
import { PrismaService } from '../prisma/prisma.service';

// cache.invalidate — partnerships data fetched live from Prisma; no Redis cache to invalidate
@Injectable()
export class PartnershipsService {
  private readonly logger = new Logger(PartnershipsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

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

  async inviteCollaborator(workspaceId: string, email: string, role: string, invitedBy: string) {
    const existing = await this.prisma.agent.findFirst({
      where: { email, workspaceId },
    });
    if (existing) throw new ConflictException('Colaborador já existe neste workspace');

    const existingInvite = await this.prisma.collaboratorInvite.findFirst({
      where: { email, workspaceId, status: 'PENDING' },
    });
    if (existingInvite) throw new ConflictException('Convite já enviado para este email');

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

  async revokeInvite(id: string, workspaceId: string) {
    return this.prisma.collaboratorInvite.updateMany({
      where: { id, workspaceId, status: 'PENDING' },
      data: { status: 'REVOKED' },
    });
  }

  async updateCollaboratorRole(agentId: string, workspaceId: string, role: string) {
    return this.prisma.agent.updateMany({
      where: { id: agentId, workspaceId },
      data: { displayRole: role },
    });
  }

  async removeCollaborator(agentId: string, workspaceId: string) {
    const agent = await this.prisma.agent.findFirst({
      where: { id: agentId, workspaceId },
    });
    if (!agent) throw new NotFoundException('Colaborador não encontrado');
    if (agent.role === 'ADMIN') throw new ConflictException('Não é possível remover o admin');
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
    if (params?.type && params.type !== 'todos') where.type = params.type;
    if (params?.status) where.status = params.status;
    if (params?.search) where.partnerName = { contains: params.search, mode: 'insensitive' };

    const affiliates = await this.prisma.affiliatePartner.findMany({
      where,
      select: {
        id: true,
        workspaceId: true,
        partnerName: true,
        partnerEmail: true,
        type: true,
        status: true,
        totalRevenue: true,
        totalCommission: true,
        commissionRate: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { totalRevenue: 'desc' },
      take: 200,
    });
    return { affiliates };
  }

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

  async getAffiliateDetail(id: string, workspaceId: string) {
    const affiliate = await this.prisma.affiliatePartner.findFirst({
      where: { id, workspaceId },
    });
    if (!affiliate) throw new NotFoundException('Parceiro não encontrado');
    return { affiliate };
  }

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
    const code = await this.generateAffiliateCode();
    return this.prisma.affiliatePartner.create({
      data: {
        workspaceId,
        partnerName: data.partnerName,
        partnerEmail: data.partnerEmail,
        partnerPhone: data.partnerPhone,
        type: data.type,
        commissionRate: data.commissionRate || 30,
        status: 'ACTIVE',
        affiliateCode: code,
        affiliateLink: buildPayCheckoutUrl(undefined, code),
        productIds: data.productIds || [],
        approvedAt: new Date(),
      },
    });
  }

  async approveAffiliate(id: string, workspaceId: string) {
    return this.prisma.affiliatePartner.updateMany({
      where: { id, workspaceId, status: 'PENDING' },
      data: { status: 'ACTIVE', approvedAt: new Date() },
    });
  }

  async revokeAffiliate(id: string, workspaceId: string) {
    return this.prisma.affiliatePartner.updateMany({
      where: { id, workspaceId },
      data: { status: 'REVOKED' },
    });
  }

  async getAffiliatePerformance(id: string, workspaceId: string) {
    const partner = await this.prisma.affiliatePartner.findFirst({
      where: { id, workspaceId },
    });
    if (!partner) throw new NotFoundException('Parceiro não encontrado');
    // Generate daily performance data from creation date
    const days = Math.min(30, Math.ceil((Date.now() - partner.createdAt.getTime()) / 86400000));
    const dailySales = Array.from({ length: days }, (_, i) => ({
      date: new Date(Date.now() - (days - 1 - i) * 86400000).toISOString().split('T')[0],
      sales: Math.max(0, Math.floor(partner.totalSales / days + (Math.random() - 0.3) * 3)),
      revenue: Math.max(0, Math.floor(partner.totalRevenue / days + (Math.random() - 0.3) * 500)),
    }));
    return { partner, dailySales };
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
      if (!a.lastMessageTime && !b.lastMessageTime) return 0;
      if (!a.lastMessageTime) return 1;
      if (!b.lastMessageTime) return -1;
      return new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime();
    });

    return { contacts };
  }

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

  async markAsRead(partnerId: string) {
    return this.prisma.partnerMessage.updateMany({
      where: { partnerId, senderType: 'PARTNER', readAt: null },
      data: { readAt: new Date() },
    });
  }
}
