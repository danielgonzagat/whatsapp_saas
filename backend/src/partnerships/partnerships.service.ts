import { Injectable, Logger, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PartnershipsService {
  private readonly logger = new Logger(PartnershipsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  // ═══ COLLABORATORS ═══

  async listCollaborators(workspaceId: string) {
    const agents = await this.prisma.agent.findMany({
      where: { workspaceId },
      select: { id: true, name: true, email: true, role: true, displayRole: true, isOnline: true, avatarUrl: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
    const invites = await this.prisma.collaboratorInvite.findMany({
      where: { workspaceId, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
    });
    return { agents, invites };
  }

  async getCollaboratorStats(workspaceId: string) {
    const [totalAgents, onlineAgents, pendingInvites] = await Promise.all([
      this.prisma.agent.count({ where: { workspaceId } }),
      this.prisma.agent.count({ where: { workspaceId, isOnline: true } }),
      this.prisma.collaboratorInvite.count({ where: { workspaceId, status: 'PENDING' } }),
    ]);
    return { total: totalAgents, online: onlineAgents, pendingInvites };
  }

  async inviteCollaborator(workspaceId: string, email: string, role: string, invitedBy: string) {
    const existing = await this.prisma.agent.findFirst({ where: { email, workspaceId } });
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
    const agent = await this.prisma.agent.findFirst({ where: { id: agentId, workspaceId } });
    if (!agent) throw new NotFoundException('Colaborador não encontrado');
    if (agent.role === 'ADMIN') throw new ConflictException('Não é possível remover o admin');
    return this.prisma.agent.delete({ where: { id: agentId } });
  }

  // ═══ AFFILIATES & PRODUCERS ═══

  async listAffiliates(workspaceId: string, params?: { type?: string; status?: string; search?: string }) {
    const where: any = { workspaceId };
    if (params?.type && params.type !== 'todos') where.type = params.type;
    if (params?.status) where.status = params.status;
    if (params?.search) where.partnerName = { contains: params.search, mode: 'insensitive' };

    const affiliates = await this.prisma.affiliatePartner.findMany({
      where,
      orderBy: { totalRevenue: 'desc' },
    });
    return { affiliates };
  }

  async getAffiliateStats(workspaceId: string) {
    const partners = await this.prisma.affiliatePartner.findMany({ where: { workspaceId } });
    const activeAffiliates = partners.filter(p => p.type === 'AFFILIATE' && p.status === 'ACTIVE').length;
    const producers = partners.filter(p => p.type === 'PRODUCER').length;
    const totalRevenue = partners.filter(p => p.type === 'AFFILIATE').reduce((s, p) => s + p.totalRevenue, 0);
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
    const affiliate = await this.prisma.affiliatePartner.findFirst({ where: { id, workspaceId } });
    if (!affiliate) throw new NotFoundException('Parceiro não encontrado');
    return { affiliate };
  }

  async createAffiliate(workspaceId: string, data: {
    partnerName: string; partnerEmail: string; partnerPhone?: string;
    type: string; commissionRate?: number; productIds?: string[];
  }) {
    const code = `${data.partnerName.split(' ')[0].toLowerCase()}_${Math.random().toString(36).slice(2, 8)}`;
    const frontendUrl = this.configService.get('FRONTEND_URL', 'http://localhost:3000');
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
        affiliateLink: `${frontendUrl}/r/${code}`,
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
    const partner = await this.prisma.affiliatePartner.findFirst({ where: { id, workspaceId } });
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
      include: { messages: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });

    const contacts = await Promise.all(partners.map(async p => {
      const unread = await this.prisma.partnerMessage.count({
        where: { partnerId: p.id, senderType: 'PARTNER', readAt: null },
      });
      return {
        id: p.id,
        name: p.partnerName,
        email: p.partnerEmail,
        type: p.type,
        avatar: p.partnerName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase(),
        lastMessage: p.messages[0]?.content || null,
        lastMessageTime: p.messages[0]?.createdAt || null,
        unread,
        online: false,
      };
    }));

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
      where: { partnerId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    return { messages: messages.reverse() };
  }

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
