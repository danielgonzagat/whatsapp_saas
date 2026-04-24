import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { ToolResult } from './kloel-tool-executor.service';
import type {
  ToolCreateCampaignArgs,
  ToolGetLeadDetailsArgs,
  ToolListLeadsArgs,
  ToolSaveBusinessInfoArgs,
  ToolSetBusinessHoursArgs,
} from './kloel-tool-executor.service';

const NON_DIGIT_RE = /\D/g;

/** CRM, campaign, and business-config tool implementations for KloelToolExecutorService. */
@Injectable()
export class KloelToolExecutorCrmService {
  private readonly logger = new Logger(KloelToolExecutorCrmService.name);

  constructor(private readonly prisma: PrismaService) {}

  async toolListLeads(workspaceId: string, args: ToolListLeadsArgs): Promise<ToolResult> {
    const { limit = 10, status } = args;
    const where: Prisma.ContactWhereInput = { workspaceId };
    if (status === 'qualified' || status === 'hot') {
      where.leadScore = { gte: 70 };
    } else if (status === 'cold') {
      where.leadScore = { lt: 30 };
    }
    const contacts = await this.prisma.contact.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        name: true,
        phone: true,
        leadScore: true,
        sentiment: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return {
      success: true,
      count: contacts.length,
      leads: contacts.map((c) => ({
        id: c.id,
        name: c.name || 'Sem nome',
        phone: c.phone,
        score: c.leadScore || 0,
        sentiment: c.sentiment,
        lastUpdate: c.updatedAt,
      })),
      message: `Encontrei ${contacts.length} lead(s).`,
    };
  }

  async toolGetLeadDetails(workspaceId: string, args: ToolGetLeadDetailsArgs): Promise<ToolResult> {
    const { phone, leadId } = args;
    const contactInclude = {
      tags: true,
      conversations: {
        take: 1,
        orderBy: { updatedAt: 'desc' as const },
        include: { messages: { take: 5, orderBy: { createdAt: 'desc' as const } } },
      },
    } as const;
    type ContactWithRelations = Prisma.ContactGetPayload<{ include: typeof contactInclude }>;
    let contact: ContactWithRelations | null = null;
    if (leadId) {
      contact = await this.prisma.contact.findFirst({
        where: { id: leadId, workspaceId },
        include: contactInclude,
      });
    } else if (phone) {
      const normalizedPhone = phone.replace(NON_DIGIT_RE, '');
      contact = await this.prisma.contact.findFirst({
        where: { phone: { contains: normalizedPhone }, workspaceId },
        include: contactInclude,
      });
    }
    if (!contact) return { success: false, error: 'Lead não encontrado.' };
    return {
      success: true,
      lead: {
        id: contact.id,
        name: contact.name,
        phone: contact.phone,
        email: contact.email,
        sentiment: contact.sentiment,
        score: contact.leadScore,
        tags: contact.tags.map((t) => t.name),
        recentMessages:
          contact.conversations[0]?.messages.map((m) => ({
            content: m.content?.substring(0, 100),
            direction: m.direction,
            date: m.createdAt,
          })) || [],
      },
    };
  }

  async toolSaveBusinessInfo(
    workspaceId: string,
    args: ToolSaveBusinessInfoArgs,
  ): Promise<ToolResult> {
    const { businessName, description, segment } = args;
    const updateData: Prisma.WorkspaceUpdateInput = {};
    if (businessName) {
      updateData.name = businessName;
    }
    if (description || segment) {
      const workspace = await this.prisma.workspace.findUnique({ where: { id: workspaceId } });
      const currentSettings = (workspace?.providerSettings as Record<string, unknown>) || {};
      updateData.providerSettings = {
        ...currentSettings,
        businessDescription: description,
        businessSegment: segment,
      };
    }
    await this.prisma.workspace.update({ where: { id: workspaceId }, data: updateData });
    return { success: true, message: 'Informações do negócio salvas com sucesso.' };
  }

  async toolSetBusinessHours(
    workspaceId: string,
    args: ToolSetBusinessHoursArgs,
  ): Promise<ToolResult> {
    const workspace = await this.prisma.workspace.findUnique({ where: { id: workspaceId } });
    const currentSettings = (workspace?.providerSettings as Record<string, unknown>) || {};
    const businessHours = {
      weekday: { start: args.weekdayStart || '09:00', end: args.weekdayEnd || '18:00' },
      saturday: args.saturdayStart ? { start: args.saturdayStart, end: args.saturdayEnd } : null,
      sunday: args.workOnSunday ? { start: '09:00', end: '13:00' } : null,
    };
    await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: { providerSettings: { ...currentSettings, businessHours } },
    });
    return { success: true, businessHours, message: 'Horário de funcionamento configurado.' };
  }

  async toolCreateCampaign(workspaceId: string, args: ToolCreateCampaignArgs): Promise<ToolResult> {
    const { name, message, targetAudience } = args;
    const contactFilter: Prisma.ContactWhereInput = { workspaceId };
    if (targetAudience === 'leads_quentes') {
      contactFilter.leadScore = { gte: 70 };
    } else if (targetAudience === 'novos') {
      contactFilter.createdAt = { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) };
    }
    const contactCount = await this.prisma.contact.count({ where: contactFilter });
    const campaign = await this.prisma.campaign.create({
      data: {
        workspaceId,
        name,
        messageTemplate: message,
        status: 'DRAFT',
        scheduledAt: null,
        filters: {
          targetAudience: targetAudience || 'all',
          createdByKloel: true,
          estimatedRecipients: contactCount,
        },
      },
    });
    return {
      success: true,
      campaign: { id: campaign.id, name: campaign.name, estimatedRecipients: contactCount },
      message: `Campanha "${name}" criada. Atingirá aproximadamente ${contactCount} contato(s). Acesse /campaigns para agendar ou enviar.`,
    };
  }

  async toolGetDashboardSummary(
    workspaceId: string,
    period: 'today' | 'week' | 'month' = 'today',
  ): Promise<ToolResult> {
    let dateFilter: Date;
    switch (period) {
      case 'week':
        dateFilter = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        dateFilter = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        dateFilter = new Date();
        dateFilter.setHours(0, 0, 0, 0);
    }
    const [contacts, messages, flows] = await Promise.all([
      this.prisma.contact.count({ where: { workspaceId, createdAt: { gte: dateFilter } } }),
      this.prisma.message.count({ where: { workspaceId, createdAt: { gte: dateFilter } } }),
      this.prisma.flow.count({ where: { workspaceId, isActive: true } }),
    ]);
    return {
      success: true,
      period,
      stats: { newContacts: contacts, messages, activeFlows: flows },
    };
  }

  async toolListFlows(workspaceId: string): Promise<ToolResult> {
    const flows = await this.prisma.flow.findMany({
      where: { workspaceId },
      select: {
        id: true,
        name: true,
        isActive: true,
        createdAt: true,
        _count: { select: { executions: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    return {
      success: true,
      flows: flows.map((f) => ({
        id: f.id,
        name: f.name,
        active: f.isActive,
        executions: f._count.executions,
      })),
      message: `Você tem ${flows.length} fluxo(s) cadastrado(s).`,
    };
  }
}
