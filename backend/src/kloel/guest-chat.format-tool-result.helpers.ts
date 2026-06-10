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
    case 'create_product':
    case 'products.create': {
      const p = (r.product as Record<string, unknown> | undefined) ?? {};
      const format = s(p.format);
      const category = s(p.category);
      const fmt = format ? ` (${format})` : '';
      const cat = category ? ` [${category}]` : '';
      return `Produto ${s(p.name)}${cat}${fmt} criado! R$ ${s(p.price)}`;
    }
    case 'update_product':
    case 'products.update': {
      const p = (r.product as Record<string, unknown> | undefined) ?? {};
      return `Produto ${s(p.name)} atualizado. Preco: R$ ${s(p.price)}`;
    }
    case 'delete_product':
      return 'Produto removido.';
    case 'create_plan':
    case 'plans.create': {
      const p = (r.plan as Record<string, unknown> | undefined) ?? {};
      const pn = s(p.name);
      return pn === 'Plano'
        ? `Plano criado! R$ ${s(p.price)}`
        : `Plano ${pn} criado! R$ ${s(p.price)}`;
    }
    case 'update_plan':
    case 'plans.update': {
      const p = (r.plan as Record<string, unknown> | undefined) ?? {};
      return `Plano ${s(p.name)} atualizado. Preco: R$ ${s(p.price)}`;
    }
    case 'get_product_plans': {
      const plans = Array.isArray(r.plans) ? (r.plans as Array<Record<string, unknown>>) : [];
      if (plans.length === 0) {
        return 'Nenhum plano para este produto.';
      }
      return `Planos: ${plans.map((p) => `${s(p.name)} - R$ ${s(p.price)}`).join(', ')}`;
    }
    case 'create_checkout':
    case 'checkouts.create':
      return `Checkout ${s(r.name || r.checkoutName, 'criado')}!`;
    case 'update_checkout':
    case 'checkouts.update':
      return `Checkout ${s(r.name || r.checkoutName, 'criado')} atualizado.`;
    case 'create_coupon':
    case 'coupons.create': {
      const cc = (r.coupon as Record<string, unknown> | undefined) ?? {};
      return `Cupom ${s(cc.code || r.code)} criado!`;
    }
    case 'update_coupon': {
      const coupon = (r.coupon as Record<string, unknown> | undefined) ?? {};
      const code = typeof coupon.code === 'string' ? coupon.code : '';
      return typeof r.message === 'string' ? r.message : `Cupom ${code} atualizado.`;
    }
    case 'list_checkouts': {
      const chk = Array.isArray(r.checkouts) ? (r.checkouts as Array<Record<string, unknown>>) : [];
      if (chk.length === 0) {
        return 'Nenhum checkout encontrado.';
      }
      return `Checkouts: ${chk.map((c) => s(c.name || c.id)).join(', ')}`;
    }
    case 'delete_coupon':
    case 'coupons.delete':
      return 'Cupom removido.';
    case 'list_coupons': {
      const coupons = Array.isArray(r.coupons) ? (r.coupons as Array<Record<string, unknown>>) : [];
      if (coupons.length === 0) {
        return 'Nenhum cupom.';
      }
      return `Cupons: ${coupons.map((c) => `${s(c.code)} (${s(c.discountType)})`).join(', ')}`;
    }
    case 'self.capabilities':
    case 'list_capabilities': {
      if (typeof r.message === 'string') {
        return r.message;
      }
      const outputs = (r.outputs as Record<string, unknown> | undefined) ?? {};
      const total = typeof outputs.total === 'number' ? outputs.total : undefined;
      return total === undefined
        ? 'Capacidades consultadas no registry vivo.'
        : `${total} capacidades carregadas do registry vivo.`;
    }
    case 'self.gaps':
    case 'self.explain':
      return typeof r.message === 'string' ? r.message : 'Auto-inspeção consultada.';
    case 'self.health': {
      if (typeof r.message === 'string') {
        return r.message;
      }
      const outputs = (r.outputs as Record<string, unknown> | undefined) ?? {};
      const status = typeof outputs.status === 'string' ? outputs.status : 'consultada';
      return `Saúde do Kloel: ${status}.`;
    }
    case 'get_product_urls': {
      const urls = Array.isArray(r.customUrls)
        ? (r.customUrls as Array<Record<string, unknown>>)
        : [];
      if (urls.length === 0) {
        return `Nenhuma URL cadastrada para este produto.`;
      }
      return `URLs: ${urls.map((u) => `${s(u.description)} → ${s(u.url)}`).join(', ')}`;
    }
    case 'get_product_reviews': {
      const revs = Array.isArray(r.reviews) ? (r.reviews as Array<Record<string, unknown>>) : [];
      if (revs.length === 0) {
        return 'Nenhuma avaliação encontrada.';
      }
      return `Avaliações (${revs.length}): ${revs
        .map((rv) => `★${s(rv.rating, '?')} ${s(rv.comment)}`.substring(0, 60))
        .join(' | ')}`;
    }
    case 'get_product_ai_config':
      return s(r.message, 'Configuracao de IA consultada.');
    case 'create_payment_link':
    case 'generate_pix':
    case 'sales.create_pix': {
      const outputs = readRecord(r.outputs);
      const pix = s(
        r.pixCopiaECola || r.pixCopyPaste || outputs.pixCopiaECola || outputs.pixCopyPaste,
      );
      const qr = s(r.pixQrCode || r.qrCodeBase64 || outputs.pixQrCode || outputs.qrCodeBase64);
      const link = s(
        r.paymentLink || r.paymentUrl || r.url || outputs.paymentLink || outputs.paymentUrl,
      );
      const id = s(
        r.saleId || r.orderId || r.paymentId || r.id || outputs.saleId || outputs.orderId,
      );
      if (pix) {
        const proofId = id ? ` ID: ${id}.` : '';
        const qrProof = qr ? ' QR code disponivel.' : '';
        return `PIX gerado.${proofId}${qrProof} PIX copia e cola: ${pix}`;
      }
      if (link) {
        return `Link de pagamento: ${link}`;
      }
      return 'Erro: pix_receipt_missing';
    }
    case 'sales.create_card_link': {
      const outputs = readRecord(r.outputs);
      const link = s(
        r.checkoutUrl || r.paymentUrl || r.paymentLink || outputs.checkoutUrl || outputs.paymentUrl,
      );
      if (!link) {
        return 'Erro: card_link_receipt_missing';
      }
      const id = s(
        r.saleId || r.orderId || r.paymentId || r.id || outputs.saleId || outputs.orderId,
      );
      return `Link de cartão gerado${id ? ` para venda ${id}` : ''}: ${link}`;
    }
    case 'sales.create_boleto':
    case 'generate_boleto': {
      const outputs = readRecord(r.outputs);
      const boleto = s(
        r.boletoCode ||
          r.boletoBarcode ||
          r.boletoUrl ||
          r.boletoPdf ||
          outputs.boletoCode ||
          outputs.boletoBarcode ||
          outputs.boletoUrl ||
          outputs.boletoPdf,
      );
      if (!boleto) {
        return 'Erro: boleto_receipt_missing';
      }
      const id = s(
        r.saleId || r.orderId || r.paymentId || r.id || outputs.saleId || outputs.orderId,
      );
      return `Boleto gerado${id ? ` para venda ${id}` : ''}: ${boleto}`;
    }
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
    case 'list_refunds': {
      const rfunds = Array.isArray(r.orders) ? (r.orders as Array<Record<string, unknown>>) : [];
      if (rfunds.length === 0) {
        return 'Nenhum estorno encontrado.';
      }
      return `Estornos: ${rfunds.length} pedido(s).`;
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
    case 'get_product_details': {
      const p = (r.product as Record<string, unknown> | undefined) ?? {};
      const plans = typeof p.planCount === 'number' ? p.planCount : 0;
      return `Produto ${s(p.name)}: ${s(p.description || p.category)} - R$ ${s(p.price)}. ${plans} planos. Ativo: ${p.active ? 'sim' : 'nao'}. URL: ${s(p.salesPageUrl, 'nao definida')}`;
    }
    case 'list_subscriptions': {
      const subs = Array.isArray(r.subscriptions)
        ? (r.subscriptions as Array<Record<string, unknown>>)
        : [];
      if (subs.length === 0) {
        return 'Nenhuma assinatura ativa.';
      }
      return `Assinaturas: ${subs.map((sub) => `${s(sub.plan)} (${s(sub.status)})`).join(', ')}`;
    }
    case 'request_withdrawal':
      return s(r.message, 'Saque processado.');
    case 'update_fiscal_data':
      return 'Dados atualizados com sucesso.';
    case 'search_agent_memory': {
      const results = Array.isArray(r.results || r.items || r.leads || r.contacts)
        ? ((r.results || r.items || r.leads || r.contacts) as Array<Record<string, unknown>>)
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
    case 'get_affiliate_config': {
      const partners = Array.isArray(r.partners)
        ? (r.partners as Array<Record<string, unknown>>)
        : [];
      const active = typeof r.activeCount === 'number' ? r.activeCount : 0;
      if (partners.length === 0) {
        return 'Nenhum afiliado cadastrado.';
      }
      return `Afiliados: ${partners.length} total (${active} ativos). ${partners
        .slice(0, 3)
        .map((p) => `${s(p.partnerName)} (${s(p.commissionRate)}%)`)
        .join(', ')}`;
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
    case 'code_outline':
      return 'Checagem privada concluída.';
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
      const results = Array.isArray(r.results) ? (r.results as Array<Record<string, unknown>>) : [];
      const err = typeof r.error === 'string' ? r.error : '';
      if (err) {
        return `Busca: ${err}`;
      }
      if (results.length === 0) {
        return `Busca: nenhum resultado encontrado.`;
      }
      return `Busca: ${results.length} resultados: ${results
        .slice(0, 5)
        .map((x) => `${s(x.file)}:${s(x.line)}`)
        .join(', ')}`;
    }
    case 'run_backend_tests': {
      const passed = typeof r.passed === 'number' ? r.passed : 0;
      const failed = typeof r.failed === 'number' ? r.failed : 0;
      return `Testes: ${passed} pass, ${failed} fail.`;
    }
    case 'code_lint':
      return typeof r.message === 'string' ? r.message : 'Lint executado.';
    // ── NOVAS TOOLS ──
    case 'delete_plan':
      return typeof r.message === 'string' ? r.message : 'Plano removido.';
    case 'delete_checkout':
      return typeof r.message === 'string' ? r.message : 'Checkout removido.';
    case 'add_url':
      return typeof r.message === 'string' ? r.message : 'URL adicionada.';
    case 'update_url':
      return typeof r.message === 'string' ? r.message : 'URL atualizada.';
    case 'delete_url':
      return typeof r.message === 'string' ? r.message : 'URL removida.';
    case 'configure_pixel':
      return typeof r.message === 'string' ? r.message : 'Pixel configurado.';
    case 'configure_shipping':
      return typeof r.message === 'string' ? r.message : 'Frete configurado.';
    case 'configure_social_proof':
      return typeof r.message === 'string' ? r.message : 'Prova social configurada.';
    case 'configure_order_bump':
      return typeof r.message === 'string' ? r.message : 'Order bump configurado.';
    case 'configure_warranty':
      return typeof r.message === 'string' ? r.message : 'Garantia configurada.';
    case 'configure_exit_intent':
      return typeof r.message === 'string' ? r.message : 'Exit intent configurado.';
    case 'configure_after_pay':
      return typeof r.message === 'string' ? r.message : 'After Pay configurado.';
    case 'browse_marketplace':
      if (Array.isArray(r.products)) {
        return `${r.products.length} produtos no marketplace.`;
      }
      return typeof r.message === 'string' ? r.message : 'Marketplace consultado.';
    case 'get_social_channels':
      return typeof r.message === 'string' ? r.message : 'Canais consultados.';
    case 'connect_channel':
      return typeof r.message === 'string' ? r.message : 'Canal conectado.';
    case 'upload_product_image':
      return typeof r.message === 'string' ? r.message : 'Upload de imagem processado.';
    case 'upload_document':
      return typeof r.message === 'string' ? r.message : 'Documento registrado.';
    case 'request_anticipation':
      return typeof r.message === 'string' ? r.message : 'Antecipação solicitada.';
    case 'code_detect_issues': {
      const issues = Array.isArray(r.issues) ? (r.issues as string[]) : [];
      return `Issues: ${issues.length} encontrados.`;
    }
    // ── CODEGRAPH ──
    case 'codegraph_status':
    case 'codegraph_search':
    case 'codegraph_context':
    case 'codegraph_callers':
    case 'codegraph_callees':
    case 'codegraph_impact':
    case 'codegraph_node':
    case 'codegraph_files':
      return typeof r.text === 'string' ? r.text : 'CodeGraph consultado.';
    default:
      if (typeof r.error === 'string') {
        return `Erro: ${r.error}`;
      }
      return typeof r.text === 'string'
        ? r.text
        : typeof r.message === 'string'
          ? r.message
          : 'Acao concluida.';
  }
}

function readStringField(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
}

function readRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readStringList(...values: unknown[]): string[] {
  for (const value of values) {
    if (Array.isArray(value)) {
      return value.filter(
        (item): item is string => typeof item === 'string' && item.trim().length > 0,
      );
    }
  }
  return [];
}

function formatCapabilityProofLabel(capabilityId: string): string {
  const normalized = capabilityId.trim().toLowerCase();
  const labels: Record<string, string> = {
    'self.health': 'saúde operacional',
    'sales.create_pix': 'geração de PIX',
    'sales.create_boleto': 'emissão de boleto',
    'sales.create_card_link': 'link de cartão',
    create_payment_link: 'link de pagamento',
    generate_pix: 'geração de PIX',
    generate_boleto: 'emissão de boleto',
  };
  return labels[normalized] ?? 'ação executada';
}

export function appendToolResultProof(reply: string, result: unknown): string {
  const r = readRecord(result);
  if (r.success === false) {
    return reply;
  }

  const receipt = readRecord(r.receipt);
  const executionRail = readRecord(r.executionRail ?? receipt.executionRail);
  const capabilityId = readStringField(r.capabilityId, receipt.capabilityId);
  const evidenceUrl = readStringField(r.evidenceUrl, receipt.evidenceUrl);
  const auditLogId = readStringField(r.auditLogId, receipt.auditLogId);
  const idempotencyKey = readStringField(r.idempotencyKey, receipt.idempotencyKey);
  const domainEvents = readStringList(r.domainEvents, receipt.domainEvents);
  const provider = readStringField(executionRail.provider);
  const paymentMethod = readStringField(executionRail.paymentMethod);
  const providerMethod = readStringField(executionRail.providerMethod);
  const proofFields = readStringList(executionRail.proofFields);
  const proofLines = [
    capabilityId ? `Ação operacional: ${formatCapabilityProofLabel(capabilityId)}` : '',
    evidenceUrl ? `Evidência: ${evidenceUrl}` : '',
    auditLogId ? `AuditLog: ${auditLogId}` : '',
    provider ? `Provedor: ${provider}` : '',
    paymentMethod ? `Método: ${paymentMethod}` : '',
    providerMethod ? `Método do provedor: ${providerMethod}` : '',
    proofFields.length > 0 ? `Contrato de prova: ${proofFields.join(', ')}` : '',
    domainEvents.length > 0 ? `Eventos: ${domainEvents.join(', ')}` : '',
    idempotencyKey ? `Idempotência: ${idempotencyKey}` : '',
  ].filter((line) => line.length > 0);

  if (proofLines.length === 0) {
    return reply;
  }

  return `${reply}\n\nProva material:\n${proofLines.map((line) => `- ${line}`).join('\n')}`;
}
