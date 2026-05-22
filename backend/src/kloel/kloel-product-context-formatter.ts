import { KloelContextBaseFormatter } from './kloel-context-base-formatter';
import type { KloelContextFormatterLimits } from './kloel-context-formatter.types';
import { KloelProductMetaContextFormatter } from './kloel-product-meta-context-formatter';

export class KloelProductContextFormatter extends KloelProductMetaContextFormatter {
  constructor(base: KloelContextBaseFormatter, limits: KloelContextFormatterLimits) {
    super(base, limits);
  }

  buildWorkspaceProductContext(product: Record<string, unknown>, index: number): string {
    const safeStr = (v: unknown, fb = ''): string => {
      return typeof v === 'string'
        ? v
        : typeof v === 'number' || typeof v === 'boolean'
          ? String(v)
          : fb;
    };
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
        this.base.formatPromptCurrency(product.price, product.currency),
        product.format ? `formato ${safeStr(product.format)}` : null,
        product.category ? `categoria ${safeStr(product.category)}` : null,
        product.isSample ? 'amostra' : null,
      ]
        .filter(Boolean)
        .join(' | '),
    );
    const description = this.base.truncatePromptText(product.description, 260);
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
    const paymentLink = this.base.truncatePromptText(product.paymentLink, 160);
    const salesPageUrl = this.base.truncatePromptText(product.salesPageUrl, 160);
    const thankyouUrl = this.base.truncatePromptText(product.thankyouUrl, 140);
    const thankyouPixUrl = this.base.truncatePromptText(product.thankyouPixUrl, 140);
    const thankyouBoletoUrl = this.base.truncatePromptText(product.thankyouBoletoUrl, 140);
    const reclameAquiUrl = this.base.truncatePromptText(product.reclameAquiUrl, 140);
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
        ? `frete ${this.base.formatPromptCurrency(product.shippingValue, product.currency)}`
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
    const technicalInfo = this.base.compactJsonForPrompt(aiConfigObj?.technicalInfo, 220);
    if (technicalInfo) {
      lines.push(`- Técnica/compliance: ${technicalInfo}`);
    }
    const merchandContent = this.base.truncatePromptText(product.merchandContent, 180);
    if (merchandContent) {
      lines.push(`- Materiais para afiliados: ${merchandContent}`);
    }
    const affiliateTerms = this.base.truncatePromptText(product.affiliateTerms, 180);
    if (affiliateTerms) {
      lines.push(`- Termos de afiliado: ${affiliateTerms}`);
    }
    const afterPay = [
      product.afterPayDuplicateAddress ? 'bloqueia endereço duplicado' : null,
      product.afterPayAffiliateCharge ? 'cobra taxa pós-pagamento do afiliado' : null,
      Number.isFinite(Number(product.afterPayChargeValue))
        ? `taxa ${this.base.formatPromptCurrency(product.afterPayChargeValue, product.currency)}`
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
}
