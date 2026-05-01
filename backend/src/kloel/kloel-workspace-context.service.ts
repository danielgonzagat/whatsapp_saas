import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { filterLegacyProducts, isLegacyProductName } from '../common/products/legacy-products.util';
import { PrismaService } from '../prisma/prisma.service';
import { KloelContextFormatter } from './kloel-context-formatter';
import type { KloelContextFormatterLimits } from './kloel-context-formatter.types';
import { KloelWorkspaceContextDataService } from './kloel-workspace-context-data.service';
import { KloelWorkspaceContextLinkedProductService } from './kloel-workspace-context-linked-product.service';
import {
  listWorkspaceIntegrations,
  createWorkspaceIntegration,
} from './__companions__/kloel-workspace-context.service.companion';
import type { WorkspaceProductContextInput } from './kloel-workspace-context.types';
function safeStr(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
}

const LIMITS: KloelContextFormatterLimits = {
  workspaceProductPlanLimit: 3,
  workspaceProductUrlLimit: 3,
  workspaceProductReviewLimit: 2,
  workspaceProductCheckoutLimit: 1,
  workspaceProductCouponLimit: 2,
  workspaceProductCampaignLimit: 2,
  workspaceProductCommissionLimit: 3,
  workspaceAffiliateContextLimit: 10,
  workspaceInvoiceContextLimit: 3,
  workspaceExternalLinkContextLimit: 4,
  workspaceIntegrationContextLimit: 8,
  workspaceCustomerSubscriptionContextLimit: 4,
  workspacePhysicalOrderContextLimit: 4,
  workspacePaymentContextLimit: 4,
  workspaceAffiliatePartnerContextLimit: 5,
};

/** Builds runtime workspace context strings for AI prompts. */
@Injectable()
export class KloelWorkspaceContextService {
  private readonly logger = new Logger(KloelWorkspaceContextService.name);
  readonly contextFormatter = new KloelContextFormatter(LIMITS);
  constructor(
    private readonly prisma: PrismaService,
    private readonly dataService: KloelWorkspaceContextDataService,
    private readonly linkedProductService: KloelWorkspaceContextLinkedProductService,
  ) {}
  hasLegacyProductMarker(value: string | null | undefined): boolean {
    if (!value) return false;
    return isLegacyProductName(String(value));
  }
  async getWorkspaceContext(workspaceId: string, userId?: string): Promise<string> {
    try {
      const raw = await this.dataService.fetchAll(workspaceId, LIMITS, userId);

      const products = filterLegacyProducts(
        Array.isArray(raw.rawProducts) ? (raw.rawProducts as WorkspaceProductContextInput[]) : [],
      );
      const providerSettings =
        raw.workspace?.providerSettings && typeof raw.workspace.providerSettings === 'object'
          ? (raw.workspace.providerSettings as Record<string, unknown>)
          : {};
      const branding =
        raw.workspace?.branding && typeof raw.workspace.branding === 'object'
          ? (raw.workspace.branding as Record<string, unknown>)
          : {};
      const verifiedBusinessDescription = safeStr(providerSettings.businessDescription).trim();
      const verifiedBusinessSegment = safeStr(providerSettings.businessSegment).trim();
      const businessHours = this.contextFormatter.buildWorkspaceBusinessHoursContext(
        providerSettings.businessHours,
      );

      const affiliateProductIds = new Set<string>();
      for (const request of raw.affiliateRequests || []) {
        const pid = request?.affiliateProduct?.productId;
        if (typeof pid === 'string' && pid) affiliateProductIds.add(pid);
      }
      for (const link of raw.affiliateLinks || []) {
        const pid = link?.affiliateProduct?.productId;
        if (typeof pid === 'string' && pid) affiliateProductIds.add(pid);
      }

      const affiliateCatalogProducts = affiliateProductIds.size
        ? // PULSE_OK: bounded by in-clause from affiliate product IDs set
          await this.prisma.product.findMany({
            where: { id: { in: Array.from(affiliateProductIds) } },
            // Cross-workspace affiliate catalog lookup by product IDs. The
            // producer workspaceId is surfaced for telemetry / tenant
            // attribution (which producer owns this affiliate product).
            select: {
              id: true,
              workspaceId: true,
              name: true,
              description: true,
              price: true,
              currency: true,
              category: true,
            },
          })
        : [];
      const affiliateCatalogProductMap = new Map(affiliateCatalogProducts.map((p) => [p.id, p]));
      const affiliateRequestMap = new Map(
        (raw.affiliateRequests || []).map((r) => [r.affiliateProductId, r]),
      );
      const affiliateLinkMap = new Map(
        (raw.affiliateLinks || []).map((l) => [l.affiliateProductId, l]),
      );
      const affiliateEntries = Array.from(
        new Set([
          ...(raw.affiliateRequests || []).map((r) => r.affiliateProductId),
          ...(raw.affiliateLinks || []).map((l) => l.affiliateProductId),
        ]),
      )
        .map((affiliateProductId) => {
          const request = affiliateRequestMap.get(affiliateProductId);
          const link = affiliateLinkMap.get(affiliateProductId);
          const affiliateProduct = request?.affiliateProduct || link?.affiliateProduct || {};
          const linkedProduct = affiliateCatalogProductMap.get(safeStr(affiliateProduct.productId));
          if (linkedProduct?.name && isLegacyProductName(linkedProduct.name)) return null;
          return {
            productName:
              linkedProduct?.name ||
              this.contextFormatter.truncatePromptText(
                safeStr(affiliateProduct.productId, 'Produto afiliado'),
                48,
              ),
            description: linkedProduct?.description,
            price: linkedProduct?.price,
            currency: linkedProduct?.currency || 'BRL',
            category: affiliateProduct.category || linkedProduct?.category,
            status: request?.status || (link?.active ? 'APPROVED' : 'LINK_DESATIVADO'),
            commissionPct: affiliateProduct.commissionPct,
            commissionType: affiliateProduct.commissionType,
            cookieDays: affiliateProduct.cookieDays,
            approvalMode: affiliateProduct.approvalMode,
            temperature: affiliateProduct.temperature,
            promoMaterials: affiliateProduct.promoMaterials,
            affiliateCode: link?.code,
            linkClicks: link?.clicks,
            linkSales: link?.sales,
            linkRevenue: link?.revenue,
            linkCommissionEarned: link?.commissionEarned,
          };
        })
        .filter(Boolean) as Array<Record<string, unknown>>;

      const contextParts: string[] = [];
      this.appendAccountConfig(
        contextParts,
        raw.workspace,
        branding,
        businessHours,
        raw.integrations,
      );
      this.appendBusinessData(contextParts, verifiedBusinessDescription, verifiedBusinessSegment);
      this.appendBillingContext(
        contextParts,
        raw.subscription,
        raw.invoices,
        providerSettings,
        raw.workspace?.stripeCustomerId,
      );
      this.appendExternalLinks(contextParts, raw.externalPaymentLinks);
      this.appendProductCatalog(contextParts, products, raw.rawProductCount);
      this.appendAffiliateContext(contextParts, affiliateEntries, raw.affiliatePartners);
      this.appendFinancialContext(
        contextParts,
        raw.customerSubscriptions,
        raw.physicalOrders,
        raw.payments,
      );
      this.appendMemories(contextParts, raw.memories);
      if (raw.userProfile?.content)
        contextParts.unshift(`PERFIL DO USUÁRIO ATUAL:\n${raw.userProfile.content}`);

      return contextParts.filter(Boolean).join('\n\n');
    } catch (error: unknown) {
      this.logger.warn('Erro ao buscar contexto:', error);
      return '';
    }
  }
  private appendAccountConfig(
    parts: string[],
    workspace: { customDomain?: string | null } | null,
    branding: Record<string, unknown>,
    businessHours: string | null | undefined,
    integrations: Array<Record<string, unknown>>,
  ): void {
    const lines = [
      workspace?.customDomain ? `- Domínio customizado: ${workspace.customDomain}` : null,
      branding?.primaryColor ? `- Cor principal: ${safeStr(branding.primaryColor)}` : null,
      branding?.logoUrl ? '- Logo configurada: sim' : null,
      businessHours ? `- Horário comercial: ${businessHours}` : null,
    ].filter(Boolean);
    const integrationsBlock = this.contextFormatter.buildWorkspaceIntegrationContext(integrations);
    if (lines.length > 0 || integrationsBlock) {
      parts.push(
        [
          'CONFIGURAÇÃO VERIFICADA DA CONTA E DA MARCA:',
          ...lines,
          integrationsBlock ? `- Integrações conectadas:\n${integrationsBlock}` : null,
        ]
          .filter(Boolean)
          .join('\n'),
      );
    }
  }
  private appendBusinessData(parts: string[], description: string, segment: string): void {
    if (!description && !segment) return;
    parts.push(
      [
        'DADOS OPERACIONAIS VERIFICADOS DO NEGÓCIO:',
        segment ? `- Segmento: ${segment}` : null,
        description ? `- Descrição: ${description}` : null,
      ]
        .filter(Boolean)
        .join('\n'),
    );
  }
  private appendBillingContext(
    parts: string[],
    subscription: Record<string, unknown> | null | undefined,
    invoices: Array<Record<string, unknown>>,
    providerSettings: Record<string, unknown>,
    stripeCustomerId: string | null | undefined,
  ): void {
    const billingContext = this.contextFormatter.buildWorkspaceBillingContext({
      subscription,
      invoices,
      providerSettings,
      stripeCustomerId,
    });
    if (billingContext) parts.push(`STATUS DA CONTA E DA ASSINATURA:\n${billingContext}`);
  }
  private appendExternalLinks(parts: string[], links: Array<Record<string, unknown>>): void {
    const ctx = this.contextFormatter.buildWorkspaceExternalPaymentLinkContext(links);
    if (ctx) parts.push(`LINKS EXTERNOS DE VENDA:\n${ctx}`);
  }
  private appendProductCatalog(
    parts: string[],
    products: WorkspaceProductContextInput[],
    rawProductCount: number,
  ): void {
    if (products.length > 0) {
      parts.push(
        [
          `CATÁLOGO REAL DO WORKSPACE (${products.length} produto(s) carregado(s)${rawProductCount > products.length ? ` de ${rawProductCount} cadastrado(s)` : ''}):`,
          ...products.map((p, i) => this.contextFormatter.buildWorkspaceProductContext(p, i)),
        ].join('\n\n'),
      );
    } else {
      parts.push(
        'STATUS DE CATÁLOGO: nenhum produto real cadastrado no workspace. Não invente produtos.',
      );
    }
  }
  private appendAffiliateContext(
    parts: string[],
    affiliateEntries: Array<Record<string, unknown>>,
    affiliatePartners: Array<Record<string, unknown>>,
  ): void {
    if (affiliateEntries.length > 0) {
      const ctx = this.contextFormatter.buildWorkspaceAffiliateContext(affiliateEntries);
      if (ctx) parts.push(`PRODUTOS EM QUE O WORKSPACE SE AFILIOU:\n${ctx}`);
    }
    const partnerCtx =
      this.contextFormatter.buildWorkspaceAffiliatePartnerContext(affiliatePartners);
    if (partnerCtx) parts.push(`REDE DE PARCEIROS E AFILIADOS DO WORKSPACE:\n${partnerCtx}`);
  }
  private appendFinancialContext(
    parts: string[],
    customerSubscriptions: Array<Record<string, unknown>>,
    physicalOrders: Array<Record<string, unknown>>,
    payments: Array<Record<string, unknown>>,
  ): void {
    const subCtx =
      this.contextFormatter.buildWorkspaceCustomerSubscriptionContext(customerSubscriptions);
    const orderCtx = this.contextFormatter.buildWorkspacePhysicalOrderContext(physicalOrders);
    const payCtx = this.contextFormatter.buildWorkspacePaymentContext(payments);
    if (subCtx || orderCtx || payCtx) {
      parts.push(
        ['PÓS-VENDA E FINANCEIRO RECENTE:', subCtx, orderCtx, payCtx].filter(Boolean).join('\n'),
      );
    }
  }
  private appendMemories(
    parts: string[],
    memories: Array<{ type?: string | null; content?: string | null }>,
  ): void {
    for (const memory of memories) {
      if (this.hasLegacyProductMarker(memory.content)) continue;
      switch (memory.type) {
        case 'product':
          if (!memory.content || isLegacyProductName(memory.content)) continue;
          break;
        case 'persona':
          parts.push(`PERSONA/TOM DE VOZ: ${memory.content}`);
          break;
        case 'user_profile':
          parts.push(`PERFIL DO USUÁRIO: ${memory.content}`);
          break;
        case 'objection':
          parts.push(`OBJEÇÃO COMUM: ${memory.content}`);
          break;
        case 'script':
          parts.push(`SCRIPT DE VENDA: ${memory.content}`);
          break;
        case 'contact_context':
          parts.push(`CONTEXTO DE CONTATO: ${memory.content}`);
          break;
        default:
          if (memory.content) parts.push(memory.content);
      }
    }
  }
  async listPersonas(workspaceId: string) {
    return this.prisma.persona.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        name: true,
        role: true,
        basePrompt: true,
        voiceId: true,
        knowledgeBaseId: true,
        workspaceId: true,
        createdAt: true,
      },
    });
  }

  createPersona(
    workspaceId: string,
    data: {
      name: string;
      role?: string;
      basePrompt?: string;
      description?: string;
      systemPrompt?: string;
      temperature?: number;
    },
  ) {
    return this.prisma.persona.create({
      data: {
        workspaceId,
        name: data.name,
        role: data.role || 'SALES',
        basePrompt: data.basePrompt || data.systemPrompt || '',
      },
    });
  }
  async listIntegrations(workspaceId: string) {
    return listWorkspaceIntegrations(this.prisma, workspaceId);
  }
  async createIntegration(
    workspaceId: string,
    data: { type: string; name: string; credentials: Prisma.InputJsonValue },
  ) {
    return createWorkspaceIntegration(this.prisma, workspaceId, data);
  }
  async buildLinkedProductPromptContext(
    workspaceId: string,
    linkedProduct:
      | {
          id?: string;
          source?: 'owned' | 'affiliate';
          productId?: string | null;
          affiliateProductId?: string | null;
        }
      | null
      | undefined,
  ): Promise<string | null> {
    return this.linkedProductService.buildLinkedProductPromptContext(
      workspaceId,
      LIMITS,
      linkedProduct,
    );
  }
}
