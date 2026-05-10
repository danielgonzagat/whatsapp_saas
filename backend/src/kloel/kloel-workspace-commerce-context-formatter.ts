import { KloelContextBaseFormatter } from './kloel-context-base-formatter';
import type { KloelContextFormatterLimits } from './kloel-context-formatter.types';

export class KloelWorkspaceCommerceContextFormatter {
  constructor(protected base: KloelContextBaseFormatter, protected limits: KloelContextFormatterLimits) {}

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
      entry.price ? this.base.formatPromptCurrency(entry.price, entry.currency || 'BRL') : null,
      category ? `categoria ${category}` : null,
      description ? this.base.truncatePromptText(description, 120) : null,
    ].filter((value): value is string => typeof value === 'string' && value.length > 0);
  }

  private buildAffiliateEntryPerformance(entry: Record<string, unknown>): string[] {
    return [
      Number.isFinite(Number(entry.linkClicks)) ? `${Number(entry.linkClicks)} clique(s)` : null,
      Number.isFinite(Number(entry.linkSales)) ? `${Number(entry.linkSales)} venda(s)` : null,
      Number.isFinite(Number(entry.linkRevenue))
        ? `${this.base.formatPromptCurrency(entry.linkRevenue, 'BRL')} receita`
        : null,
      Number.isFinite(Number(entry.linkCommissionEarned))
        ? `${this.base.formatPromptCurrency(entry.linkCommissionEarned, 'BRL')} comissão`
        : null,
    ].filter((value): value is string => typeof value === 'string' && value.length > 0);
  }

  private formatAffiliateEntry(entry: Record<string, unknown>): string {
    const lines = [`- ${this.buildAffiliateEntryHeader(entry).join(' | ')}`];
    const offer = this.buildAffiliateEntryOffer(entry);
    if (offer.length > 0) {
      lines.push(`  Oferta: ${offer.join(' | ')}`);
    }
    const performance = this.buildAffiliateEntryPerformance(entry);
    if (performance.length > 0) {
      lines.push(`  Performance: ${performance.join(' | ')}`);
    }
    const code = this.base.truncatePromptText(entry.affiliateCode, 80);
    if (code) {
      lines.push(`  Código/link afiliado: ${code}`);
    }
    const promo = this.base.compactJsonForPrompt(entry.promoMaterials, 180);
    if (promo) {
      lines.push(`  Materiais promocionais: ${promo}`);
    }
    return lines.join('\n');
  }

  buildWorkspaceAffiliateContext(entries: unknown): string | null {
    if (!Array.isArray(entries) || entries.length === 0) {
      return null;
    }
    return entries
      .slice(0, this.limits.workspaceAffiliateContextLimit)
      .map((entry) => this.formatAffiliateEntry(entry))
      .join('\n');
  }

  buildWorkspaceAffiliatePartnerContext(partners: unknown): string | null {
    if (!Array.isArray(partners) || partners.length === 0) {
      return null;
    }
    return partners
      .slice(0, this.limits.workspaceAffiliatePartnerContextLimit)
      .map((partner) => {
        const label = this.base.truncatePromptText(partner.partnerName, 40) || 'parceiro';
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
            ? `${this.base.formatPromptCurrency(partner.totalCommission, 'BRL')} comissão`
            : null,
        ].filter(Boolean);
        return `- ${parts.join(' | ')}`;
      })
      .join('\n');
  }

  buildWorkspaceCustomerSubscriptionContext(subscriptions: unknown): string | null {
    if (!Array.isArray(subscriptions) || subscriptions.length === 0) {
      return null;
    }
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
        const nextBillingAt = this.base.formatPromptDate(subscription.nextBillingAt);
        const parts = [
          subscription.planName,
          subscription.productId ? `produto ${subscription.productId}` : null,
          this.base.formatPromptCurrency(subscription.amount, subscription.currency || 'BRL'),
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
    if (!Array.isArray(orders) || orders.length === 0) {
      return null;
    }
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
        const createdAt = this.base.formatPromptDate(order.createdAt);
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
    if (!Array.isArray(payments) || payments.length === 0) {
      return null;
    }
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
        const paymentDate = this.base.formatPromptDate(payment.paidAt || payment.createdAt);
        const parts = [
          payment.provider,
          payment.method ? payment.method : null,
          payment.status,
          this.base.formatPromptCurrency(payment.amount, payment.currency || 'BRL'),
          paymentDate || null,
        ].filter(Boolean);
        return `  - ${parts.join(' | ')}`;
      })
      .join('\n');
    return [`- Pagamentos recentes: ${summary}`, highlights ? highlights : null]
      .filter(Boolean)
      .join('\n');
  }
}
