
export function detectActionIntent(
  message: string,
): { tool: string; args: Record<string, unknown> } | null {
  const msg = message.toLowerCase().trim();
  if (/cria(r|ndo)? (produto|oferta|novo)/.test(msg) || /cadastra(r|ndo)? produto/.test(msg)) {
    return { tool: 'create_product', args: extractProductArgs(msg) };
  }
  if (/lista(r|ndo)? (produtos|meus produtos|ofertas)/.test(msg)) {
    return { tool: 'list_products', args: {} };
  }
  if (/edita(r|ndo)? produto|atualiza(r|ndo)? produto/.test(msg)) {
    return { tool: 'update_product', args: extractProductArgs(msg) };
  }
  if (/cria(r|ndo)? (plano|parcelamento)/.test(msg)) {
    return { tool: 'create_plan', args: { productName: extractProductName(msg) } };
  }
  if (/cria(r|ndo)? checkout/.test(msg)) {
    return { tool: 'create_checkout', args: { productName: extractProductName(msg) } };
  }
  if (/cria(r|ndo)? cupom/.test(msg)) {
    return { tool: 'create_coupon', args: { productName: extractProductName(msg) } };
  }
  if (/(gera(r|ndo)?|emiti(r|ndo)?) (pix|cobrança|pagamento)/.test(msg)) {
    return { tool: 'create_payment_link', args: extractPaymentArgs(msg) };
  }
  if (/(gera(r|ndo)?|emiti(r|ndo)?) boleto/.test(msg)) {
    return { tool: 'generate_boleto', args: extractPaymentArgs(msg) };
  }
  if (/(meu )?saldo|carteira/.test(msg)) {
    return { tool: 'get_wallet_balance', args: {} };
  }
  if (/(minhas )?vendas|pedidos/.test(msg)) {
    return { tool: 'list_orders', args: {} };
  }
  if (/abandonos|abandonou/.test(msg)) {
    return { tool: 'get_abandonments', args: {} };
  }
  if (/relatorio|resumo.*venda/.test(msg)) {
    return { tool: 'get_sales_summary', args: {} };
  }
  if (/modo (escuro|claro)|tema|dark mode/.test(msg)) {
    return { tool: 'toggle_theme', args: { theme: /escuro|dark/.test(msg) ? 'dark' : 'light' } };
  }
  return null;
}

export function extractProductName(msg: string): string {
  const m = msg.match(
    /(?:produto|plano|oferta|checkout|cupom)\s+(?:chamad[oa]|de\s+)?["']?([A-Za-zÀ-ÿ0-9\s]{2,40}?)(?:\s+(?:com|por|R\$|preço|valor|$)|$)/i,
  );
  return m?.[1]?.trim() || '';
}

export function extractProductArgs(msg: string): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  const name = extractProductName(msg);
  if (name) {
    args.name = name;
  }
  const pm = msg.match(/R\$\s*(\d+[\.,]?\d*)/);
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
  const am = msg.match(/R\$\s*(\d+[\.,]?\d*)/);
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
  const r = result as Record<string, unknown> | undefined;
  if (!r) {
    return 'Acao concluida.';
  }
  if (r.success === false) {
    return 'Erro: ' + (r.error || 'acao falhou');
  }
  switch (tool) {
    case 'list_products': {
      const products = r.products as Array<Record<string, unknown>> | undefined;
      if (!products?.length) {
        return 'Nenhum produto.';
      }
      return 'Produtos: ' + products.map((p) => p.name + ' - R$ ' + p.price).join(', ');
    }
    case 'create_product': {
      const p = r.product as Record<string, unknown> | undefined;
      return p ? 'Produto ' + p.name + ' criado! R$ ' + p.price : 'Produto criado.';
    }
    case 'create_plan': {
      const p = r.plan as Record<string, unknown> | undefined;
      return p ? 'Plano ' + p.name + ' - R$ ' + p.price : 'Plano criado.';
    }
    case 'create_checkout': {
      const c = r.checkout as Record<string, unknown> | undefined;
      return c ? 'Checkout ' + c.name + ' criado.' : 'Checkout criado.';
    }
    case 'create_coupon': {
      const c = r.coupon as Record<string, unknown> | undefined;
      return c ? 'Cupom ' + c.code + ' criado.' : 'Cupom criado.';
    }
    case 'get_wallet_balance': {
      const b = r.balance as Record<string, unknown> | undefined;
      if (!b) {
        return 'Saldo indisponivel.';
      }
      return 'Carteira: Disponivel R$ ' + b.available + ' | Pendente R$ ' + b.pending;
    }
    case 'list_orders': {
      const orders = r.orders as Array<Record<string, unknown>> | undefined;
      if (!orders?.length) {
        return 'Nenhuma venda.';
      }
      return (
        'Vendas: ' +
        orders.map((o) => o.product + ' R$' + o.amount + ' (' + o.status + ')').join(', ')
      );
    }
    case 'get_sales_summary': {
      const s = r.summary as Record<string, unknown> | undefined;
      if (!s) {
        return 'Sem dados.';
      }
      return (
        'Resumo (' +
        s.period +
        '): ' +
        s.totalSales +
        ' vendas, R$ ' +
        s.totalRevenue +
        ', ' +
        s.conversionRate +
        '% conversao'
      );
    }
    case 'get_abandonments': {
      return 'Abandonos: ' + (r.total || 0) + ' encontrados.';
    }
    case 'create_payment_link': {
      if (r.pixCopyPaste) {
        return 'PIX: ' + r.pixCopyPaste + ' | R$ ' + r.amount;
      }
      if (r.paymentLink) {
        return 'Link: ' + r.paymentLink + ' | R$ ' + r.amount;
      }
      return 'Link criado.';
    }
    case 'generate_boleto': {
      return 'Boleto gerado. Codigo: ' + (r.boletoCode || 'N/A') + ' | R$ ' + r.amount;
    }
    case 'toggle_theme': {
      return 'Tema alterado para ' + (r.theme || 'light') + '.';
    }
    default:
      return 'Acao ' + tool + ' executada.';
  }
}