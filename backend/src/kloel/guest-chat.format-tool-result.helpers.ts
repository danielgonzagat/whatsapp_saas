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
