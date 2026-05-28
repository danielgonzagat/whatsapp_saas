import { Injectable, Optional } from '@nestjs/common';
import { StructuredLogger } from '../logging/structured-logger';
import { Prisma } from '@prisma/client';
import { StripeRuntime } from '../billing/stripe-runtime';
import { PrismaService } from '../prisma/prisma.service';
import { OpsAlertService } from '../observability/ops-alert.service';

import { digitsOnly } from '../common/phone';
import {
  applyAffiliateConfig,
  buildAffiliateConfigMessage,
  buildBillingStatusResponse,
  buildBusinessHoursPayload,
  buildBusinessProviderSettings,
  buildCampaignContactFilter,
  buildListLeadsWhere,
  buildSaveBusinessInfoMessage,
  buildSocialChannelsView,
  canonicalPlan,
  documentTypeLabel,
  extractFiscalFields,
  mapLeadDetail,
  mapLeadListRow,
  normalizeConnectableChannel,
  validatePlanInput,
  type FiscalArgs,
  type ToolChangePlanArgs,
  type ToolCreateCampaignArgs,
  type ToolGetLeadDetailsArgs,
  type ToolListLeadsArgs,
  type ToolResult,
  type ToolSaveBusinessInfoArgs,
  type ToolSetBusinessHoursArgs,
  type ToolUpdateBillingInfoArgs,
} from './kloel-business-config-tools.helpers';

/** Handles CRM, business config, campaign, and billing AI chat tools. */
@Injectable()
export class KloelBusinessConfigToolsService {
  private readonly logger = StructuredLogger.from(KloelBusinessConfigToolsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly opsAlert?: OpsAlertService,
  ) {}

  async toolListLeads(workspaceId: string, args: ToolListLeadsArgs): Promise<ToolResult> {
    const { limit = 10 } = args;
    const where = buildListLeadsWhere(workspaceId, args);
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
      leads: contacts.map(mapLeadListRow),
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
      lead: mapLeadDetail(contact),
    };
  }

  async toolSaveBusinessInfo(
    workspaceId: string,
    args: ToolSaveBusinessInfoArgs,
  ): Promise<ToolResult> {
    const { businessName, description, segment, businessHours, socialChannels } = args;
    const extended = args as ToolSaveBusinessInfoArgs & FiscalArgs;
    const updateData: Prisma.WorkspaceUpdateInput = {};
    if (businessName) {
      updateData.name = businessName;
    }
    const fiscalFields = extractFiscalFields(extended);

    const hasFiscal = Object.keys(fiscalFields).length > 0;
    const hasBiz = !!(description || segment || businessHours || socialChannels);

    if (hasFiscal || hasBiz) {
      await this.prisma.$transaction(async (tx) => {
        const workspace = await tx.workspace.findUnique({ where: { id: workspaceId } });
        const currentSettings = (workspace?.providerSettings as Record<string, unknown>) || {};
        const nextSettings = buildBusinessProviderSettings(
          currentSettings,
          description,
          segment,
          fiscalFields,
        );
        if (businessHours) { nextSettings.businessHours = businessHours; }
        if (socialChannels) { nextSettings.socialChannels = socialChannels; }
        await tx.workspace.update({
          where: { id: workspaceId },
          data: {
            providerSettings: nextSettings as Prisma.InputJsonValue,
            ...(businessName ? { name: businessName } : {}),
          },
        });
      });
      return {
        success: true,
        message: buildSaveBusinessInfoMessage(fiscalFields),
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
    const businessHours = buildBusinessHoursPayload(args);
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
    const contactFilter = buildCampaignContactFilter(workspaceId, targetAudience);
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
      return buildBillingStatusResponse(workspace);
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(error, 'KloelBusinessConfigToolsService.settings');
      const msg = error instanceof Error ? error.message : 'unknown error';
      this.logger.error('Erro ao buscar status billing:', error);
      return { success: false, error: msg };
    }
  }


  // ── Novos tools ──

  async toolUploadDocument(workspaceId: string, args: Record<string, unknown>): Promise<ToolResult> {
    const docType = typeof args.docType === 'string' ? args.docType : 'document';
    const label = documentTypeLabel(docType);
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
      return { success: true, message: `${label} registrado. Envie o arquivo no chat para vinculá-lo à sua conta.` };
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : 'Erro ao registrar documento.' };
    }
  }


  async toolUpdateAffiliateConfig(workspaceId: string, args: Record<string, unknown>): Promise<ToolResult> {
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
        applyAffiliateConfig(affiliate, args);
        await tx.workspace.update({
          where: { id: workspaceId },
          data: { providerSettings: { ...settings, affiliate } as Prisma.InputJsonValue },
        });
        // If product-specific, update product commission
        if (productId && args.commissionPercent !== undefined) {
          const existing = await tx.productCommission.findFirst({ where: { productId } });
          if (existing) {
            await tx.productCommission.update({ where: { id: existing.id }, data: { percentage: Number(args.commissionPercent) } });
          } else {
            await tx.productCommission.create({ data: { productId, percentage: Number(args.commissionPercent), role: 'AFFILIATE' } });
          }
        }
      });
      return {
        success: true,
        message: buildAffiliateConfigMessage(args),
      };
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : 'Erro ao atualizar afiliados.' };
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
        return { success: true, message: 'Nenhum afiliado cadastrado. Acesse Produto > Afiliados para configurar.' };
      }
      return {
        success: true,
        affiliates: commissions.map(c => ({
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
      return {
        success: true,
        channels: buildSocialChannelsView({
          providerSettings: ws?.providerSettings as Record<string, unknown> | null,
          metaConnections: (ws?.metaConnections as Array<unknown> | undefined) ?? null,
        }),
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
    const { channel, isValid } = normalizeConnectableChannel(args.channel);
    if (!isValid) {
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
      return { success: true, message: `Conexão com ${channel} iniciada. Complete a autorização em Configurações > Canais > ${channel}.` };
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : 'Erro ao conectar canal.' };
    }
  }
  async toolChangePlan(workspaceId: string, args: ToolChangePlanArgs): Promise<ToolResult> {
    const { newPlan, immediate: _immediate = true } = args;
    const validationError = validatePlanInput(newPlan);
    if (validationError) {
      return { success: false, error: validationError };
    }
    try {
      const workspace = await this.prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { subscription: { select: { plan: true, stripeId: true } } },
      });
      const currentPlan = workspace?.subscription?.plan || 'FREE';
      const targetPlan = canonicalPlan(newPlan);
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
