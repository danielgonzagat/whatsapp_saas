// Wave 67 Phase 1 split — see docs/architecture/WAVE_60_GUEST_CHAT_ACTION_INTENT_DECOMP_PLAN.md.
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
