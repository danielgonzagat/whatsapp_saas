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

export function extractProductName(msg: string): string {
  const m = msg.match(
    /(?:produto|plano|oferta|checkout|cupom)\s+(?:chamad[oa]|de\s+)?["']?([A-Za-zÀ-ÿ0-9\s\-.]{2,60}?)(?:\s*(?:R\$|pre[çc]o|valor|\bcom\b|\bpor\b|$)|$)/i,
  );
  const name = (m?.[1] || '').trim();
  // Strip leading prepositions and trailing punctuation
  return name.replace(/^(para|do|da|de|no|na|em|o|a)\s+/i, '').replace(/[.,;:!]+$/, '').trim();
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
    case 'update_product': {
      const p = (r.product as Record<string, unknown> | undefined) ?? {};
      return `Produto ${s(p.name)} atualizado. Preco: R$ ${s(p.price)}`;
    }
    case 'delete_product':
      return 'Produto removido.';
    case 'create_plan': {
      const p = (r.plan as Record<string, unknown> | undefined) ?? {};
      return `Plano ${s(p.name)} criado! R$ ${s(p.price)}`;
    }
    case 'get_product_plans': {
      const plans = Array.isArray(r.plans) ? (r.plans as Array<Record<string, unknown>>) : [];
      if (plans.length === 0) {
        return 'Nenhum plano para este produto.';
      }
      return `Planos: ${plans.map((p) => `${s(p.name)} - R$ ${s(p.price)}`).join(', ')}`;
    }
    case 'create_checkout':
      return `Checkout ${s(r.name || r.checkoutName, 'criado')}!`;
    case 'create_coupon':
      return `Cupom ${s(r.code)} criado!`;
    case 'list_coupons': {
      const coupons = Array.isArray(r.coupons) ? (r.coupons as Array<Record<string, unknown>>) : [];
      if (coupons.length === 0) {
        return 'Nenhum cupom.';
      }
      return `Cupons: ${coupons.map((c) => `${s(c.code)} (${s(c.discountType)})`).join(', ')}`;
    }
    case 'get_product_urls': {
      const urls = Array.isArray(r.urls) ? (r.urls as Array<Record<string, unknown>>) : [];
      if (urls.length === 0) {
        return 'Nenhuma URL configurada.';
      }
      return `URLs: ${urls.map((u) => `${s(u.label || u.url)}`).join(', ')}`;
    }
    case 'create_payment_link': {
      const pix = s(r.pixCopyPaste);
      if (pix) {
        return `PIX copia e cola: ${pix}`;
      }
      const link = s(r.paymentLink || r.url);
      if (link) {
        return `Link de pagamento: ${link}`;
      }
      const boleto = s(r.boletoCode || r.boletoBarcode, 'N/A');
      if (boleto !== 'N/A') {
        return `Boleto: ${boleto}`;
      }
      return `Pagamento gerado. ID: ${s(r.paymentId || r.id, 'N/A')}`;
    }
    case 'generate_boleto':
      return `Boleto: ${s(r.boletoUrl || r.boletoCode, 'gerado')}`;
    case 'get_wallet_balance': {
      const bal = (r.balance as Record<string, unknown> | undefined) ?? {};
      const avail = typeof bal.available === 'number' ? bal.available : 0;
      const pend = typeof bal.pending === 'number' ? bal.pending : 0;
      return `Saldo: R$ ${avail.toFixed(2)} disponivel, R$ ${pend.toFixed(2)} pendente.`;
    }
    case 'get_wallet_statement': {
      const items = Array.isArray(r.items) ? (r.items as Array<Record<string, unknown>>) : [];
      if (items.length === 0) {
        return 'Extrato vazio.';
      }
      const total = items.reduce(
        (sum: number, i) => sum + (typeof i.amount === 'number' ? i.amount : 0),
        0,
      );
      return `Extrato: ${items.length} movimentacoes, total R$ ${total.toFixed(2)}.`;
    }
    case 'list_orders': {
      const orders = Array.isArray(r.orders) ? (r.orders as Array<Record<string, unknown>>) : [];
      if (orders.length === 0) {
        return 'Nenhuma venda ainda.';
      }
      const total = orders.reduce(
        (sum: number, o) => sum + (typeof o.amount === 'number' ? o.amount : 0),
        0,
      );
      const paid = orders.filter((o: Record<string, unknown>) => o.status === 'paid').length;
      return `Vendas: ${orders.length} pedidos (${paid} pagos), total R$ ${total.toFixed(2)}.`;
    }
    case 'get_sales_summary': {
      const summary = (r.summary as Record<string, unknown> | undefined) ?? {};
      const revenue =
        typeof summary.totalRevenue === 'number'
          ? summary.totalRevenue
          : Number(s(r.total || r.revenue, '0'));
      const count = typeof summary.totalSales === 'number' ? summary.totalSales : '?';
      return `Resumo (${s(summary.period, '7d')}): ${count} vendas, R$ ${revenue}.`;
    }
    case 'get_abandonments': {
      const items = Array.isArray(r.items || r.abandonments)
        ? ((r.items || r.abandonments) as Array<Record<string, unknown>>)
        : [];
      return `${items.length} carrinhos abandonados.`;
    }
    case 'get_analytics': {
      const visits = s(r.visits || r.pageViews, '0');
      return `Metricas: ${visits} visitas.`;
    }
    case 'search_agent_memory': {
      const results = Array.isArray(r.results || r.items)
        ? ((r.results || r.items) as Array<Record<string, unknown>>)
        : [];
      if (results.length === 0) {
        return 'Nenhuma memoria encontrada.';
      }
      return `Memorias: ${results.length} resultados.`;
    }
    case 'search_agent_sessions': {
      const results = Array.isArray(r.results || r.sessions)
        ? ((r.results || r.sessions) as Array<Record<string, unknown>>)
        : [];
      if (results.length === 0) {
        return 'Nenhuma conversa encontrada.';
      }
      return `Converas: ${results.length} sessoes.`;
    }
    case 'toggle_theme':
      return `Tema alterado para ${s(r.theme, 'light')}.`;
    case 'get_settings': {
      const name = s(r.name, 'N/A');
      return `Configuracoes de ${name}.`;
    }
    case 'git_status': {
      const count = typeof r.fileCount === 'number' ? r.fileCount : 0;
      const files = Array.isArray(r.files) ? (r.files as string[]) : [];
      if (files.length === 0) {
        return 'Git: working tree clean.';
      }
      return `Git: ${count} files changed (${files.slice(0, 5).join(', ')}${files.length > 5 ? '...' : ''})`;
    }
    case 'git_log': {
      const count = typeof r.count === 'number' ? r.count : 0;
      const entries = Array.isArray(r.entries) ? (r.entries as string[]) : [];
      if (entries.length === 0) {
        return 'Git log: vazio.';
      }
      return `Git log (${count}): ${entries.slice(0, 3).join(' | ')}`;
    }
    case 'git_diff': {
      const diff = typeof r.diff === 'string' ? r.diff : '';
      return `Git diff: ${diff.slice(0, 200)}`;
    }
    case 'code_outline': {
      const symbols = Array.isArray(r.symbols) ? (r.symbols as Array<Record<string, unknown>>) : [];
      const file = typeof r.file === 'string' ? r.file : '';
      return `Codigo ${file}: ${symbols.length} simbolos.`;
    }
    case 'build_status': {
      const results = (r.results as Record<string, string> | undefined) ?? {};
      const parts = Object.entries(results).map(
        ([k, v]) => `${k}: ${v === 'clean' ? 'OK' : 'ERR'}`,
      );
      return `Build: ${parts.join(', ')}`;
    }
    case 'read_prisma_schema': {
      const tables = Array.isArray(r.tables) ? (r.tables as string[]) : [];
      return `Schema: ${tables.length} tabelas.`;
    }
    case 'search_codebase': {
      const matches = Array.isArray(r.matches) ? (r.matches as string[]) : [];
      return `Codebase: ${matches.length} matches.`;
    }
    case 'run_backend_tests': {
      const passed = typeof r.passed === 'number' ? r.passed : 0;
      const failed = typeof r.failed === 'number' ? r.failed : 0;
      return `Testes: ${passed} pass, ${failed} fail.`;
    }
    case 'code_lint':
    case 'code_detect_issues': {
      const issues = Array.isArray(r.issues) ? (r.issues as string[]) : [];
      return `Issues: ${issues.length} encontrados.`;
    }
    default:
      return typeof r.message === 'string' ? r.message : 'Acao concluida.';
  }
}
