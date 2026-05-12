import { KloelContextBaseFormatter } from './kloel-context-base-formatter';
import type { KloelContextFormatterLimits } from './kloel-context-formatter.types';

type PromptRecord = Record<string, unknown>;

function isPromptRecord(value: unknown): value is PromptRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function promptRecords(values: unknown): PromptRecord[] {
  return Array.isArray(values) ? values.filter(isPromptRecord) : [];
}

function promptString(record: PromptRecord, key: string): string | null {
  const value = record[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function promptNumber(record: PromptRecord, key: string): number {
  const value = Number(record[key] ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function hasPromptNumber(record: PromptRecord, key: string): boolean {
  return Number.isFinite(Number(record[key]));
}

function countByStatus(records: PromptRecord[]): Record<string, number> {
  return records.reduce<Record<string, number>>((acc, item) => {
    const key = (promptString(item, 'status') ?? 'UNKNOWN').toUpperCase();
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

export class KloelWorkspaceCommerceContextFormatter {
  constructor(
    protected base: KloelContextBaseFormatter,
    protected limits: KloelContextFormatterLimits,
  ) {}

  private buildAffiliateEntryHeader(entry: PromptRecord): string[] {
    const status = promptString(entry, 'status');
    const approvalMode = promptString(entry, 'approvalMode');
    return [
      promptString(entry, 'productName'),
      status ? `status ${status}` : null,
      hasPromptNumber(entry, 'commissionPct')
        ? `comissão ${promptNumber(entry, 'commissionPct')}%`
        : null,
      promptString(entry, 'commissionType'),
      hasPromptNumber(entry, 'cookieDays')
        ? `cookie ${promptNumber(entry, 'cookieDays')} dias`
        : null,
      approvalMode ? `aprovação ${approvalMode}` : null,
      hasPromptNumber(entry, 'temperature')
        ? `temperatura ${promptNumber(entry, 'temperature')}`
        : null,
    ].filter((value): value is string => typeof value === 'string' && value.length > 0);
  }

  private buildAffiliateEntryOffer(entry: PromptRecord): string[] {
    const category = promptString(entry, 'category');
    const description = promptString(entry, 'description');
    return [
      entry.price ? this.base.formatPromptCurrency(entry.price, entry.currency || 'BRL') : null,
      category ? `categoria ${category}` : null,
      description ? this.base.truncatePromptText(description, 120) : null,
    ].filter((value): value is string => typeof value === 'string' && value.length > 0);
  }

  private buildAffiliateEntryPerformance(entry: PromptRecord): string[] {
    return [
      hasPromptNumber(entry, 'linkClicks')
        ? `${promptNumber(entry, 'linkClicks')} clique(s)`
        : null,
      hasPromptNumber(entry, 'linkSales') ? `${promptNumber(entry, 'linkSales')} venda(s)` : null,
      hasPromptNumber(entry, 'linkRevenue')
        ? `${this.base.formatPromptCurrency(entry.linkRevenue, 'BRL')} receita`
        : null,
      hasPromptNumber(entry, 'linkCommissionEarned')
        ? `${this.base.formatPromptCurrency(entry.linkCommissionEarned, 'BRL')} comissão`
        : null,
    ].filter((value): value is string => typeof value === 'string' && value.length > 0);
  }

  private formatAffiliateEntry(entry: PromptRecord): string {
    const lines = [`- ${this.buildAffiliateEntryHeader(entry).join(' | ')}`];
    const offer = this.buildAffiliateEntryOffer(entry);
    if (offer.length > 0) {
      lines.push(`  Oferta: ${offer.join(' | ')}`);
    }
    const performance = this.buildAffiliateEntryPerformance(entry);
    if (performance.length > 0) {
      lines.push(`  Performance: ${performance.join(' | ')}`);
    }
    const code = this.base.truncatePromptText(promptString(entry, 'affiliateCode'), 80);
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
    const records = promptRecords(entries);
    if (records.length === 0) {
      return null;
    }
    return records
      .slice(0, this.limits.workspaceAffiliateContextLimit)
      .map((entry) => this.formatAffiliateEntry(entry))
      .join('\n');
  }

  buildWorkspaceAffiliatePartnerContext(partners: unknown): string | null {
    const records = promptRecords(partners);
    if (records.length === 0) {
      return null;
    }
    return records
      .slice(0, this.limits.workspaceAffiliatePartnerContextLimit)
      .map((partner) => {
        const label =
          this.base.truncatePromptText(promptString(partner, 'partnerName'), 40) || 'parceiro';
        const parts = [
          label,
          promptString(partner, 'type') ? `tipo ${promptString(partner, 'type')}` : null,
          promptString(partner, 'status') ? `status ${promptString(partner, 'status')}` : null,
          hasPromptNumber(partner, 'commissionRate')
            ? `comissão ${promptNumber(partner, 'commissionRate')}%`
            : null,
          hasPromptNumber(partner, 'totalSales')
            ? `${promptNumber(partner, 'totalSales')} vendas`
            : null,
          hasPromptNumber(partner, 'totalCommission')
            ? `${this.base.formatPromptCurrency(partner.totalCommission, 'BRL')} comissão`
            : null,
        ].filter(Boolean);
        return `- ${parts.join(' | ')}`;
      })
      .join('\n');
  }

  buildWorkspaceCustomerSubscriptionContext(subscriptions: unknown): string | null {
    const records = promptRecords(subscriptions);
    if (records.length === 0) {
      return null;
    }
    const summary = Object.entries(countByStatus(records))
      .map(([status, count]) => `${count} ${status}`)
      .join(' | ');
    const highlights = records
      .slice(0, this.limits.workspaceCustomerSubscriptionContextLimit)
      .map((subscription) => {
        const nextBillingAt = this.base.formatPromptDate(subscription.nextBillingAt);
        const parts = [
          promptString(subscription, 'planName'),
          promptString(subscription, 'productId')
            ? `produto ${promptString(subscription, 'productId')}`
            : null,
          this.base.formatPromptCurrency(subscription.amount, subscription.currency || 'BRL'),
          promptString(subscription, 'interval'),
          promptString(subscription, 'status'),
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
    const records = promptRecords(orders);
    if (records.length === 0) {
      return null;
    }
    const summary = Object.entries(countByStatus(records))
      .map(([status, count]) => `${count} ${status}`)
      .join(' | ');
    const highlights = records
      .slice(0, this.limits.workspacePhysicalOrderContextLimit)
      .map((order) => {
        const createdAt = this.base.formatPromptDate(order.createdAt);
        const parts = [
          promptString(order, 'productName'),
          promptString(order, 'status'),
          promptString(order, 'paymentStatus')
            ? `pagamento ${promptString(order, 'paymentStatus')}`
            : null,
          promptString(order, 'shippingMethod')
            ? `frete ${promptString(order, 'shippingMethod')}`
            : null,
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
    const records = promptRecords(payments);
    if (records.length === 0) {
      return null;
    }
    const summary = Object.entries(countByStatus(records))
      .map(([status, count]) => `${count} ${status}`)
      .join(' | ');
    const highlights = records
      .slice(0, this.limits.workspacePaymentContextLimit)
      .map((payment) => {
        const paymentDate = this.base.formatPromptDate(payment.paidAt || payment.createdAt);
        const parts = [
          promptString(payment, 'provider'),
          promptString(payment, 'method'),
          promptString(payment, 'status'),
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
