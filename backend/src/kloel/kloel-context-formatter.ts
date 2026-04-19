import { buildProductAIConfigPrompt } from './kloel.prompts';

const S_RE = /\s+/g;

function safeStr(v: unknown, fb = ''): string {
  return typeof v === 'string'
    ? v
    : typeof v === 'number' || typeof v === 'boolean'
      ? String(v)
      : fb;
}

export interface KloelContextFormatterLimits {
  workspaceProductPlanLimit: number;
  workspaceProductUrlLimit: number;
  workspaceProductReviewLimit: number;
  workspaceProductCheckoutLimit: number;
  workspaceProductCouponLimit: number;
  workspaceProductCampaignLimit: number;
  workspaceProductCommissionLimit: number;
  workspaceAffiliateContextLimit: number;
  workspaceInvoiceContextLimit: number;
  workspaceExternalLinkContextLimit: number;
  workspaceIntegrationContextLimit: number;
  workspaceCustomerSubscriptionContextLimit: number;
  workspacePhysicalOrderContextLimit: number;
  workspacePaymentContextLimit: number;
  workspaceAffiliatePartnerContextLimit: number;
}

export class KloelContextFormatter {
  constructor(private readonly limits: KloelContextFormatterLimits) {}

  sanitizeUserNameForAssistant(value: string | null | undefined): string {
    const normalized = String(value || '')
      .replace(S_RE, ' ')
      .trim();

    if (!normalized) return 'Usuário';

    const [firstName = normalized] = normalized.split(' ');
    return firstName || 'Usuário';
  }

  formatPromptCurrency(value: unknown, currency: unknown = 'BRL'): string {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return 'valor não informado';
    const currencyStr = typeof currency === 'string' && currency ? currency : 'BRL';

    try {
      return amount.toLocaleString('pt-BR', {
        style: 'currency',
        currency: currencyStr,
      });
    } catch {
      return amount.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
      });
    }
  }

  formatPromptPercent(value: unknown, fractionDigits = 1): string | null {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return null;
    return `${amount.toFixed(fractionDigits)}%`;
  }

  formatPromptDate(value: unknown, options?: Intl.DateTimeFormatOptions): string | null {
    if (!value) return null;

    const date = value instanceof Date ? value : new Date(safeStr(value));
    if (Number.isNaN(date.getTime())) return null;

    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeZone: 'America/Sao_Paulo',
      ...options,
    }).format(date);
  }

  truncatePromptText(value: unknown, maxLength = 240): string {
    const normalized = safeStr(value).replace(S_RE, ' ').trim();

    if (!normalized) return '';
    if (normalized.length <= maxLength) return normalized;
    return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
  }

  compactJsonForPrompt(value: unknown, maxLength = 240): string | null {
    if (value == null) return null;

    if (typeof value === 'string') {
      const normalized = this.truncatePromptText(value, maxLength);
      return normalized || null;
    }

    try {
      const serialized = JSON.stringify(value);
      const normalized = this.truncatePromptText(serialized, maxLength);
      return normalized || null;
    } catch {
      return null;
    }
  }

  buildProductPlanContext(plans: unknown): string | null {
    if (!Array.isArray(plans) || plans.length === 0) return null;

    return plans
      .slice(0, this.limits.workspaceProductPlanLimit)
      .map((plan) => {
        const parts = [
          `${plan.name}: ${this.formatPromptCurrency(plan.price, plan.currency)}`,
          plan.billingType ? `cobrança ${plan.billingType}` : null,
          Number.isFinite(Number(plan.maxInstallments))
            ? `até ${Number(plan.maxInstallments)}x`
            : null,
          plan.recurringInterval ? `recorrência ${plan.recurringInterval}` : null,
          plan.trialEnabled ? `trial ${Number(plan.trialDays || 0)} dias` : null,
          Number.isFinite(Number(plan.salesCount)) ? `${Number(plan.salesCount)} vendas` : null,
        ].filter(Boolean);

        const aiConfig = this.compactJsonForPrompt(plan.aiConfig, 180);
        const termsUrl = this.truncatePromptText(plan.termsUrl, 140);

        return [
          `  - ${parts.join(' | ')}`,
          aiConfig ? `    AI do plano: ${aiConfig}` : null,
          termsUrl ? `    Termos: ${termsUrl}` : null,
        ]
          .filter(Boolean)
          .join('\n');
      })
      .join('\n');
  }

  buildProductUrlContext(urls: unknown): string | null {
    if (!Array.isArray(urls) || urls.length === 0) return null;

    return urls
      .slice(0, this.limits.workspaceProductUrlLimit)
      .map((entry) => {
        const parts = [
          entry.description || 'URL sem descrição',
          this.truncatePromptText(entry.url, 160),
          entry.isPrivate ? 'privada' : 'pública',
          entry.aiLearning ? 'aprendizado AI ativo' : null,
          entry.chatEnabled ? 'chat habilitado' : null,
          Number.isFinite(Number(entry.salesFromUrl)) && Number(entry.salesFromUrl) > 0
            ? `${Number(entry.salesFromUrl)} vendas`
            : null,
        ].filter(Boolean);

        return `  - ${parts.join(' | ')}`;
      })
      .join('\n');
  }

  buildProductReviewContext(reviews: unknown): string | null {
    if (!Array.isArray(reviews) || reviews.length === 0) return null;

    const averageRating =
      reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / reviews.length;

    return [
      `  - média recente: ${averageRating.toFixed(1)}/5`,
      ...reviews.slice(0, this.limits.workspaceProductReviewLimit).map((review) => {
        const author = this.truncatePromptText(review.authorName, 32) || 'cliente';
        const comment = this.truncatePromptText(review.comment, 140);
        const suffix = review.verified ? ' | verificada' : '';
        return comment
          ? `  - ${author}: ${Number(review.rating || 0)}/5${suffix} — ${comment}`
          : `  - ${author}: ${Number(review.rating || 0)}/5${suffix}`;
      }),
    ].join('\n');
  }

  buildProductCheckoutContext(checkouts: unknown): string | null {
    if (!Array.isArray(checkouts) || checkouts.length === 0) return null;

    return checkouts
      .slice(0, this.limits.workspaceProductCheckoutLimit)
      .map((checkout) => {
        const conversion = this.formatPromptPercent(checkout.conversionRate);
        const abandon = this.formatPromptPercent(checkout.abandonRate);
        const cancel = this.formatPromptPercent(checkout.cancelRate);
        const parts = [
          checkout.name || checkout.code || 'checkout principal',
          conversion && Number(checkout.conversionRate) > 0 ? `conversão ${conversion}` : null,
          abandon && Number(checkout.abandonRate) > 0 ? `abandono ${abandon}` : null,
          cancel && Number(checkout.cancelRate) > 0 ? `cancelamento ${cancel}` : null,
          Number.isFinite(Number(checkout.totalVisits))
            ? `${Number(checkout.totalVisits)} visitas`
            : null,
        ].filter(Boolean);

        return `  - ${parts.join(' | ')}`;
      })
      .join('\n');
  }

  buildProductCouponContext(coupons: unknown, currency: unknown = 'BRL'): string | null {
    if (!Array.isArray(coupons) || coupons.length === 0) return null;

    return coupons
      .slice(0, this.limits.workspaceProductCouponLimit)
      .map((coupon) => {
        const discount =
          String(coupon.discountType || '').toUpperCase() === 'FIXED'
            ? this.formatPromptCurrency(coupon.discountValue, currency)
            : `${Number(coupon.discountValue || 0)}%`;

        const expiresAt = this.formatPromptDate(coupon.expiresAt);
        const parts = [
          coupon.code,
          `desconto ${discount}`,
          Number.isFinite(Number(coupon.usedCount)) ? `${Number(coupon.usedCount)} uso(s)` : null,
          Number.isFinite(Number(coupon.maxUses)) ? `limite ${Number(coupon.maxUses)}` : null,
          expiresAt ? `expira ${expiresAt}` : null,
        ].filter(Boolean);

        return `  - ${parts.join(' | ')}`;
      })
      .join('\n');
  }

  buildProductCampaignContext(campaigns: unknown): string | null {
    if (!Array.isArray(campaigns) || campaigns.length === 0) return null;

    return campaigns
      .slice(0, this.limits.workspaceProductCampaignLimit)
      .map((campaign) => {
        const parts = [
          campaign.name || campaign.code,
          Number.isFinite(Number(campaign.salesCount))
            ? `${Number(campaign.salesCount)} venda(s)`
            : null,
          Number.isFinite(Number(campaign.paidCount))
            ? `${Number(campaign.paidCount)} paga(s)`
            : null,
        ].filter(Boolean);

        return `  - ${parts.join(' | ')}`;
      })
      .join('\n');
  }

  buildProductCommissionContext(commissions: unknown): string | null {
    if (!Array.isArray(commissions) || commissions.length === 0) return null;

    return commissions
      .slice(0, this.limits.workspaceProductCommissionLimit)
      .map((commission) => {
        const actor =
          this.truncatePromptText(commission.agentName, 40) ||
          this.truncatePromptText(commission.agentEmail, 40) ||
          'parceiro sem nome';

        return `  - ${commission.role}: ${Number(commission.percentage || 0)}%${actor ? ` | ${actor}` : ''}`;
      })
      .join('\n');
  }

  buildProductMarketingContext(aiConfig: unknown): string | null {
    if (!aiConfig || typeof aiConfig !== 'object') return null;

    const prompt = buildProductAIConfigPrompt(
      aiConfig as Parameters<typeof buildProductAIConfigPrompt>[0],
    )
      .split('\n')
      .map((line) => this.truncatePromptText(line, 220))
      .filter(Boolean)
      .slice(0, 10);

    if (prompt.length === 0) return null;
    return prompt.map((line) => `  - ${line}`).join('\n');
  }

  buildWorkspaceProductContext(product: Record<string, unknown>, index: number): string {
    const lines: string[] = [`PRODUTO ${index + 1}: ${safeStr(product.name)}`];

    lines.push(
      [
        '- Estado operacional:',
        product.active ? 'ativo' : 'inativo',
        product.status ? `workflow ${safeStr(product.status)}` : null,
        product.featured ? 'em destaque' : null,
      ]
        .filter(Boolean)
        .join(' | '),
    );

    lines.push(
      [
        '- Oferta principal:',
        this.formatPromptCurrency(product.price, product.currency),
        product.format ? `formato ${safeStr(product.format)}` : null,
        product.category ? `categoria ${safeStr(product.category)}` : null,
        product.isSample ? 'amostra' : null,
      ]
        .filter(Boolean)
        .join(' | '),
    );

    const description = this.truncatePromptText(product.description, 260);
    if (description) {
      lines.push(`- Descrição: ${description}`);
    }

    const identifiers = [
      product.sku ? `SKU ${safeStr(product.sku)}` : null,
      Array.isArray(product.tags) && product.tags.length > 0
        ? `tags ${product.tags.slice(0, 6).join(', ')}`
        : null,
    ].filter(Boolean);
    if (identifiers.length > 0) {
      lines.push(`- Identificadores: ${identifiers.join(' | ')}`);
    }

    const paymentLink = this.truncatePromptText(product.paymentLink, 160);
    const salesPageUrl = this.truncatePromptText(product.salesPageUrl, 160);
    const thankyouUrl = this.truncatePromptText(product.thankyouUrl, 140);
    const thankyouPixUrl = this.truncatePromptText(product.thankyouPixUrl, 140);
    const thankyouBoletoUrl = this.truncatePromptText(product.thankyouBoletoUrl, 140);
    const reclameAquiUrl = this.truncatePromptText(product.reclameAquiUrl, 140);

    const channels = [
      paymentLink ? `pagamento ${paymentLink}` : null,
      salesPageUrl ? `sales page ${salesPageUrl}` : null,
      thankyouUrl ? `thank you ${thankyouUrl}` : null,
      thankyouPixUrl ? `thank you pix ${thankyouPixUrl}` : null,
      thankyouBoletoUrl ? `thank you boleto ${thankyouBoletoUrl}` : null,
      reclameAquiUrl ? `Reclame Aqui ${reclameAquiUrl}` : null,
    ].filter(Boolean);
    if (channels.length > 0) {
      lines.push(`- Canais oficiais: ${channels.join(' | ')}`);
    }

    const operations = [
      product.supportEmail ? `suporte ${safeStr(product.supportEmail)}` : null,
      Number.isFinite(Number(product.warrantyDays))
        ? `garantia ${Number(product.warrantyDays)} dias`
        : null,
      product.shippingType ? `frete ${safeStr(product.shippingType)}` : null,
      Number.isFinite(Number(product.shippingValue))
        ? `frete ${this.formatPromptCurrency(product.shippingValue, product.currency)}`
        : null,
      product.trackStock ? `estoque rastreado (${Number(product.stockQuantity || 0)})` : null,
    ].filter(Boolean);
    if (operations.length > 0) {
      lines.push(`- Operação: ${operations.join(' | ')}`);
    }

    const affiliate = [
      product.affiliateEnabled ? 'programa de afiliados ativo' : null,
      product.affiliateVisible ? 'visível para afiliados' : null,
      product.affiliateAutoApprove ? 'autoaprovação ligada' : null,
      Number.isFinite(Number(product.commissionPercent))
        ? `comissão ${Number(product.commissionPercent)}%`
        : null,
      product.commissionType ? `modelo ${safeStr(product.commissionType)}` : null,
      Number.isFinite(Number(product.commissionCookieDays))
        ? `cookie ${Number(product.commissionCookieDays)} dias`
        : null,
    ].filter(Boolean);
    if (affiliate.length > 0) {
      lines.push(`- Afiliados: ${affiliate.join(' | ')}`);
    }

    const plans = this.buildProductPlanContext(product.plans);
    if (plans) {
      lines.push(`- Planos ativos:\n${plans}`);
    }

    const checkouts = this.buildProductCheckoutContext(product.checkouts);
    if (checkouts) {
      lines.push(`- Checkout principal:\n${checkouts}`);
    }

    const coupons = this.buildProductCouponContext(product.coupons, product.currency);
    if (coupons) {
      lines.push(`- Cupons ativos:\n${coupons}`);
    }

    const campaigns = this.buildProductCampaignContext(product.campaigns);
    if (campaigns) {
      lines.push(`- Campanhas:\n${campaigns}`);
    }

    const commissions = this.buildProductCommissionContext(product.commissions);
    if (commissions) {
      lines.push(`- Comissionamentos configurados:\n${commissions}`);
    }

    const urls = this.buildProductUrlContext(product.urls);
    if (urls) {
      lines.push(`- URLs rastreadas:\n${urls}`);
    }

    const reviews = this.buildProductReviewContext(product.reviews);
    if (reviews) {
      lines.push(`- Prova social recente:\n${reviews}`);
    }

    const marketing = this.buildProductMarketingContext(product.aiConfig);
    if (marketing) {
      lines.push(`- Inteligência comercial configurada:\n${marketing}`);
    }

    const aiConfigObj = product.aiConfig as Record<string, unknown> | undefined;
    const technicalInfo = this.compactJsonForPrompt(aiConfigObj?.technicalInfo, 220);
    if (technicalInfo) {
      lines.push(`- Técnica/compliance: ${technicalInfo}`);
    }

    const merchandContent = this.truncatePromptText(product.merchandContent, 180);
    if (merchandContent) {
      lines.push(`- Materiais para afiliados: ${merchandContent}`);
    }

    const affiliateTerms = this.truncatePromptText(product.affiliateTerms, 180);
    if (affiliateTerms) {
      lines.push(`- Termos de afiliado: ${affiliateTerms}`);
    }

    const afterPay = [
      product.afterPayDuplicateAddress ? 'bloqueia endereço duplicado' : null,
      product.afterPayAffiliateCharge ? 'cobra taxa pós-pagamento do afiliado' : null,
      Number.isFinite(Number(product.afterPayChargeValue))
        ? `taxa ${this.formatPromptCurrency(product.afterPayChargeValue, product.currency)}`
        : null,
      product.afterPayShippingProvider
        ? `transportadora ${safeStr(product.afterPayShippingProvider)}`
        : null,
    ].filter(Boolean);
    if (afterPay.length > 0) {
      lines.push(`- Regras pós-pagamento: ${afterPay.join(' | ')}`);
    }

    return lines.join('\n');
  }

  buildWorkspaceBusinessHoursContext(businessHours: unknown): string | null {
    if (!businessHours || typeof businessHours !== 'object') return null;
    const bh = businessHours as Record<string, unknown>;

    const bhWeekday = bh.weekday as Record<string, unknown> | undefined;
    const bhSaturday = bh.saturday as Record<string, unknown> | undefined;
    const bhSunday = bh.sunday as Record<string, unknown> | undefined;
    const weekday = bhWeekday
      ? `${safeStr(bhWeekday.start, '--')}-${safeStr(bhWeekday.end, '--')}`
      : null;
    const saturday = bhSaturday
      ? `${safeStr(bhSaturday.start, '--')}-${safeStr(bhSaturday.end, '--')}`
      : null;
    const sunday = bhSunday
      ? `${safeStr(bhSunday.start, '--')}-${safeStr(bhSunday.end, '--')}`
      : null;

    const parts = [
      weekday ? `dias úteis ${weekday}` : null,
      saturday ? `sábado ${saturday}` : null,
      sunday ? `domingo ${sunday}` : 'domingo fechado',
    ].filter(Boolean);

    if (parts.length === 0) return null;
    return parts.join(' | ');
  }

  buildWorkspaceIntegrationContext(integrations: unknown): string | null {
    if (!Array.isArray(integrations) || integrations.length === 0) return null;

    return integrations
      .slice(0, this.limits.workspaceIntegrationContextLimit)
      .map((integration) => {
        const parts = [
          integration.type || integration.name,
          integration.name && integration.name !== integration.type ? integration.name : null,
          integration.isActive ? 'ativa' : 'inativa',
        ].filter(Boolean);

        return `- ${parts.join(' | ')}`;
      })
      .join('\n');
  }

  buildWorkspaceBillingContext(params: {
    subscription?: unknown;
    invoices?: unknown;
    providerSettings?: Record<string, unknown> | null;
    stripeCustomerId?: string | null;
  }): string | null {
    const { invoices, providerSettings, stripeCustomerId } = params;
    const sub = (
      params.subscription && typeof params.subscription === 'object' ? params.subscription : null
    ) as Record<string, unknown> | null;
    const lines: string[] = [];

    if (sub) {
      const renewal = this.formatPromptDate(sub.currentPeriodEnd);
      lines.push(
        [
          '- Assinatura:',
          sub.plan ? `plano ${safeStr(sub.plan)}` : null,
          sub.status ? `status ${safeStr(sub.status)}` : null,
          renewal ? `renovação ${renewal}` : null,
          sub.cancelAtPeriodEnd ? 'cancela no fim do ciclo' : null,
        ]
          .filter(Boolean)
          .join(' | '),
      );
    } else if (stripeCustomerId || providerSettings?.subscriptionStatus || providerSettings?.plan) {
      lines.push(
        [
          '- Assinatura:',
          providerSettings?.plan ? `plano ${safeStr(providerSettings.plan)}` : null,
          providerSettings?.subscriptionStatus
            ? `status ${safeStr(providerSettings.subscriptionStatus)}`
            : null,
          providerSettings?.billingSuspended ? 'billing suspenso' : null,
        ]
          .filter(Boolean)
          .join(' | '),
      );
    } else {
      lines.push('- Assinatura: sem assinatura registrada');
    }

    const relevantInvoices = Array.isArray(invoices)
      ? invoices.slice(0, this.limits.workspaceInvoiceContextLimit)
      : [];
    if (relevantInvoices.length > 0) {
      lines.push(
        `- Faturas recentes:\n${relevantInvoices
          .map((invoiceRaw: unknown) => {
            const invoice = (
              invoiceRaw && typeof invoiceRaw === 'object' ? invoiceRaw : {}
            ) as Record<string, unknown>;
            const amount = this.formatPromptCurrency(Number(invoice.amount || 0) / 100, 'BRL');
            const when = this.formatPromptDate(invoice.createdAt);
            return `  - ${safeStr(invoice.status)} | ${amount}${when ? ` | ${when}` : ''}`;
          })
          .join('\n')}`,
      );
    }

    if (lines.length === 0) return null;
    return lines.join('\n');
  }

  buildWorkspaceExternalPaymentLinkContext(links: unknown): string | null {
    if (!Array.isArray(links) || links.length === 0) return null;

    return links
      .slice(0, this.limits.workspaceExternalLinkContextLimit)
      .map((link) => {
        const lastSaleAt = this.formatPromptDate(link.lastSaleAt);
        const parts = [
          link.platform,
          link.productName,
          this.formatPromptCurrency(link.price, 'BRL'),
          Number.isFinite(Number(link.totalSales)) ? `${Number(link.totalSales)} vendas` : null,
          Number.isFinite(Number(link.totalRevenue))
            ? `${this.formatPromptCurrency(link.totalRevenue, 'BRL')} faturados`
            : null,
          lastSaleAt ? `última venda ${lastSaleAt}` : null,
        ].filter(Boolean);

        return `- ${parts.join(' | ')}`;
      })
      .join('\n');
  }

  private buildAffiliateEntryHeader(entry: Record<string, unknown>): string[] {
    const status = typeof entry.status === 'string' ? entry.status : null;
    const approvalMode = typeof entry.approvalMode === 'string' ? entry.approvalMode : null;
    return [
      typeof entry.productName === 'string' ? entry.productName : null,
      status ? `status ${status}` : null,
      Number.isFinite(Number(entry.commissionPct))
        ? `comissão ${Number(entry.commissionPct)}%`
        : null,
      typeof entry.commissionType === 'string' ? entry.commissionType : null,
      Number.isFinite(Number(entry.cookieDays)) ? `cookie ${Number(entry.cookieDays)} dias` : null,
      approvalMode ? `aprovação ${approvalMode}` : null,
      Number.isFinite(Number(entry.temperature))
        ? `temperatura ${Number(entry.temperature)}`
        : null,
    ].filter((value): value is string => typeof value === 'string' && value.length > 0);
  }

  private buildAffiliateEntryOffer(entry: Record<string, unknown>): string[] {
    const category = typeof entry.category === 'string' ? entry.category : null;
    const description = typeof entry.description === 'string' ? entry.description : null;
    return [
      entry.price ? this.formatPromptCurrency(entry.price, entry.currency || 'BRL') : null,
      category ? `categoria ${category}` : null,
      description ? this.truncatePromptText(description, 120) : null,
    ].filter((value): value is string => typeof value === 'string' && value.length > 0);
  }

  private buildAffiliateEntryPerformance(entry: Record<string, unknown>): string[] {
    return [
      Number.isFinite(Number(entry.linkClicks)) ? `${Number(entry.linkClicks)} clique(s)` : null,
      Number.isFinite(Number(entry.linkSales)) ? `${Number(entry.linkSales)} venda(s)` : null,
      Number.isFinite(Number(entry.linkRevenue))
        ? `${this.formatPromptCurrency(entry.linkRevenue, 'BRL')} receita`
        : null,
      Number.isFinite(Number(entry.linkCommissionEarned))
        ? `${this.formatPromptCurrency(entry.linkCommissionEarned, 'BRL')} comissão`
        : null,
    ].filter((value): value is string => typeof value === 'string' && value.length > 0);
  }

  private formatAffiliateEntry(entry: Record<string, unknown>): string {
    const lines = [`- ${this.buildAffiliateEntryHeader(entry).join(' | ')}`];

    const offer = this.buildAffiliateEntryOffer(entry);
    if (offer.length > 0) lines.push(`  Oferta: ${offer.join(' | ')}`);

    const performance = this.buildAffiliateEntryPerformance(entry);
    if (performance.length > 0) lines.push(`  Performance: ${performance.join(' | ')}`);

    const code = this.truncatePromptText(entry.affiliateCode, 80);
    if (code) lines.push(`  Código/link afiliado: ${code}`);

    const promo = this.compactJsonForPrompt(entry.promoMaterials, 180);
    if (promo) lines.push(`  Materiais promocionais: ${promo}`);

    return lines.join('\n');
  }

  buildWorkspaceAffiliateContext(entries: unknown): string | null {
    if (!Array.isArray(entries) || entries.length === 0) return null;

    return entries
      .slice(0, this.limits.workspaceAffiliateContextLimit)
      .map((entry) => this.formatAffiliateEntry(entry))
      .join('\n');
  }

  buildWorkspaceAffiliatePartnerContext(partners: unknown): string | null {
    if (!Array.isArray(partners) || partners.length === 0) return null;

    return partners
      .slice(0, this.limits.workspaceAffiliatePartnerContextLimit)
      .map((partner) => {
        const label = this.truncatePromptText(partner.partnerName, 40) || 'parceiro';
        const parts = [
          label,
          partner.type ? `tipo ${partner.type}` : null,
          partner.status ? `status ${partner.status}` : null,
          Number.isFinite(Number(partner.commissionRate))
            ? `comissão ${Number(partner.commissionRate)}%`
            : null,
          Number.isFinite(Number(partner.totalSales))
            ? `${Number(partner.totalSales)} vendas`
            : null,
          Number.isFinite(Number(partner.totalCommission))
            ? `${this.formatPromptCurrency(partner.totalCommission, 'BRL')} comissão`
            : null,
        ].filter(Boolean);

        return `- ${parts.join(' | ')}`;
      })
      .join('\n');
  }

  buildWorkspaceCustomerSubscriptionContext(subscriptions: unknown): string | null {
    if (!Array.isArray(subscriptions) || subscriptions.length === 0) return null;

    const statusCounts = subscriptions.reduce<Record<string, number>>((acc, item) => {
      const key = String(item.status || 'UNKNOWN').toUpperCase();
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    const summary = Object.entries(statusCounts)
      .map(([status, count]) => `${count} ${status}`)
      .join(' | ');

    const highlights = subscriptions
      .slice(0, this.limits.workspaceCustomerSubscriptionContextLimit)
      .map((subscription) => {
        const nextBillingAt = this.formatPromptDate(subscription.nextBillingAt);
        const parts = [
          subscription.planName,
          subscription.productId ? `produto ${subscription.productId}` : null,
          this.formatPromptCurrency(subscription.amount, subscription.currency || 'BRL'),
          subscription.interval ? subscription.interval : null,
          subscription.status ? subscription.status : null,
          nextBillingAt ? `próx. cobrança ${nextBillingAt}` : null,
        ].filter(Boolean);

        return `  - ${parts.join(' | ')}`;
      })
      .join('\n');

    return [`- Assinaturas de clientes: ${summary}`, highlights ? highlights : null]
      .filter(Boolean)
      .join('\n');
  }

  buildWorkspacePhysicalOrderContext(orders: unknown): string | null {
    if (!Array.isArray(orders) || orders.length === 0) return null;

    const statusCounts = orders.reduce<Record<string, number>>((acc, item) => {
      const key = String(item.status || 'UNKNOWN').toUpperCase();
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    const summary = Object.entries(statusCounts)
      .map(([status, count]) => `${count} ${status}`)
      .join(' | ');

    const highlights = orders
      .slice(0, this.limits.workspacePhysicalOrderContextLimit)
      .map((order) => {
        const createdAt = this.formatPromptDate(order.createdAt);
        const parts = [
          order.productName,
          order.status,
          order.paymentStatus ? `pagamento ${order.paymentStatus}` : null,
          order.shippingMethod ? `frete ${order.shippingMethod}` : null,
          createdAt ? `criado ${createdAt}` : null,
        ].filter(Boolean);

        return `  - ${parts.join(' | ')}`;
      })
      .join('\n');

    return [`- Pedidos físicos: ${summary}`, highlights ? highlights : null]
      .filter(Boolean)
      .join('\n');
  }

  buildWorkspacePaymentContext(payments: unknown): string | null {
    if (!Array.isArray(payments) || payments.length === 0) return null;

    const statusCounts = payments.reduce<Record<string, number>>((acc, item) => {
      const key = String(item.status || 'UNKNOWN').toUpperCase();
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    const summary = Object.entries(statusCounts)
      .map(([status, count]) => `${count} ${status}`)
      .join(' | ');

    const highlights = payments
      .slice(0, this.limits.workspacePaymentContextLimit)
      .map((payment) => {
        const paymentDate = this.formatPromptDate(payment.paidAt || payment.createdAt);
        const parts = [
          payment.provider,
          payment.method ? payment.method : null,
          payment.status,
          this.formatPromptCurrency(payment.amount, payment.currency || 'BRL'),
          paymentDate || null,
        ].filter(Boolean);

        return `  - ${parts.join(' | ')}`;
      })
      .join('\n');

    return [`- Pagamentos recentes: ${summary}`, highlights ? highlights : null]
      .filter(Boolean)
      .join('\n');
  }

  buildAgentProfileContext(agent: unknown): string | null {
    if (!agent || typeof agent !== 'object') return null;
    const a = agent as Record<string, unknown>;

    const persona = a.persona as Record<string, unknown> | undefined;
    const lines: string[] = [];
    const identity = [
      a.publicName ? `nome público ${safeStr(a.publicName)}` : null,
      a.phone ? `telefone ${safeStr(a.phone)}` : null,
      a.provider ? `login ${safeStr(a.provider)}` : null,
      a.emailVerified === true ? 'email verificado' : 'email não verificado',
      a.isOnline === true ? 'online' : 'offline',
    ].filter(Boolean);
    if (identity.length > 0) {
      lines.push(`- Conta do operador: ${identity.join(' | ')}`);
    }

    const role = [
      a.role ? `role ${safeStr(a.role)}` : null,
      a.displayRole ? `display ${safeStr(a.displayRole)}` : null,
      persona?.name ? `persona ${safeStr(persona.name)}` : null,
      persona?.role ? `função da persona ${safeStr(persona.role)}` : null,
    ].filter(Boolean);
    if (role.length > 0) {
      lines.push(`- Papel e identidade: ${role.join(' | ')}`);
    }

    const presence = [
      a.website ? `site ${safeStr(a.website)}` : null,
      a.instagram ? `instagram ${safeStr(a.instagram)}` : null,
    ].filter(Boolean);
    if (presence.length > 0) {
      lines.push(`- Presença pública: ${presence.join(' | ')}`);
    }

    const bio = this.truncatePromptText(a.bio, 180);
    if (bio) {
      lines.push(`- Bio do operador: ${bio}`);
    }

    const kycRejectedReason = this.truncatePromptText(a.kycRejectedReason, 120);
    const kycSubmittedAt = this.formatPromptDate(a.kycSubmittedAt);
    const kycApprovedAt = this.formatPromptDate(a.kycApprovedAt);
    const kyc = [
      a.kycStatus ? `status ${safeStr(a.kycStatus)}` : null,
      kycSubmittedAt ? `enviado ${kycSubmittedAt}` : null,
      kycApprovedAt ? `aprovado ${kycApprovedAt}` : null,
      kycRejectedReason ? `motivo ${kycRejectedReason}` : null,
    ].filter(Boolean);
    if (kyc.length > 0) {
      lines.push(`- KYC: ${kyc.join(' | ')}`);
    }

    const permissions = Array.isArray(a.permissions)
      ? (a.permissions as unknown[])
          .slice(0, 10)
          .map((p) => safeStr(p))
          .join(', ')
      : '';
    if (permissions) {
      lines.push(`- Permissões ativas: ${permissions}`);
    }

    if (lines.length === 0) return null;
    return lines.join('\n');
  }
}
