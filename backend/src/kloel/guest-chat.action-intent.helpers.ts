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
    return { tool: 'create_plan', args: { productName: extractProductName(msg) } };
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
    return { tool: 'git_log', args: {} };
  }
  if (/c[oó]digo.*(fonte|source)|ler.*arquivo|read.*file/.test(msg)) {
    return { tool: 'code_outline', args: { query: msg } };
  }
  if (/build|compila[rç]|status.*build/.test(msg)) {
    return { tool: 'build_status', args: {} };
  }

  return null;
}

export function extractProductName(msg: string): string {
  const m = msg.match(
    /(?:produto|plano|oferta|checkout|cupom)\s+(?:chamad[oa]|de\s+)?["']?([A-Za-zÀ-ÿ0-9\s\-.]{2,60}?)(?:\s*(?:R\$|pre[çc]o|valor|\bcom\b|\bpor\b|$)|$)/i,
  );
  const name = m?.[1]?.trim() || '';
  return name.replace(/[.,;:!]+$/, '').trim();
}

export function extractProductArgs(msg: string): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  const name = extractProductName(msg);
  if (name) {
    args.name = name;
  }
  // "R$ 147", "R$147", "preco 147", "preço 147", "147 reais", "R$ 147,00"
  const pm =
    msg.match(/(?:R\$\s*|pre[çc]o\s+)(\d+[.,]?\d*)/i) ||
    msg.match(/(\d+[.,]?\d*)\s*(?:reais|real)/i) ||
    msg.match(/R\$\s*(\d+[.,]?\d*)/i);
  if (pm) {
    args.price = parseFloat(pm[1].replace(',', '.'));
  }
  return args;
}

export function extractPaymentArgs(msg: string): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  const name = extractProductName(msg);
  if (name) {
    args.productName = name;
  }
  const am = msg.match(/R\$\s*(\d+[.,]?\d*)/);
  if (am) {
    args.amount = parseFloat(am[1].replace(',', '.'));
  }
  const nm = msg.match(/para\s+([A-Za-zÀ-ÿ]{3,30}(?:\s+[A-Za-zÀ-ÿ]{3,30})?)/i);
  if (nm) {
    args.customerName = nm[1].trim();
  }
  return args;
}

export function formatToolResult(tool: string, result: unknown): string {
  const r = (result as Record<string, unknown> | undefined) ?? {};
  if (r.success === false) {
    const err = typeof r.error === 'string' ? r.error : 'acao falhou';
    return `Erro: ${err}`;
  }
  const s = (v: unknown, fb = ''): string =>
    typeof v === 'string' || typeof v === 'number' ? String(v) : fb;
  switch (tool) {
    case 'list_products': {
      const products = Array.isArray(r.products)
        ? (r.products as Array<Record<string, unknown>>)
        : [];
      if (products.length === 0) {
        return 'Nenhum produto.';
      }
      return `Produtos: ${products.map((p) => `${s(p.name)} - R$ ${s(p.price)}`).join(', ')}`;
    }
    case 'create_product': {
      const p = (r.product as Record<string, unknown> | undefined) ?? {};
      return `Produto ${s(p.name)} criado! R$ ${s(p.price)}`;
    }
    case 'create_plan': {
      const p = (r.plan as Record<string, unknown> | undefined) ?? {};
      return `Plano ${s(p.name)} criado! R$ ${s(p.price)}`;
    }
    case 'list_conversations': {
      const total = s(r.total, '0');
      return `Conversas: ${total} ativas.`;
    }
    case 'create_payment_link': {
      const pix = s(r.pixCopyPaste);
      if (pix) {
        return `PIX: ${pix}`;
      }
      const link = s(r.paymentLink);
      if (link) {
        return `Link de pagamento: ${link}`;
      }
      const boleto = s(r.boletoCode, 'N/A');
      return `Boleto: ${boleto}`;
    }
    case 'toggle_theme': {
      return `Tema alterado para ${s(r.theme, 'light')}.`;
    }
    default:
      return typeof r.message === 'string' ? r.message : 'Acao concluida.';
  }
}
