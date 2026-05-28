// Wave 67 Phase 1 split — see docs/architecture/WAVE_60_GUEST_CHAT_ACTION_INTENT_DECOMP_PLAN.md.
import { extractProductName } from './guest-chat.action-intent.product-args.helpers';

export function extractPlanArgs(msg: string): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  // Product name: after "para o/a" — requires article (avoids matching "para X" in unrelated text)
  const prodMatch = msg.match(
    /para\s+(?:o\s+|a\s+)\s*(?:produto|oferta|plano|checkout|item)?\s*["']?([A-Za-zÀ-ÿ0-9\s.+-]{2,60}?)(?:\s*(?:,|\.|R\$|pre[çc]o|valor|\bcom\b|\bpor\b|\bpara\b|\burl\b|https?|\bcor\b|\bdescri[cç][aã]o\b|\bdescricao\b|$)|$)/i,
  );
  if (prodMatch?.[1]) {
    const pn = prodMatch[1].trim();
    if (!/\b(comprador|cliente|lead|usu[aá]rio)\b/i.test(pn)) {
      args.productName = pn;
    }
  } else {
    args.productName = extractProductName(msg);
  }
  // Plan/checkout name: after "plano X" or "checkout X" or "Nome: X" or "chamado X"
  const nm = msg.match(
    /(?:nome|chamad[oa]|plano|checkout)\s*:?\s*([A-Za-zÀ-ÿ0-9\s-]{2,30}?)(?:\s*(?:,|\.|pre[çc]o|R\$|valor|\bcom\b|\bpor\b|\bpara\b|\bcor\b|\baceita(?:r)?\b|\bquantidade\b|\bqtd\b|$))/i,
  );
  if (nm && nm[1]) {
    // Strip leading "chamado/chamada" filler word from plan name
    args.planName = nm[1]
      .trim()
      .replace(/^chamad[oa]\s+/i, '')
      .trim();
  }
  // Fallback: extract name directly after "checkout " or "plano " without colon
  if (!args.planName) {
    const directMatch = msg.match(
      /(?:checkout|plano)\s+(?!com\b|para\b|sem\b|chamad[oa]\b)([A-Z][A-Za-zÀ-ÿ0-9\s-]{2,30}?)(?:\s*(?:,|\.|R\$|pre[çc]o|\bcom\b|\bpor\b|\bpara\b|\bcor\b|$))/i,
    );
    if (directMatch?.[1]) {
      args.planName = directMatch[1].trim();
    }
  }
  // Price
  const pm =
    msg.match(/(?:R\$\s*|pre[çc]o\s*:?\s*)(\d+[.,]?\d*)/i) ||
    msg.match(/(\d+[.,]?\d*)\s*(?:reais|real)/i);
  if (pm && pm[1]) {
    args.price = parseFloat(pm[1].replace(',', '.'));
  }
  // Quantity
  const qm = msg.match(/(?:qtd|quantidade|itens?)\s*:?\s*(\d+)/i);
  if (qm && qm[1]) {
    args.quantity = parseInt(qm[1], 10);
  }
  // Installments
  const instMatch = msg.match(/(\d+)\s*(?:x|vezes|parcelas?)/i);
  if (instMatch?.[1]) {
    args.maxInstallments = parseInt(instMatch[1], 10);
  }
  // Quantity / items
  const qtyMatch =
    msg.match(/quantidade\s+(?:de\s+)?(\d+)/i) ||
    msg.match(/qtd\s+(?:de\s+)?(\d+)/i) ||
    msg.match(/(\d+)\s+(?:itens?|unidades?|qtd)/i);
  if (qtyMatch?.[1]) {
    args.itemsPerPlan = parseInt(qtyMatch[1], 10);
  }
  // Shipping
  if (/frete\s+gr[aá]tis/i.test(msg)) {
    args.shippingType = 'FREE';
  }
  if (/frete\s+fixo/i.test(msg)) {
    args.shippingType = 'FIXED';
  }
  if (/frete\s+vari[aá]vel/i.test(msg)) {
    args.shippingType = 'VARIABLE';
  }
  const shipValue = msg.match(/(?:frete\s+(?:fixo\s+)?(?:de\s+)?)?R\$\s*(\d+[.,]?\d*)/i);
  if (shipValue?.[1]) {
    args.shippingValue = parseFloat(shipValue[1].replace(',', '.'));
  }
  // Origin CEP
  const cepMatch = msg.match(/(?:cep|origem)\s*:?\s*(\d{5}-?\d{3})/i);
  if (cepMatch?.[1]) {
    args.originCep = cepMatch[1];
  }
  // Affiliate visibility
  if (/(?:vis[ií]vel|dispon[ií]vel)\s+(?:para|pr[ao])\s+afiliados?/i.test(msg)) {
    args.visibleToAffiliates = true;
  }
  if (/ocult[oa]\s+(?:para|pr[ao]|de)\s+afiliados?/i.test(msg)) {
    args.visibleToAffiliates = false;
  }
  // Billing type
  if (
    /\b(assinatura|recorrente|subscript|mensal|anual|semanal)\b/i.test(msg) &&
    !/\b([aà] vista|unico|único)\b/i.test(msg)
  ) {
    args.billingType = 'RECURRING';
  }
  if (/\b(grat[uí]to|free|gratis)\b/i.test(msg)) {
    args.billingType = 'FREE';
  }
  // Recurring interval
  if (/mensal/i.test(msg)) {
    args.recurringInterval = 'MONTHLY';
  }
  if (/anual/i.test(msg)) {
    args.recurringInterval = 'ANNUAL';
  }
  if (/semanal/i.test(msg)) {
    args.recurringInterval = 'WEEKLY';
  }
  // Trial
  if (/\btrial\b|\bper[íi]odo\s+(?:de\s+)?teste\b/i.test(msg)) {
    args.trialEnabled = true;
  }
  const trialMatch = msg.match(/(\d+)\s*dias?\s*(?:de\s+)?(?:trial|teste)/i);
  if (trialMatch?.[1]) {
    args.trialEnabled = true;
    args.trialDays = parseInt(trialMatch[1], 10);
  }
  // Payment methods toggle
  if (/sem\s+cart[aã]o|desativar\s+cart[aã]o/i.test(msg)) {
    if (!args.paymentMethods) {
      args.paymentMethods = ['pix', 'boleto'];
    }
  }
  if (/sem\s+pix|desativar\s+pix/i.test(msg)) {
    if (!args.paymentMethods) {
      args.paymentMethods = ['card', 'boleto'];
    }
  }
  if (/sem\s+boleto|desativar\s+boleto/i.test(msg)) {
    if (!args.paymentMethods) {
      args.paymentMethods = ['card', 'pix'];
    }
  }
  if (/\b(cart[aã]o|pix|boleto)\b.*\b(todos|completo)\b/i.test(msg)) {
    args.paymentMethods = ['card', 'pix', 'boleto'];
  }
  // Custom commission
  const customComm = msg.match(/(?:comiss[aã]o|custom)\s+(?:personalizada|de\s+)?(\d+)\s*%/i);

  // Checkout-specific
  if (/cart[aã]o/i.test(msg) && !/desmarc|remover|tirar/i.test(msg)) {
    if (!args.paymentMethods) {
      args.paymentMethods = [];
    }
    (args.paymentMethods as string[]).push('card');
  }
  if (/pix/i.test(msg) && !/desmarc|remover|tirar/i.test(msg)) {
    if (!args.paymentMethods) {
      args.paymentMethods = [];
    }
    (args.paymentMethods as string[]).push('pix');
  }
  if (/boleto/i.test(msg) && !/desmarc|remover|tirar/i.test(msg)) {
    if (!args.paymentMethods) {
      args.paymentMethods = [];
    }
    (args.paymentMethods as string[]).push('boleto');
  }
  if (/cupom\s+autom[aá]tico/i.test(msg)) {
    args.couponAuto = true;
  }
  if (/contador|social\s+proof/i.test(msg)) {
    args.counterEnabled = true;
  }
  const colorMatch = msg.match(
    /cor\s+(?:principal|fundo|bot[aã]o)?\s*:?\s*(#[0-9a-fA-F]{3,6}|\w+)/i,
  );
  if (colorMatch?.[1]) {
    const colorKey = msg.includes('fundo')
      ? 'backgroundColor'
      : msg.includes('bot')
        ? 'buttonText'
        : 'primaryColor';
    if (colorKey === 'buttonText') {
      args.buttonText = colorMatch[1];
    } else {
      args[colorKey] = colorMatch[1];
    }
  }
  if (customComm?.[1]) {
    args.customCommission = parseInt(customComm[1], 10);
  }
  // Active/disabled
  if (/\b(indispon[ií]vel|pausar|desativa(?:r)?|desabilita(?:r)?)\b/i.test(msg)) {
    args.active = false;
  }
  if (
    /\b(dispon[ií]vel|ativo|disponivel|ativa(?:r)?|habilita(?:r)?)\b/i.test(msg) &&
    !/\b(indispon[ií]vel|pausar|desativa(?:r)?)\b/i.test(msg)
  ) {
    args.active = true;
  }
  return args;
}
