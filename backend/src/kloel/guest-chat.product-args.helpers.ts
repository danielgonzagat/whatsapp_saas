export function extractProductName(msg: string): string {
  const cleanMsg = msg.replace(/[?!]+\s*$/, '').trim();
  const prodMatch = cleanMsg.match(
    /para\s+(?:o\s+|a\s+)\s*(?:produto|oferta|plano|checkout|item)?\s*["']?([A-Za-zÀ-ÿ0-9\s.+-]{2,60}?)(?:\s*(?:,|\.|R\$|pre[çc]o|valor|\bcom\b|\bpor\b|\bpara\b|\burl\b|https?|\bcor\b|\bdescri[cç][aã]o\b|\bdescricao\b|$)|$)/i,
  );
  if (prodMatch?.[1]) {
    const pn = prodMatch[1].trim();
    if (pn.length >= 3) {
      return pn;
    }
  }
  const noMatch = cleanMsg.match(
    /\bno\s+(?:produto|oferta|plano|checkout|item)?\s*["']?([A-Za-zÀ-ÿ0-9\s.+-]{2,60}?)(?:\s*(?:R\$|pre[çc]o|valor|\bcom\b|\bpor\b|\bpara\b|\bno\b|\bna\b|$)|$)/i,
  );
  if (noMatch?.[1]) {
    const nn = noMatch[1].trim();
    if (nn.length >= 3) {
      return nn;
    }
  }
  const doMatch = cleanMsg.match(
    /\b(?:do|da)\s+(?:produto|oferta|plano|checkout|item)?\s*["']?([A-Za-zÀ-ÿ0-9\s.+-]{2,60}?)(?:\s*(?:R\$|pre[çc]o|valor|\bcom\b|\bpor\b|\bpara\b|\bdo\b|\bpara\b|$)|$)/i,
  );
  if (doMatch?.[1]) {
    const cleanName = doMatch[1].trim();
    if (cleanName.length >= 3) {
      return cleanName;
    }
  }
  const m = cleanMsg.match(
    /(?:produtos?|planos?|ofertas?|checkouts?|cupons?|vendas?|pedidos?|orders?)\s+(?:chamad[oa]|de\s+)?["']?([A-Za-zÀ-ÿ0-9\s.+-]{2,60}?)(?:\s*(?:R\$|pre[çc]o|valor|\bcom\b|\bpor\b|\bpara\b|\bdo\b|\bmudando\b|\bmuda\b|\bdescri[cç][aã]o\b|\btags?\b|\bgarantia\b|\bcategoria\b|\bformato\b|\bcart[aã]o\b|\bpix\b|\bboleto\b|\bcor\b|\bcupom\b|\.\s+[A-ZÀ]|$)|$)/i,
  );
  const name = (m?.[1] || '').trim() || '';
  return name
    .replace(/^(para|do|da|de|no|na|em|o|a)\s+/i, '')
    .replace(/[.,;:!]+$/, '')
    .trim();
}

export function extractProductArgs(msg: string): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  const explicitName = msg.match(
    /(?:nome(?:\s+do\s+produto)?|name|chama(?:do)?)\s*(?:[eé]|:)\s*["']?([A-Za-zÀ-ÿ0-9\s.+-]{2,60}?)(?:\s*(?:,|\.|R\$|pre[çc]o|categoria|formato|tipo|tags?|garantia|descri[cç]|pagamento|dispon[ií]vel|ativo|$))/i,
  );
  const name = explicitName?.[1]?.trim() || extractProductName(msg);
  args.productName = name;
  if (name) {
    args.name = name;
  }
  // "R$ 147", "R$147", "preco 147", "preço 147", "147 reais", "R$ 147,00"
  const pm =
    msg.match(/(?:R\$\s*|pre[çc]o\s+)(\d+[.,]?\d*)/i) ||
    msg.match(/(\d+[.,]?\d*)\s*(?:reais|real)/i) ||
    msg.match(/R\$\s*(\d+[.,]?\d*)/i);
  if (pm && pm[1]) {
    args.price = parseFloat(pm[1].replace(',', '.'));
  }
  // Format: físico, digital, híbrido
  if (/\b(f[ií]sico|digital|h[ií]brido)\b/i.test(msg)) {
    const fmt = msg.match(/\b(f[ií]sico|digital|h[ií]brido)\b/i)?.[1].toLowerCase() || '';
    args.format =
      fmt === 'físico' || fmt === 'fisico' ? 'PHYSICAL' : fmt === 'digital' ? 'DIGITAL' : 'HYBRID';
  }
  // Category
  const catMatch = msg.match(
    /(?:categoria|tipo)\s*:?\s*([A-Za-zÀ-ÿ0-9\s]{2,30}?)(?:\s*(?:,|\.|R\$|pre[çc]o|$))/i,
  );
  if (catMatch?.[1]) {
    args.category = catMatch[1].trim();
  }
  // Image URL
  const imgMatch = msg.match(/(?:imagem|foto|image)\s*(?:url|link)?\s*:?\s*(https?:\/\/\S+)/i);
  if (imgMatch?.[1]) {
    args.imageUrl = imgMatch[1];
  }
  // Description
  const descMatch = msg.match(
    /(?:descri[cç][aã]o|description)\s*:?\s*['"]?([A-Za-zÀ-ÿ0-9\s\-.,!]{5,200}?)(?:\s*(?:,|\.|R\$|pre[çc]o|email|suporte|categoria|formato|tags?|garantia|url|dispon[ií]vel|ativo|$))/i,
  );
  if (descMatch?.[1]) {
    args.description = descMatch[1].trim();
  }
  // Tags
  const tagsMatch = msg.match(
    /(?:tags?|palavras?[-\s]?chave)\s*:?\s*([A-Za-zÀ-ÿ0-9\s,]{3,150}?)(?:\s*(?:\.\s+[A-ZÀ]|R\$|pre[çc]o|descri[cç][aã]o\b|descricao\b|garantia\b|categoria\b|formato\b|$))/i,
  );
  if (tagsMatch?.[1]) {
    args.tags = tagsMatch[1]
      .split(',')
      .map((t: string) => t.trim())
      .filter(Boolean);
  }
  // Warranty days
  const warrantyMatch = msg.match(/(?:garantia|warranty)\s*(?:de\s+)?(\d+)\s*(?:dias?|days?)/i);
  if (warrantyMatch?.[1]) {
    args.warrantyDays = parseInt(warrantyMatch[1], 10);
  }
  // Sales page URL
  const salesUrlMatch = msg.match(
    /(?:p[aá]gina\s*(?:de\s+)?vendas|url\s*(?:de\s+)?vendas)\s*:?\s*(https?:\/\/\S+)/i,
  );
  if (salesUrlMatch?.[1]) {
    args.salesPageUrl = salesUrlMatch[1];
  }
  // Thank you URLs
  const thanksUrlMatch = msg.match(
    /(?:obrigado|thank.?you)\s*(?:url|p[aá]gina)?\s*:?\s*(https?:\/\/\S+)/i,
  );
  if (thanksUrlMatch?.[1]) {
    args.thankyouUrl = thanksUrlMatch[1];
  }
  // Support email
  const emailMatch = msg.match(
    /(?:email|e-mail|suporte)\s*:?\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
  );
  if (emailMatch?.[1]) {
    args.supportEmail = emailMatch[1];
  }
  // Disponivel para venda
  if (/\b(dispon[ií]vel|ativo|disponivel)\b.*\b(venda|vender)\b/i.test(msg)) {
    args.active = true;
  }
  if (/\b(indispon[ií]vel|pausar|desativa(?:r)?|desabilita(?:r)?)\b/i.test(msg)) {
    args.active = false;
  }
  return args;
}

export function extractPlanArgs(msg: string): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  // Product name: after "para o/a" in plan/checkout contexts.
  const prodMatch = msg.match(
    /para\s+(?:o\s+|a\s+)\s*(?:produto|oferta|plano|checkout|item)?\s*["']?([A-Za-zÀ-ÿ0-9\s.+-]{2,60}?)(?:\s*(?:,|\.|R\$|pre[çc]o|valor|\bcom\b|\bpor\b|\bpara\b|\burl\b|https?|\bcor\b|\bdescri[cç][aã]o\b|\bdescricao\b|$)|$)/i,
  );
  if (prodMatch?.[1]) {
    args.productName = prodMatch[1].trim();
  } else {
    args.productName = extractProductName(msg);
  }
  // Plan/checkout name: after "plano X" or "checkout X" or "Nome: X" or "chamado X"
  const nm = msg.match(
    /(?:nome|chamad[oa]|plano|checkout)\s*:?\s*([A-Za-zÀ-ÿ0-9\s-]{2,30}?)(?:\s*(?:,|\.|pre[çc]o|R\$|valor|\bcom\b|\bpor\b|\bpara\b|\bcor\b|$))/i,
  );
  if (nm && nm[1]) {
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
  return args;
}
