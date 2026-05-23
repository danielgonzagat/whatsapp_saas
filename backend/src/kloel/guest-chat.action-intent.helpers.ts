export function detectActionIntent(
  message: string,
): { tool: string; args: Record<string, unknown> } | null {
  const msg = message.toLowerCase().trim();

  // ── PRODUTOS ──
  if (/cria(r|ndo)? (produto|oferta|novo)/.test(msg) || /cadastra(r|ndo)? produto/.test(msg)) {
    return { tool: 'create_product', args: extractProductArgs(msg) };
  }
  if (/lista(r|ndo)? (produtos|meus produtos|ofertas|cat[aá]logo)/.test(msg)) {
    return { tool: 'list_products', args: {} };
  }
  if (
    /edita(r|ndo)? produto|atualiza(r|ndo)? produto|muda(r|ndo)? produto|alterar produto/.test(msg)
  ) {
    return { tool: 'update_product', args: extractProductArgs(msg) };
  }
  if (/(apaga(r|ndo)?|deleta(r|ndo)?|exclui(r|ndo)?|remove(r|ndo)?) produto/.test(msg)) {
    return { tool: 'delete_product', args: { productName: extractProductName(msg) } };
  }

  // ── PLANOS ──
  if (/cria(r|ndo)? (plano|parcelamento)/.test(msg)) {
    return { tool: 'create_plan', args: extractPlanArgs(msg) };
  }
  if (/lista(r|ndo)? planos?/.test(msg)) {
    return { tool: 'get_product_plans', args: { productName: extractProductName(msg) } };
  }

  // ── CHECKOUTS ──
  if (/cria(r|ndo)? checkout/.test(msg)) {
    return { tool: 'create_checkout', args: { productName: extractProductName(msg) } };
  }

  // ── CUPONS ──
  if (/cria(r|ndo)? cupom/.test(msg)) {
    return { tool: 'create_coupon', args: { productName: extractProductName(msg) } };
  }
  if (/lista(r|ndo)? cupons?/.test(msg)) {
    return { tool: 'list_coupons', args: {} };
  }
  if (/(apaga(r|ndo)?|deleta(r|ndo)?|remove(r|ndo)?) cupom/.test(msg)) {
    return { tool: 'delete_coupon', args: { productName: extractProductName(msg) } };
  }

  // ── PAGAMENTOS ──
  if (/(gera(r|ndo)?|emiti(r|ndo)?) (pix|cobrança|pagamento)/.test(msg)) {
    return { tool: 'create_payment_link', args: extractPaymentArgs(msg) };
  }
  if (/(gera(r|ndo)?|emiti(r|ndo)?) boleto/.test(msg)) {
    return { tool: 'generate_boleto', args: extractPaymentArgs(msg) };
  }

  // ── CARTEIRA ──
  if (/(meu )?saldo|carteira/.test(msg)) {
    return { tool: 'get_wallet_balance', args: {} };
  }
  if (/extrato|hist[oó]rico.*financeiro/.test(msg)) {
    return { tool: 'get_wallet_statement', args: {} };
  }
  if (/saque|solicitar saque/.test(msg)) {
    return { tool: 'request_withdrawal', args: {} };
  }

  // ── VENDAS ──
  if (/(minhas )?vendas|pedidos/.test(msg)) {
    return { tool: 'list_orders', args: {} };
  }
  if (/abandonos|abandonou|carrinho abandonado/.test(msg)) {
    return { tool: 'get_abandonments', args: {} };
  }
  if (/relatorio|resumo.*venda/.test(msg)) {
    return { tool: 'get_sales_summary', args: {} };
  }
  if (/m[eé]tricas|analytics|dashboard/.test(msg)) {
    return { tool: 'get_analytics', args: {} };
  }

  // ── CRM / LEADS ──
  if (
    /(busca(r|ndo)?|procura(r|ndo)?|pesquisa(r|ndo)?) (lead|cliente|contato|comprador)/.test(msg)
  ) {
    return { tool: 'search_agent_memory', args: { query: msg } };
  }

  // ── CONVERSAS / MEMÓRIA ──
  if (
    /(busca(r|ndo)?|procura(r|ndo)?|pesquisa(r|ndo)?) (conversa|mem[oó]ria|hist[oó]rico|sess[aã]o)/.test(
      msg,
    )
  ) {
    return { tool: 'search_agent_sessions', args: { query: msg } };
  }

  // ── APARÊNCIA ──
  if (/modo (escuro|claro)|tema|dark mode/.test(msg)) {
    return { tool: 'toggle_theme', args: { theme: /escuro|dark/.test(msg) ? 'dark' : 'light' } };
  }

  // ── CONFIGURAÇÕES ──
  if (/(meus |minhas )?configura[cç][oõ]es|dados (pessoais|fiscais|banc[aá]rios)/.test(msg)) {
    return { tool: 'get_settings', args: {} };
  }

  // ── URLs / PÁGINAS ──
  if (/urls?.*(produto|p[aá]gina)/.test(msg) || /p[aá]gina.*vendas/.test(msg)) {
    return { tool: 'get_product_urls', args: { productName: extractProductName(msg) } };
  }

  // ── AFILIADOS ──
  if (/afiliados?|comiss[aã]o|programa.*afiliado/.test(msg)) {
    return { tool: 'get_affiliate_config', args: {} };
  }

  // ── CÓDIGO (Meta 1 — self-code consciousness) ──
  if (/git.status|git status|estado do git/.test(msg)) {
    return { tool: 'git_status', args: {} };
  }
  if (/git.log|git log|hist[oó]rico.*commit/.test(msg)) {
    return { tool: 'git_log', args: { count: 5 } };
  }
  if (/git.diff|git diff|mudan[cç]as.*c[oó]digo/.test(msg)) {
    return { tool: 'git_diff', args: {} };
  }
  if (/c[oó]digo.*(fonte|source)|ler.*arquivo|read.*file|estrutura.*c[oó]digo/.test(msg)) {
    const pathMatch = msg.match(/(?:arquivo|file|path)\s+(?:de\s+)?['"]?([a-zA-Z0-9_\-/.]+)/i);
    const extracted = pathMatch?.[1] || '';
    const filePath = extracted.includes('.')
      ? extracted
      : 'backend/src/kloel/guest-chat.action-intent.helpers.ts';
    return { tool: 'code_outline', args: { path: filePath } };
  }
  if (/build|compila[rç]|status.*build/.test(msg)) {
    return { tool: 'build_status', args: { scope: 'backend' } };
  }
  if (/teste|rodar test|executar test/.test(msg)) {
    return { tool: 'run_backend_tests', args: {} };
  }
  if (/schema|prisma|banco.*dados|database/.test(msg)) {
    return { tool: 'read_prisma_schema', args: {} };
  }
  if (/busca(r|ndo)?.*c[oó]digo|pesquisa(r|ndo)?.*c[oó]digo|grep/.test(msg)) {
    return {
      tool: 'search_codebase',
      args: { pattern: msg.replace(/.*c[oó]digo\s*/, '').trim() || '.' },
    };
  }

  return null;
}

function extractProductName(msg: string): string {
  const m = msg.match(
    /(?:produtos?|planos?|ofertas?|checkouts?|cupons?)\s+(?:chamad[oa]|de\s+)?["']?([A-Za-zÀ-ÿ0-9\s\-.]{2,60}?)(?:\s*(?:R\$|pre[çc]o|valor|\bcom\b|\bpor\b|\.\s+[A-ZÀ]|$)|$)/i,
  );
  const name = (m?.[1] || '').trim();
  // Strip leading prepositions and trailing punctuation
  return name
    .replace(/^(para|do|da|de|no|na|em|o|a)\s+/i, '')
    .replace(/[.,;:!]+$/, '')
    .trim();
}

function extractProductArgs(msg: string): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  args.productName = extractProductName(msg);
  const name = extractProductName(msg);
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
  return args;
}

function extractPlanArgs(msg: string): Record<string, unknown> {
  const args: Record<string, unknown> = { productName: extractProductName(msg) };
  // Plan name: "Nome: X" or "Nome X" or "chamado X"
  const nm = msg.match(
    /(?:nome|chamad[oa]|plano)\s*:?\s*([A-Za-zÀ-ÿ0-9\s-]{2,30}?)(?:\s*(?:,|\.|pre[çc]o|R\$|valor|com|por|$))/i,
  );
  if (nm && nm[1]) {
    args.planName = nm[1].trim();
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
  return args;
}

function extractPaymentArgs(msg: string): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  const name = extractProductName(msg);
  if (name) {
    args.productName = name;
  }
  const am = msg.match(/R\$\s*(\d+[.,]?\d*)/);
  if (am && am[1]) {
    args.amount = parseFloat(am[1].replace(',', '.'));
  }
  const nm = msg.match(/para\s+([A-Za-zÀ-ÿ]{3,30}(?:\s+[A-Za-zÀ-ÿ]{3,30})?)/i);
  if (nm && nm[1]) {
    args.customerName = nm[1].trim();
  }
  return args;
}

export { formatToolResult } from './guest-chat.format-tool-result.helpers';
