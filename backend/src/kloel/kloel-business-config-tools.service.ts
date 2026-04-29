import { Injectable, Logger, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { StripeRuntime } from '../billing/stripe-runtime';
import { PrismaService } from '../prisma/prisma.service';
import { OpsAlertService } from '../observability/ops-alert.service';

const NON_DIGIT_RE = /\D/g;

/** Generic tool result shape. */
interface ToolResult {
  success: boolean;
  message?: string;
  error?: string;
  [key: string]: unknown;
}

interface ToolListLeadsArgs {
  limit?: number;
  status?: string;
}

interface ToolGetLeadDetailsArgs {
  phone?: string;
  leadId?: string;
}

interface ToolSaveBusinessInfoArgs {
  businessName?: string;
  description?: string;
  segment?: string;
}

interface ToolSetBusinessHoursArgs {
  weekdayStart?: string;
  weekdayEnd?: string;
  saturdayStart?: string;
  saturdayEnd?: string;
  workOnSunday?: boolean;
}

interface ToolCreateCampaignArgs {
  name: string;
  message: string;
  targetAudience?: string;
}

interface ToolUpdateBillingInfoArgs {
  returnUrl?: string;
}

interface ToolChangePlanArgs {
  newPlan: string;
  immediate?: boolean;
}

/** Handles CRM, business config, campaign, and billing AI chat tools. */
@Injectable()
export class KloelBusinessConfigToolsService {
  private readonly logger = new Logger(KloelBusinessConfigToolsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly opsAlert?: OpsAlertService,
  ) {}

  async toolListLeads(workspaceId: string, args: ToolListLeadsArgs): Promise<ToolResult> {
    const { limit = 10, status } = args;
    const where: Prisma.ContactWhereInput = { workspaceId };
    if (status === 'qualified' || status === 'hot') {
      where.leadScore = { gte: 70 };
    } else if (status === 'cold') {
      where.leadScore = { lt: 30 };
    }
    const contacts = await this.prisma.contact.findMany({
      where: { ...where, workspaceId },
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
    if (businessName) updateData.name = businessName;
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
    const contactCount = await this.prisma.contact.count({
      where: { ...contactFilter, workspaceId },
    });
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

  async toolUpdateBillingInfo(
    workspaceId: string,
    args: ToolUpdateBillingInfoArgs,
  ): Promise<ToolResult> {
    const { returnUrl } = args;
    try {
      const workspace = await this.prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { stripeCustomerId: true },
      });
      if (workspace?.stripeCustomerId) {
        const stripe = new StripeRuntime(process.env.STRIPE_SECRET_KEY || '');
        const session = await stripe.billingPortal.sessions.create({
          customer: workspace.stripeCustomerId,
          return_url: returnUrl || `${process.env.FRONTEND_URL || 'http://localhost:3000'}/billing`,
        });
        return {
          success: true,
          url: session.url,
          message: 'Acesse o link para atualizar seus dados de pagamento.',
        };
      }
      return {
        success: false,
        error: 'Nenhum método de pagamento configurado ainda. Acesse /billing para configurar.',
      };
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(error, 'KloelBusinessConfigToolsService.create');
      const msg = error instanceof Error ? error.message : 'unknown error';
      this.logger.error('Erro ao gerar link de billing:', error);
      return { success: false, error: msg };
    }
  }

  async toolGetBillingStatus(workspaceId: string): Promise<ToolResult> {
    try {
      const workspace = await this.prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: {
          stripeCustomerId: true,
          providerSettings: true,
          subscription: { select: { plan: true, stripeId: true } },
        },
      });
      if (!workspace) return { success: false, error: 'Workspace não encontrado' };
      const settings = (workspace.providerSettings as Record<string, unknown>) || {};
      const plan = String(workspace.subscription?.plan || 'FREE');
      const subscriptionId = workspace.subscription?.stripeId || null;
      return {
        success: true,
        plan,
        status: settings.billingSuspended ? 'SUSPENDED' : 'ACTIVE',
        hasPaymentMethod: !!workspace.stripeCustomerId,
        subscriptionId,
        message: settings.billingSuspended
          ? 'Cobrança suspensa. Regularize para continuar usando.'
          : `Plano ${plan} ativo`,
      };
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(error, 'KloelBusinessConfigToolsService.settings');
      const msg = error instanceof Error ? error.message : 'unknown error';
      this.logger.error('Erro ao buscar status billing:', error);
      return { success: false, error: msg };
    }
  }

  async toolChangePlan(workspaceId: string, args: ToolChangePlanArgs): Promise<ToolResult> {
    const { newPlan, immediate: _immediate = true } = args;
    if (!newPlan) {
      return { success: false, error: 'Parâmetro obrigatório: newPlan (starter, pro, enterprise)' };
    }
    const validPlans = ['starter', 'pro', 'enterprise', 'free'];
    if (!validPlans.includes(newPlan.toLowerCase())) {
      return { success: false, error: `Plano inválido. Opções: ${validPlans.join(', ')}` };
    }
    try {
      const workspace = await this.prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { subscription: { select: { plan: true, stripeId: true } } },
      });
      const currentPlan = workspace?.subscription?.plan || 'FREE';
      const targetPlan = newPlan.toUpperCase();
      if (workspace?.subscription?.stripeId) {
        return {
          success: true,
          requiresAction: true,
          currentPlan,
          targetPlan,
          message: `Para alterar de ${currentPlan} para ${targetPlan}, acesse /billing e use o portal de pagamento.`,
        };
      }
      if (targetPlan !== 'FREE' && currentPlan === 'FREE') {
        return {
          success: true,
          requiresCheckout: true,
          targetPlan,
          message: `Para assinar o plano ${targetPlan}, acesse /pricing e complete o checkout.`,
        };
      }
      await this.prisma.subscription.upsert({
        where: { workspaceId },
        update: { plan: targetPlan },
        create: {
          workspaceId,
          plan: targetPlan,
          status: 'ACTIVE',
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });
      return {
        success: true,
        previousPlan: currentPlan,
        newPlan: targetPlan,
        message: `Plano alterado de ${currentPlan} para ${targetPlan}`,
      };
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(error, 'KloelBusinessConfigToolsService.upsert');
      const msg = error instanceof Error ? error.message : 'unknown error';
      this.logger.error('Erro ao alterar plano:', error);
      return { success: false, error: msg };
    }
  }
}
