import { KloelContextBaseFormatter } from './kloel-context-base-formatter';
import type { KloelContextFormatterLimits } from './kloel-context-formatter.types';

type PromptRecord = Record<string, unknown>;

function isPromptRecord(value: unknown): value is PromptRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function promptRecords(values: unknown): PromptRecord[] {
  return Array.isArray(values) ? values.filter(isPromptRecord) : [];
}

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
    if (!isPromptRecord(businessHours)) {
      return null;
    }
    const bh = businessHours;
    const bhWeekday = isPromptRecord(bh.weekday) ? bh.weekday : undefined;
    const bhSaturday = isPromptRecord(bh.saturday) ? bh.saturday : undefined;
    const bhSunday = isPromptRecord(bh.sunday) ? bh.sunday : undefined;
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
    const integrationRecords = promptRecords(integrations);
    if (integrationRecords.length === 0) {
      return null;
    }
    return integrationRecords
      .slice(0, this.limits.workspaceIntegrationContextLimit)
      .map((integration) => {
        const type = this.safeStr(integration.type);
        const name = this.safeStr(integration.name);
        const parts = [
          type || name,
          name && name !== type ? name : null,
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
    const sub = isPromptRecord(params.subscription) ? params.subscription : null;
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
    const relevantInvoices = promptRecords(invoices).slice(
      0,
      this.limits.workspaceInvoiceContextLimit,
    );
    if (relevantInvoices.length > 0) {
      lines.push(
        `- Faturas recentes:\n${relevantInvoices
          .map((invoice) => {
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
    const linkRecords = promptRecords(links);
    if (linkRecords.length === 0) {
      return null;
    }
    return linkRecords
      .slice(0, this.limits.workspaceExternalLinkContextLimit)
      .map((link) => {
        const lastSaleAt = this.base.formatPromptDate(link.lastSaleAt);
        const totalSales = Number(link.totalSales);
        const totalRevenue = Number(link.totalRevenue);
        const parts = [
          link.platform,
          link.productName,
          this.base.formatPromptCurrency(link.price, 'BRL'),
          Number.isFinite(totalSales) ? `${totalSales} vendas` : null,
          Number.isFinite(totalRevenue)
            ? `${this.base.formatPromptCurrency(totalRevenue, 'BRL')} faturados`
            : null,
          lastSaleAt ? `última venda ${lastSaleAt}` : null,
        ].filter(Boolean);
        return `- ${parts.join(' | ')}`;
      })
      .join('\n');
  }

  buildAgentProfileContext(agent: unknown): string | null {
    if (!isPromptRecord(agent)) {
      return null;
    }
    const a = agent;
    const persona = isPromptRecord(a.persona) ? a.persona : undefined;
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
