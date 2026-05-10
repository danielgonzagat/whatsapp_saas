import { buildProductAIConfigPrompt } from './kloel.prompts';
import { KloelContextBaseFormatter } from './kloel-context-base-formatter';
import type { KloelContextFormatterLimits } from './kloel-context-formatter.types';

export class KloelProductMetaContextFormatter {
  constructor(
    protected base: KloelContextBaseFormatter,
    protected limits: KloelContextFormatterLimits,
  ) {}

  buildProductPlanContext(plans: unknown): string | null {
    if (!Array.isArray(plans) || plans.length === 0) {
      return null;
    }
    return plans
      .slice(0, this.limits.workspaceProductPlanLimit)
      .map((plan) => {
        const parts = [
          `${plan.name}: ${this.base.formatPromptCurrency(plan.price, plan.currency)}`,
          plan.billingType ? `cobrança ${plan.billingType}` : null,
          Number.isFinite(Number(plan.maxInstallments))
            ? `até ${Number(plan.maxInstallments)}x`
            : null,
          plan.recurringInterval ? `recorrência ${plan.recurringInterval}` : null,
          plan.trialEnabled ? `trial ${Number(plan.trialDays || 0)} dias` : null,
          Number.isFinite(Number(plan.salesCount)) ? `${Number(plan.salesCount)} vendas` : null,
        ].filter(Boolean);
        const aiConfig = this.base.compactJsonForPrompt(plan.aiConfig, 180);
        const termsUrl = this.base.truncatePromptText(plan.termsUrl, 140);
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
    if (!Array.isArray(urls) || urls.length === 0) {
      return null;
    }
    return urls
      .slice(0, this.limits.workspaceProductUrlLimit)
      .map((entry) => {
        const parts = [
          entry.description || 'URL sem descrição',
          this.base.truncatePromptText(entry.url, 160),
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
    if (!Array.isArray(reviews) || reviews.length === 0) {
      return null;
    }
    const averageRating =
      reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / reviews.length;
    return [
      `  - média recente: ${averageRating.toFixed(1)}/5`,
      ...reviews.slice(0, this.limits.workspaceProductReviewLimit).map((review) => {
        const author = this.base.truncatePromptText(review.authorName, 32) || 'cliente';
        const comment = this.base.truncatePromptText(review.comment, 140);
        const suffix = review.verified ? ' | verificada' : '';
        return comment
          ? `  - ${author}: ${Number(review.rating || 0)}/5${suffix} — ${comment}`
          : `  - ${author}: ${Number(review.rating || 0)}/5${suffix}`;
      }),
    ].join('\n');
  }

  buildProductCheckoutContext(checkouts: unknown): string | null {
    if (!Array.isArray(checkouts) || checkouts.length === 0) {
      return null;
    }
    return checkouts
      .slice(0, this.limits.workspaceProductCheckoutLimit)
      .map((checkout) => {
        const conversion = this.base.formatPromptPercent(checkout.conversionRate);
        const abandon = this.base.formatPromptPercent(checkout.abandonRate);
        const cancel = this.base.formatPromptPercent(checkout.cancelRate);
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
    if (!Array.isArray(coupons) || coupons.length === 0) {
      return null;
    }
    return coupons
      .slice(0, this.limits.workspaceProductCouponLimit)
      .map((coupon) => {
        const discount =
          String(coupon.discountType || '').toUpperCase() === 'FIXED'
            ? this.base.formatPromptCurrency(coupon.discountValue, currency)
            : `${Number(coupon.discountValue || 0)}%`;
        const expiresAt = this.base.formatPromptDate(coupon.expiresAt);
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
    if (!Array.isArray(campaigns) || campaigns.length === 0) {
      return null;
    }
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
    if (!Array.isArray(commissions) || commissions.length === 0) {
      return null;
    }
    return commissions
      .slice(0, this.limits.workspaceProductCommissionLimit)
      .map((commission) => {
        const actor =
          this.base.truncatePromptText(commission.agentName, 40) ||
          this.base.truncatePromptText(commission.agentEmail, 40) ||
          'parceiro sem nome';
        return `  - ${commission.role}: ${Number(commission.percentage || 0)}%${actor ? ` | ${actor}` : ''}`;
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
