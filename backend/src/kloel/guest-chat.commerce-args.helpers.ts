import { extractProductName } from './guest-chat.product-args.helpers';

export function extractPaymentArgs(msg: string): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  const name = extractProductName(msg);
  if (name) {
    args.productName = name;
    args.description = name; // for smart-payment compatibility
  }
  const am = msg.match(/R\$\s*(\d+[.,]?\d*)/);
  if (am && am[1]) {
    const val = parseFloat(am[1].replace(',', '.'));
    args.amount = val;
  }
  // Also try "de R$ X" / "de X reais" patterns
  if (!args.amount) {
    const am2 =
      msg.match(/de\s+R\$\s*(\d+[.,]?\d*)/i) || msg.match(/de\s+(\d+[.,]?\d*)\s*(reais|real)/i);
    if (am2?.[1]) {
      args.amount = parseFloat(am2[1].replace(',', '.'));
    }
  }
  const nm = msg.match(
    /para\s+(?:o\s+|a\s+)?(?:comprador[a]?|client[e]?|lead\s+)?([A-Z][a-zÀ-ÿ]{2,25}(?:\s+[A-Z][a-zÀ-ÿ]{2,25})?)(?:\s+(?:comprar|adquirir|pagar|para)\b|$)/i,
  );
  if (nm && nm[1]) {
    args.customerName = nm[1].trim();
  }
  return args;
}

export function extractCouponArgs(msg: string): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  const codeMatch = msg.match(/(?:cupom|desconto)\s+([A-Z0-9_]{3,20})/i);
  if (codeMatch?.[1]) {
    args.code = codeMatch[1].toUpperCase();
  }
  args.productName = extractProductName(msg);
  const pctMatch = msg.match(/(\d+)\s*%/);
  const fixedMatch = msg.match(/(?:R\$\s*|fixo\s+)(\d+[.,]?\d*)/i);
  if (pctMatch?.[1]) {
    // Usage limit
    const limitMatch = msg.match(/(?:limite|max|at[eé])\s+(\d+)\s*(?:usos?|vezes?|compras?)/i);
    if (limitMatch?.[1]) {
      args.usageLimit = parseInt(limitMatch[1], 10);
    }
    // Expiration
    const expMatch = msg.match(
      /(?:expira|v[aá]lido\s+at[eé]|validade)\s*(?:em\s+)?(\d+)\s*(dias?|days?|meses?|months?)/i,
    );
    if (expMatch?.[1]) {
      const num = parseInt(expMatch[1], 10);
      const unit = expMatch[2]?.toLowerCase();
      if (unit?.startsWith('mes')) {
        args.expiresInDays = num * 30;
      } else {
        args.expiresInDays = num;
      }
    }
    args.discountType = 'PERCENT';
    args.discountValue = parseInt(pctMatch[1], 10);
  } else if (fixedMatch?.[1]) {
    args.discountType = 'FIXED';
    args.discountValue = parseFloat(fixedMatch[1].replace(',', '.'));
  }
  return args;
}

export function extractUrlArgs(msg: string): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  args.productName = extractProductName(msg);
  const labelMatch = msg.match(
    /(?:descri[cç][aã]o|label|nome)\s*:?\s*['"]?([A-Za-zÀ-ÿ0-9\s\-.]{2,40}?)(?:\s*(?:,|\.|url|https?|$))/i,
  );
  if (labelMatch?.[1]) {
    args.label = labelMatch[1].trim();
  }
  const urlMatch = msg.match(/(https?:\/\/\S+)/i);
  if (urlMatch?.[1]) {
    args.url = urlMatch[1];
  }
  if (/privad[oa]/.test(msg)) {
    args.isPrivate = true;
  }
  if (/aprender|aprendizado/.test(msg)) {
    args.learnEnabled = true;
  }
  if (/integrar|chat.*kloel/.test(msg)) {
    args.chatEnabled = true;
  }
  return args;
}

export function extractAffiliateArgs(msg: string): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  if (/\b(participar|ativar|sim|entrar)\b.*\b(programa|afiliado)\b/i.test(msg)) {
    args.participate = true;
  }
  if (/\b(vis[ií]vel|mostrar|p[uú]blico)\b.*\b(loja|vitrine)\b/i.test(msg)) {
    args.visibleInStore = true;
  }
  if (/\b(aprova[cç][aã]o)\s+(auto|autom[aá]tica)\b/i.test(msg)) {
    args.autoApproval = true;
  }
  if (/\b(acesso)\s+(dados|data)\b/i.test(msg)) {
    args.accessData = true;
  }
  if (/\b(acesso)\s+(abandonos?|carrinhos?)\b/i.test(msg)) {
    args.accessAbandonments = true;
  }
  if (/\bcomiss[aã]o\b.*\b(1a?\s*parcela|primeira)\b/i.test(msg)) {
    args.commissionFirstInstallment = true;
  }
  if (/\b(primeiro|1o?)\s+clique\b/i.test(msg)) {
    args.attributionModel = 'FIRST_CLICK';
  }
  if (/\b([uú]ltimo)\s+clique\b/i.test(msg)) {
    args.attributionModel = 'LAST_CLICK';
  }
  if (/\bdivis[aã]o\b.*\bproporcional\b/i.test(msg)) {
    args.attributionModel = 'PROPORTIONAL';
  }
  const cookieMatch = msg.match(/(\d+)\s*(dias?|days?)\s*(de\s+)?cookie/i);
  if (cookieMatch?.[1]) {
    args.cookieDays = parseInt(cookieMatch[1], 10);
  }
  const pctMatch = msg.match(/(\d+)\s*%\s*(?:de\s+)?comiss[aã]o/i);
  if (pctMatch?.[1]) {
    args.commissionPercent = parseInt(pctMatch[1], 10);
  }
  const prodMatch = msg.match(
    /para\s+(?:o\s+|a\s+)?(?:produto\s+)?["']?([A-Za-zÀ-ÿ0-9\s.+-]{2,60}?)(?:\s*(?:,|\.|R\$|pre[çc]o|valor|\bcom\b|\bpor\b|\bpara\b|\burl\b|https?|\bcor\b|\bdescri[cç][aã]o\b|\bdescricao\b|$)|$)/i,
  );
  if (prodMatch?.[1]) {
    args.productName = prodMatch[1].trim();
  }
  return args;
}

export function extractFiscalArgs(msg: string): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  const cnpj = msg.match(/(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})/);
  if (cnpj?.[1]) {
    args.cnpj = cnpj[1];
  }
  const cpf = msg.match(/(\d{3}\.?\d{3}\.?\d{3}-?\d{2})/);
  if (cpf?.[1] && !cnpj) {
    args.cpf = cpf[1];
  }
  const fullName = msg.match(
    /(?:nome|raz[aã]o|respons[aá]vel)\s*:?\s*([A-Za-zÀ-ÿ\s]{5,60}?)(?:\s*(?:,|\.|CNPJ|CPF|cep|endereço|banco|$))/i,
  );
  if (fullName?.[1]) {
    args.businessName = fullName[1].trim();
  }
  const cep = msg.match(/(?:cep\s*:?\s*)(\d{5}-?\d{3})/i);
  if (cep?.[1]) {
    args.cep = cep[1];
  }
  const bank = msg.match(/(?:banco\s*:?\s*)(\d{3})/i);
  if (bank?.[1]) {
    args.bankCode = bank[1];
  }
  const ag = msg.match(/(?:ag[eê]ncia\s*:?\s*)(\d+)/i);
  if (ag?.[1]) {
    args.agency = ag[1];
  }
  const cc = msg.match(/(?:conta\s*:?\s*)(\d+[-\d]*)/i);
  if (cc?.[1]) {
    args.account = cc[1];
  }
  return args;
}
