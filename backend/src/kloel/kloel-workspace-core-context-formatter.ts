import { KloelContextBaseFormatter } from './kloel-context-base-formatter';
import type { KloelContextFormatterLimits } from './kloel-context-formatter.types';

export const S_RE = /\s+/g;

export class KloelWorkspaceCoreContextFormatter {
  constructor(
    protected base: KloelContextBaseFormatter,
    protected limits: KloelContextFormatterLimits,
  ) {}

  private safeStr(v: unknown, fb = ''): string {
    return typeof v === 'string'
      ? v
      : typeof v === 'number' || typeof v === 'boolean'
        ? String(v)
        : fb;
  }

  buildWorkspaceBusinessHoursContext(businessHours: unknown): string | null {
    if (!businessHours || typeof businessHours !== 'object') {
      return null;
    }
    const bh = businessHours as Record<string, unknown>;
    const bhWeekday = bh.weekday as Record<string, unknown> | undefined;
    const bhSaturday = bh.saturday as Record<string, unknown> | undefined;
    const bhSunday = bh.sunday as Record<string, unknown> | undefined;
    const weekday = bhWeekday
      ? `${this.safeStr(bhWeekday.start, '--')}-${this.safeStr(bhWeekday.end, '--')}`
      : null;
    const saturday = bhSaturday
      ? `${this.safeStr(bhSaturday.start, '--')}-${this.safeStr(bhSaturday.end, '--')}`
      : null;
    const sunday = bhSunday
      ? `${this.safeStr(bhSunday.start, '--')}-${this.safeStr(bhSunday.end, '--')}`
      : null;
    const parts = [
      weekday ? `dias úteis ${weekday}` : null,
      saturday ? `sábado ${saturday}` : null,
      sunday ? `domingo ${sunday}` : 'domingo fechado',
    ].filter(Boolean);
    if (parts.length === 0) {
      return null;
    }
    return parts.join(' | ');
  }

  buildWorkspaceIntegrationContext(integrations: unknown): string | null {
    if (!Array.isArray(integrations) || integrations.length === 0) {
      return null;
    }
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
      const renewal = this.base.formatPromptDate(sub.currentPeriodEnd);
      lines.push(
        [
          '- Assinatura:',
          sub.plan ? `plano ${this.safeStr(sub.plan)}` : null,
          sub.status ? `status ${this.safeStr(sub.status)}` : null,
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
          providerSettings?.plan ? `plano ${this.safeStr(providerSettings.plan)}` : null,
          providerSettings?.subscriptionStatus
            ? `status ${this.safeStr(providerSettings.subscriptionStatus)}`
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
            const amount = this.base.formatPromptCurrency(Number(invoice.amount || 0) / 100, 'BRL');
            const when = this.base.formatPromptDate(invoice.createdAt);
            return `  - ${this.safeStr(invoice.status)} | ${amount}${when ? ` | ${when}` : ''}`;
          })
          .join('\n')}`,
      );
    }
    if (lines.length === 0) {
      return null;
    }
    return lines.join('\n');
  }

  buildWorkspaceExternalPaymentLinkContext(links: unknown): string | null {
    if (!Array.isArray(links) || links.length === 0) {
      return null;
    }
    return links
      .slice(0, this.limits.workspaceExternalLinkContextLimit)
      .map((link) => {
        const lastSaleAt = this.base.formatPromptDate(link.lastSaleAt);
        const parts = [
          link.platform,
          link.productName,
          this.base.formatPromptCurrency(link.price, 'BRL'),
          Number.isFinite(Number(link.totalSales)) ? `${Number(link.totalSales)} vendas` : null,
          Number.isFinite(Number(link.totalRevenue))
            ? `${this.base.formatPromptCurrency(link.totalRevenue, 'BRL')} faturados`
            : null,
          lastSaleAt ? `última venda ${lastSaleAt}` : null,
        ].filter(Boolean);
        return `- ${parts.join(' | ')}`;
      })
      .join('\n');
  }

  buildAgentProfileContext(agent: unknown): string | null {
    if (!agent || typeof agent !== 'object') {
      return null;
    }
    const a = agent as Record<string, unknown>;
    const persona = a.persona as Record<string, unknown> | undefined;
    const lines: string[] = [];
    const identity = [
      a.publicName ? `nome público ${this.safeStr(a.publicName)}` : null,
      a.phone ? `telefone ${this.safeStr(a.phone)}` : null,
      a.provider ? `login ${this.safeStr(a.provider)}` : null,
      a.emailVerified === true ? 'email verificado' : 'email não verificado',
      a.isOnline === true ? 'online' : 'offline',
    ].filter(Boolean);
    if (identity.length > 0) {
      lines.push(`- Conta do operador: ${identity.join(' | ')}`);
    }
    const role = [
      a.role ? `role ${this.safeStr(a.role)}` : null,
      a.displayRole ? `display ${this.safeStr(a.displayRole)}` : null,
      persona?.name ? `persona ${this.safeStr(persona.name)}` : null,
      persona?.role ? `função da persona ${this.safeStr(persona.role)}` : null,
    ].filter(Boolean);
    if (role.length > 0) {
      lines.push(`- Papel e identidade: ${role.join(' | ')}`);
    }
    const presence = [
      a.website ? `site ${this.safeStr(a.website)}` : null,
      a.instagram ? `instagram ${this.safeStr(a.instagram)}` : null,
    ].filter(Boolean);
    if (presence.length > 0) {
      lines.push(`- Presença pública: ${presence.join(' | ')}`);
    }
    const bio = this.base.truncatePromptText(a.bio, 180);
    if (bio) {
      lines.push(`- Bio do operador: ${bio}`);
    }
    const kycRejectedReason = this.base.truncatePromptText(a.kycRejectedReason, 120);
    const kycSubmittedAt = this.base.formatPromptDate(a.kycSubmittedAt);
    const kycApprovedAt = this.base.formatPromptDate(a.kycApprovedAt);
    const kyc = [
      a.kycStatus ? `status ${this.safeStr(a.kycStatus)}` : null,
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
          .map((p) => this.safeStr(p))
          .join(', ')
      : '';
    if (permissions) {
      lines.push(`- Permissões ativas: ${permissions}`);
    }
    if (lines.length === 0) {
      return null;
    }
    return lines.join('\n');
  }
}
