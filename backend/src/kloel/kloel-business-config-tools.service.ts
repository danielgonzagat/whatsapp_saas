import { Injectable, Optional } from '@nestjs/common';
import { StructuredLogger } from '../logging/structured-logger';
import { Prisma } from '@prisma/client';
import { StripeRuntime } from '../billing/stripe-runtime';
import { PrismaService } from '../prisma/prisma.service';
import { OpsAlertService } from '../observability/ops-alert.service';

import { digitsOnly } from '../common/phone';

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
  query?: string;
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
  private readonly logger = StructuredLogger.from(KloelBusinessConfigToolsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly opsAlert?: OpsAlertService,
  ) {}

  async toolListLeads(workspaceId: string, args: ToolListLeadsArgs): Promise<ToolResult> {
    const { limit = 10, status, query } = args;
    const where: Prisma.ContactWhereInput = { workspaceId };
    if (status === 'qualified' || status === 'hot') {
      where.leadScore = { gte: 70 };
    } else if (status === 'cold') {
      where.leadScore = { lt: 30 };
    }
    // Search by name from query param
    if (query && typeof query === 'string') {
      const cleanQ = query
        .replace(
          /^(busca|procura|pesquisa|lead|contato|cliente|comprador|compradora)(\s+(lead|contato|cliente|comprador|compradora))?\s+/i,
          '',
        )
        .trim();
      if (cleanQ) {
        where.name = { contains: cleanQ, mode: 'insensitive' };
      }
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
      const normalizedPhone = digitsOnly(phone);
      contact = await this.prisma.contact.findFirst({
        where: { phone: { contains: normalizedPhone }, workspaceId },
        include: contactInclude,
      });
    }
    if (!contact) {
      return { success: false, error: 'Lead não encontrado.' };
    }

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
    const { businessName, description, segment, cnpj, cpf, cep, bankCode, agency, account } =
      args as ToolSaveBusinessInfoArgs & {
        cnpj?: string;
        cpf?: string;
        cep?: string;
        bankCode?: string;
        agency?: string;
        account?: string;
      };
    const updateData: Prisma.WorkspaceUpdateInput = {};
    if (businessName) {
      updateData.name = businessName;
    }
    // Build fiscal/payment settings from extracted args
    const fiscalFields: Record<string, unknown> = {};
    if (cnpj) {
      fiscalFields.cnpj = cnpj;
    }
    if (cpf) {
      fiscalFields.cpf = cpf;
    }
    if (cep) {
      fiscalFields.cep = cep;
    }
    if (bankCode) {
      fiscalFields.bankCode = bankCode;
    }
    if (agency) {
      fiscalFields.agency = agency;
    }
    if (account) {
      fiscalFields.account = account;
    }

    const hasFiscal = Object.keys(fiscalFields).length > 0;
    const hasBiz = !!(description || segment);

    if (hasFiscal || hasBiz) {
      await this.prisma.$transaction(async (tx) => {
        const workspace = await tx.workspace.findUnique({ where: { id: workspaceId } });
        const currentSettings = (workspace?.providerSettings as Record<string, unknown>) || {};
        await tx.workspace.update({
          where: { id: workspaceId },
          data: {
            providerSettings: {
              ...currentSettings,
              ...(description ? { businessDescription: description } : {}),
              ...(segment ? { businessSegment: segment } : {}),
              ...(hasFiscal
                ? {
                    fiscal: {
                      ...((currentSettings?.fiscal as Record<string, unknown>) || {}),
                      ...fiscalFields,
                    },
                  }
                : {}),
            } as Prisma.InputJsonValue,
            ...(businessName ? { name: businessName } : {}),
          },
        });
      });
      return {
        success: true,
        message: hasFiscal
          ? `Dados ${Object.keys(fiscalFields).join(', ')} salvos com sucesso.`
          : 'Informações do negócio salvas com sucesso.',
      };
    }
    if (businessName) {
      await this.prisma.workspace.update({ where: { id: workspaceId }, data: updateData });
    }
    return { success: true, message: 'Informações do negócio salvas com sucesso.' };
  }

  async toolSetBusinessHours(
    workspaceId: string,
    args: ToolSetBusinessHoursArgs,
  ): Promise<ToolResult> {
    const businessHours = {
      weekday: { start: args.weekdayStart || '09:00', end: args.weekdayEnd || '18:00' },
      saturday: args.saturdayStart ? { start: args.saturdayStart, end: args.saturdayEnd } : null,
      sunday: args.workOnSunday ? { start: '09:00', end: '13:00' } : null,
    };
    await this.prisma.$transaction(async (tx) => {
      const workspace = await tx.workspace.findUnique({ where: { id: workspaceId } });
      const currentSettings = (workspace?.providerSettings as Record<string, unknown>) || {};
      await tx.workspace.update({
        where: { id: workspaceId },
        data: { providerSettings: { ...currentSettings, businessHours } },
      });
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
      if (!workspace) {
        return { success: false, error: 'Workspace não encontrado' };
      }
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

  // ── Novos tools ──

  async toolUploadDocument(
    workspaceId: string,
    args: Record<string, unknown>,
  ): Promise<ToolResult> {
    const docType = typeof args.docType === 'string' ? args.docType : 'document';
    const docTypes: Record<string, string> = {
      identidade: 'Documento de identidade',
      contrato: 'Contrato social / Cartão CNPJ',
      cnpj: 'Cartão CNPJ',
    };
    const label = docTypes[docType.toLowerCase()] || 'Documento';
    try {
      // Store document upload intent in workspace settings
      await this.prisma.$transaction(async (tx) => {
        const ws = await tx.workspace.findUnique({ where: { id: workspaceId } });
        const settings = (ws?.providerSettings as Record<string, unknown>) || {};
        const documents = (settings.documents as Array<Record<string, unknown>>) || [];
        documents.push({
          type: docType,
          label,
          status: 'pending_upload',
          requestedAt: new Date().toISOString(),
        });
        await tx.workspace.update({
          where: { id: workspaceId },
          data: { providerSettings: { ...settings, documents } as Prisma.InputJsonValue },
        });
      });
      return {
        success: true,
        message: `${label} registrado. Envie o arquivo no chat para vinculá-lo à sua conta.`,
      };
    } catch (e: unknown) {
      return {
        success: false,
        error: e instanceof Error ? e.message : 'Erro ao registrar documento.',
      };
    }
  }

  async toolUpdateAffiliateConfig(
    workspaceId: string,
    args: Record<string, unknown>,
  ): Promise<ToolResult> {
    try {
      const productName = typeof args.productName === 'string' ? args.productName : '';
      let productId = '';
      if (productName) {
        const p = await this.prisma.product.findFirst({
          where: { workspaceId, name: { contains: productName, mode: 'insensitive' } },
          select: { id: true },
        });
        productId = p?.id ?? '';
      }
      // Update workspace-level affiliate settings
      await this.prisma.$transaction(async (tx) => {
        const ws = await tx.workspace.findUnique({ where: { id: workspaceId } });
        const settings = (ws?.providerSettings as Record<string, unknown>) || {};
        const affiliate = (settings.affiliate as Record<string, unknown>) || {};
        if (args.participate !== undefined) {
          affiliate.participate = args.participate;
        }
        if (args.visibleInStore !== undefined) {
          affiliate.visibleInStore = args.visibleInStore;
        }
        if (args.autoApproval !== undefined) {
          affiliate.autoApproval = args.autoApproval;
        }
        if (args.accessData !== undefined) {
          affiliate.accessData = args.accessData;
        }
        if (args.accessAbandonments !== undefined) {
          affiliate.accessAbandonments = args.accessAbandonments;
        }
        if (args.commissionFirstInstallment !== undefined) {
          affiliate.commissionFirstInstallment = args.commissionFirstInstallment;
        }
        if (args.attributionModel) {
          affiliate.attributionModel = args.attributionModel;
        }
        if (args.cookieDays !== undefined) {
          affiliate.cookieDays = args.cookieDays;
        }
        if (args.commissionPercent !== undefined) {
          affiliate.commissionPercent = args.commissionPercent;
        }
        await tx.workspace.update({
          where: { id: workspaceId },
          data: { providerSettings: { ...settings, affiliate } as Prisma.InputJsonValue },
        });
        // If product-specific, update product commission
        if (productId && args.commissionPercent !== undefined) {
          const existing = await tx.productCommission.findFirst({ where: { productId } });
          if (existing) {
            await tx.productCommission.update({
              where: { id: existing.id },
              data: { percentage: Number(args.commissionPercent) },
            });
          } else {
            await tx.productCommission.create({
              data: { productId, percentage: Number(args.commissionPercent), role: 'AFFILIATE' },
            });
          }
        }
      });
      const fields = Object.keys(args)
        .filter((k) => k !== 'productName' && args[k] !== undefined)
        .join(', ');
      return {
        success: true,
        message: `Configuracao de afiliados atualizada${fields ? ': ' + fields : ''}.`,
      };
    } catch (e: unknown) {
      return {
        success: false,
        error: e instanceof Error ? e.message : 'Erro ao atualizar afiliados.',
      };
    }
  }

  async toolListAffiliates(workspaceId: string): Promise<ToolResult> {
    try {
      const commissions = await this.prisma.productCommission.findMany({
        where: { product: { workspaceId } },
        include: { product: { select: { id: true, name: true } } },
        take: 50,
      });
      if (commissions.length === 0) {
        return {
          success: true,
          message: 'Nenhum afiliado cadastrado. Acesse Produto > Afiliados para configurar.',
        };
      }
      return {
        success: true,
        affiliates: commissions.map((c) => ({
          productName: c.product.name,
          role: c.role,
          percentage: c.percentage,
          agentName: c.agentName,
          agentEmail: c.agentEmail,
        })),
        message: `${commissions.length} afiliado(s) encontrado(s).`,
      };
    } catch {
      return { success: true, message: 'Nenhum afiliado cadastrado.' };
    }
  }
  async toolGetSocialChannels(workspaceId: string): Promise<ToolResult> {
    try {
      const ws = await this.prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: {
          providerSettings: true,
          metaConnections: { select: { id: true, pageName: true } },
        },
      });
      const settings = (ws?.providerSettings as Record<string, unknown>) || {};
      const channels = (settings.channels as Record<string, unknown>) || {};
      return {
        success: true,
        channels: {
          whatsapp: { connected: !!settings.whatsappPhoneNumberId, label: 'WhatsApp' },
          instagram: {
            connected: !!(ws?.metaConnections && (ws.metaConnections as Array<unknown>).length > 0),
            label: 'Instagram',
          },
          facebook: {
            connected: !!(ws?.metaConnections && (ws.metaConnections as Array<unknown>).length > 0),
            label: 'Facebook',
          },
          tiktok: { connected: !!channels.tiktok, label: 'TikTok' },
          email: { connected: !!settings.emailProvider, label: 'Email' },
        },
        message: 'Canais disponíveis. Conecte cada um em Configurações > Canais.',
      };
    } catch {
      return {
        success: true,
        message: 'Canais sociais disponíveis: WhatsApp, Instagram, Facebook, TikTok, Email.',
      };
    }
  }

  async toolConnectChannel(
    workspaceId: string,
    args: Record<string, unknown>,
  ): Promise<ToolResult> {
    const channel = typeof args.channel === 'string' ? args.channel.toLowerCase() : '';
    const validChannels = ['instagram', 'facebook', 'tiktok', 'email'];
    if (!validChannels.includes(channel)) {
      return {
        success: true,
        message: `Para conectar ${channel || 'um canal'}, acesse Configurações > Canais. Canais disponíveis: WhatsApp, Instagram, Facebook, TikTok, Email.`,
      };
    }
    try {
      await this.prisma.$transaction(async (tx) => {
        const ws = await tx.workspace.findUnique({ where: { id: workspaceId } });
        const settings = (ws?.providerSettings as Record<string, unknown>) || {};
        const channels = (settings.channels as Record<string, unknown>) || {};
        channels[channel] = { status: 'pending_oauth', requestedAt: new Date().toISOString() };
        await tx.workspace.update({
          where: { id: workspaceId },
          data: { providerSettings: { ...settings, channels } as Prisma.InputJsonValue },
        });
      });
      return {
        success: true,
        message: `Conexão com ${channel} iniciada. Complete a autorização em Configurações > Canais > ${channel}.`,
      };
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : 'Erro ao conectar canal.' };
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
