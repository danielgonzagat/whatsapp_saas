import { buildProductAIConfigPrompt } from './kloel.prompts';
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

function promptBoolean(record: PromptRecord, key: string): boolean {
  return record[key] === true;
}

function promptNumber(record: PromptRecord, key: string): number {
  const value = Number(record[key] ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function hasPromptNumber(record: PromptRecord, key: string): boolean {
  return Number.isFinite(Number(record[key]));
}

export class KloelProductMetaContextFormatter {
  constructor(
    protected base: KloelContextBaseFormatter,
    protected limits: KloelContextFormatterLimits,
  ) {}

  buildProductPlanContext(plans: unknown): string | null {
    const records = promptRecords(plans);
    if (records.length === 0) {
      return null;
    }
    return records
      .slice(0, this.limits.workspaceProductPlanLimit)
      .map((plan) => {
        const billingType = promptString(plan, 'billingType');
        const recurringInterval = promptString(plan, 'recurringInterval');
        const parts = [
          `${promptString(plan, 'name') ?? 'Plano sem nome'}: ${this.base.formatPromptCurrency(plan.price, plan.currency)}`,
          billingType ? `cobrança ${billingType}` : null,
          hasPromptNumber(plan, 'maxInstallments')
            ? `até ${promptNumber(plan, 'maxInstallments')}x`
            : null,
          recurringInterval ? `recorrência ${recurringInterval}` : null,
          promptBoolean(plan, 'trialEnabled')
            ? `trial ${promptNumber(plan, 'trialDays')} dias`
            : null,
          hasPromptNumber(plan, 'salesCount') ? `${promptNumber(plan, 'salesCount')} vendas` : null,
        ].filter(Boolean);
        const aiConfig = this.base.compactJsonForPrompt(plan.aiConfig, 180);
        const termsUrl = this.base.truncatePromptText(promptString(plan, 'termsUrl'), 140);
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
    const records = promptRecords(urls);
    if (records.length === 0) {
      return null;
    }
    return records
      .slice(0, this.limits.workspaceProductUrlLimit)
      .map((entry) => {
        const salesFromUrl = promptNumber(entry, 'salesFromUrl');
        const parts = [
          promptString(entry, 'description') ?? 'URL sem descrição',
          this.base.truncatePromptText(promptString(entry, 'url'), 160),
          promptBoolean(entry, 'isPrivate') ? 'privada' : 'pública',
          promptBoolean(entry, 'aiLearning') ? 'aprendizado AI ativo' : null,
          promptBoolean(entry, 'chatEnabled') ? 'chat habilitado' : null,
          hasPromptNumber(entry, 'salesFromUrl') && salesFromUrl > 0
            ? `${salesFromUrl} vendas`
            : null,
        ].filter(Boolean);
        return `  - ${parts.join(' | ')}`;
      })
      .join('\n');
  }

  buildProductReviewContext(reviews: unknown): string | null {
    const records = promptRecords(reviews);
    if (records.length === 0) {
      return null;
    }
    const averageRating =
      records.reduce((sum, review) => sum + promptNumber(review, 'rating'), 0) / records.length;
    return [
      `  - média recente: ${averageRating.toFixed(1)}/5`,
      ...records.slice(0, this.limits.workspaceProductReviewLimit).map((review) => {
        const author =
          this.base.truncatePromptText(promptString(review, 'authorName'), 32) || 'cliente';
        const comment = this.base.truncatePromptText(promptString(review, 'comment'), 140);
        const rating = promptNumber(review, 'rating');
        const suffix = promptBoolean(review, 'verified') ? ' | verificada' : '';
        return comment
          ? `  - ${author}: ${rating}/5${suffix} — ${comment}`
          : `  - ${author}: ${rating}/5${suffix}`;
      }),
    ].join('\n');
  }

  buildProductCheckoutContext(checkouts: unknown): string | null {
    const records = promptRecords(checkouts);
    if (records.length === 0) {
      return null;
    }
    return records
      .slice(0, this.limits.workspaceProductCheckoutLimit)
      .map((checkout) => {
        const conversion = this.base.formatPromptPercent(checkout.conversionRate);
        const abandon = this.base.formatPromptPercent(checkout.abandonRate);
        const cancel = this.base.formatPromptPercent(checkout.cancelRate);
        const parts = [
          promptString(checkout, 'name') ?? promptString(checkout, 'code') ?? 'checkout principal',
          conversion && promptNumber(checkout, 'conversionRate') > 0
            ? `conversão ${conversion}`
            : null,
          abandon && promptNumber(checkout, 'abandonRate') > 0 ? `abandono ${abandon}` : null,
          cancel && promptNumber(checkout, 'cancelRate') > 0 ? `cancelamento ${cancel}` : null,
          hasPromptNumber(checkout, 'totalVisits')
            ? `${promptNumber(checkout, 'totalVisits')} visitas`
            : null,
        ].filter(Boolean);
        return `  - ${parts.join(' | ')}`;
      })
      .join('\n');
  }

  buildProductCouponContext(coupons: unknown, currency: unknown = 'BRL'): string | null {
    const records = promptRecords(coupons);
    if (records.length === 0) {
      return null;
    }
    return records
      .slice(0, this.limits.workspaceProductCouponLimit)
      .map((coupon) => {
        const discount =
          (promptString(coupon, 'discountType') ?? '').toUpperCase() === 'FIXED'
            ? this.base.formatPromptCurrency(coupon.discountValue, currency)
            : `${promptNumber(coupon, 'discountValue')}%`;
        const expiresAt = this.base.formatPromptDate(coupon.expiresAt);
        const parts = [
          promptString(coupon, 'code'),
          `desconto ${discount}`,
          hasPromptNumber(coupon, 'usedCount')
            ? `${promptNumber(coupon, 'usedCount')} uso(s)`
            : null,
          hasPromptNumber(coupon, 'maxUses') ? `limite ${promptNumber(coupon, 'maxUses')}` : null,
          expiresAt ? `expira ${expiresAt}` : null,
        ].filter(Boolean);
        return `  - ${parts.join(' | ')}`;
      })
      .join('\n');
  }

  buildProductCampaignContext(campaigns: unknown): string | null {
    const records = promptRecords(campaigns);
    if (records.length === 0) {
      return null;
    }
    return records
      .slice(0, this.limits.workspaceProductCampaignLimit)
      .map((campaign) => {
        const parts = [
          promptString(campaign, 'name') ?? promptString(campaign, 'code'),
          hasPromptNumber(campaign, 'salesCount')
            ? `${promptNumber(campaign, 'salesCount')} venda(s)`
            : null,
          hasPromptNumber(campaign, 'paidCount')
            ? `${promptNumber(campaign, 'paidCount')} paga(s)`
            : null,
        ].filter(Boolean);
        return `  - ${parts.join(' | ')}`;
      })
      .join('\n');
  }

  buildProductCommissionContext(commissions: unknown): string | null {
    const records = promptRecords(commissions);
    if (records.length === 0) {
      return null;
    }
    return records
      .slice(0, this.limits.workspaceProductCommissionLimit)
      .map((commission) => {
        const actor =
          this.base.truncatePromptText(promptString(commission, 'agentName'), 40) ||
          this.base.truncatePromptText(promptString(commission, 'agentEmail'), 40) ||
          'parceiro sem nome';
        return `  - ${promptString(commission, 'role') ?? 'parceiro'}: ${promptNumber(commission, 'percentage')}%${actor ? ` | ${actor}` : ''}`;
      })
      .join('\n');
  }

  buildProductMarketingContext(aiConfig: unknown): string | null {
    if (!aiConfig || typeof aiConfig !== 'object') {
      return null;
    }
    const prompt = buildProductAIConfigPrompt(
      aiConfig as Parameters<typeof buildProductAIConfigPrompt>[0],
    )
      .split('\n')
      .map((line) => this.base.truncatePromptText(line, 220))
      .filter(Boolean)
      .slice(0, 10);
    if (prompt.length === 0) {
      return null;
    }
    return prompt.map((line) => `  - ${line}`).join('\n');
  }
}
