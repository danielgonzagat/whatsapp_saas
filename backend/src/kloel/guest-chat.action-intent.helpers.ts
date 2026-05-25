export function detectActionIntent(
  message: string,
): { tool: string; args: Record<string, unknown> } | null {
  const msg = message.toLowerCase().trim();

  // ── PRODUTOS ──
  if (/cria(r|ndo)?\s+(?:um[a]?\s+)?(produto|oferta|novo)/.test(msg) || /cadastra(r|ndo)?\s+(?:um[a]?\s+)?produto/.test(msg)) {
    return { tool: 'create_product', args: extractProductArgs(msg) };
  }
  if (/lista(r|ndo)? (produtos|meus produtos|ofertas|cat[aá]logo)/.test(msg)) {
    return { tool: 'list_products', args: {} };
  }
  if (
    /(?:edita|atualiza|muda|altera)(?:r|ndo)?\s+(?:um[a]?\s+)?(?:o\s+)?produto/.test(msg)
  ) {
    return { tool: 'update_product', args: extractProductArgs(msg) };
  }
  if (/(apaga|deleta|exclui|remove)(?:r|ndo)?\s+(?:um[a]?\s+)?(?:o\s+)?produto/.test(msg)) {
    return { tool: 'delete_product', args: { productName: extractProductName(msg) } };
  }

  // ── DELETAR PLANO / CHECKOUT ──
  if (/(apaga(?:r|ndo)?|deleta(?:r|ndo)?|exclui(?:r|ndo)?|remove(?:r|ndo)?)\s+(?:o\s+)?plano/.test(msg)) {
    return { tool: 'delete_plan', args: { planName: extractProductName(msg), productName: extractProductName(msg) } };
  }
  if (/(apaga(?:r|ndo)?|deleta(?:r|ndo)?|exclui(?:r|ndo)?|remove(?:r|ndo)?)\s+(?:o\s+)?checkout/.test(msg)) {
    return { tool: 'delete_checkout', args: { checkoutName: extractProductName(msg), productName: extractProductName(msg) } };
  }

  // ── URL CRUD ──
  if (/(adiciona(?:r|ndo)?|cria(?:r|ndo)?|nova|novo)\s+url/.test(msg)) {
    return { tool: 'add_url', args: extractUrlArgs(msg) };
  }
  if (/(edita(?:r|ndo)?|atualiza(?:r|ndo)?|muda(?:r|ndo)?|altera(?:r|ndo)?)\s+url/.test(msg)) {
    return { tool: 'update_url', args: extractUrlArgs(msg) };
  }
  if (/(apaga|deleta|exclui|remove)\s+url/.test(msg)) {
    return { tool: 'delete_url', args: { urlLabel: extractProductName(msg) } };
  }

  // ── DETALHES DO PRODUTO ──
  if (/(detalhes|info|mostra|ver|exib)\s+(do|o|sobre)\s+(produto|oferta)/.test(msg)) {
    return { tool: 'get_product_details', args: { productName: extractProductName(msg) } };
  }

  // ── PLANOS ──
  if (/cria(r|ndo)?\s+(?:um[a]?\s+)?(plano|parcelamento)/.test(msg)) {
    return { tool: 'create_plan', args: extractPlanArgs(msg) };
  }
  if (/lista(r|ndo)? planos?/.test(msg)) {
    return { tool: 'get_product_plans', args: { productName: extractProductName(msg) } };
  }

  // ── CHECKOUTS ──
  if (/cria(r|ndo)?\s+(?:um[a]?\s+)?checkout/.test(msg)) {
    return { tool: 'create_checkout', args: extractPlanArgs(msg) };
  }

  if (/(?:lista(?:r|ndo)?|meus|ver|mostra)\s+(?:checkouts?|p[aá]ginas?\s+(?:de\s+)?checkouts?)/.test(msg)) {
    return { tool: 'list_checkouts', args: {} };
  }

  // ── CUPONS ──
  if (/cria(r|ndo)?\s+(?:um[a]?\s+)?cupom/.test(msg)) {
    return { tool: 'create_coupon', args: extractCouponArgs(msg) };
  }
  if (/lista(r|ndo)?\s+(?:meus\s+)?cupons?/.test(msg)) {
    return { tool: 'list_coupons', args: {} };
  }
  if (/(apaga(r|ndo)?|deleta(r|ndo)?|remove(r|ndo)?) cupom/.test(msg)) {
    return { tool: 'delete_coupon', args: extractCouponArgs(msg) };
  }

  // ── CRIAR VENDA / PEDIDO MANUAL ──
  if (/(cria|gera|nova|novo)(?:r|ndo)?\s+(?:um[a]?\s+)?(venda|pedido|order)/.test(msg)) {
    return { tool: 'create_order', args: extractPaymentArgs(msg) };
  }

  // ── PAGAMENTOS ──
  if (/(gera|emiti)(?:r|ndo)?\s+(?:um[a]?\s+)?(pix|cobran[cç]a|pagamento)/.test(msg)) {
    return { tool: 'create_payment_link', args: extractPaymentArgs(msg) };
  }
  if (/(gera|emite|emiti)(?:r|ndo)?\s+(?:um[a]?\s+)?boleto/.test(msg)) {
    return { tool: 'generate_boleto', args: extractPaymentArgs(msg) };
  }

  // ── CARTEIRA ── (saque antes de saldo para evitar match parcial)
  if (/saque|solicitar saque|(?:quero|preciso|gostaria|vou)\s+sacar/.test(msg)) {
    return { tool: 'request_withdrawal', args: {} };
  }
  if (/(meu )?saldo|carteira/.test(msg)) {
    return { tool: 'get_wallet_balance', args: {} };
  }
  if (/extrato|hist[oó]rico.*financeiro/.test(msg)) {
    return { tool: 'get_wallet_statement', args: {} };
  }

  // ── NPS / CHURN (antes de vendas para nao capturar) ──
  if (/nps|net\s+promoter/i.test(msg)) {
    return { tool: 'get_nps', args: {} };
  }
  if (/churn|cancelamento/i.test(msg)) {
    return { tool: 'get_churn', args: {} };
  }

  // ── URLs / PÁGINAS ── (antes de vendas para capturar "pagina de vendas")
  if (/urls?.*(produto|p[aá]gina)/.test(msg) || /p[aá]gina.*vendas/.test(msg)) {
    return { tool: 'get_product_urls', args: { productName: extractProductName(msg) } };
  }

  // ── VENDAS ── (metricas/analytics antes de vendas)
  if (/m[eé]tricas|analytics|dashboard/.test(msg)) {
    return { tool: 'get_analytics', args: {} };
  }
  if (/relatorio|resumo.*venda/.test(msg)) {
    return { tool: 'get_sales_summary', args: {} };
  }
  if (/(minhas |meus )?vendas|pedidos/.test(msg)) {
    return { tool: 'list_orders', args: {} };
  }
  if (/abandonos?|abandonou|carrinhos? abandonados?/.test(msg)) {
    return { tool: 'get_sales_summary', args: {} };
  }

  // ── CRM / LEADS ──
  if (
    /(busca(?:r|ndo)?|procura(?:r|ndo)?|pesquisa(?:r|ndo)?).*(lead|cliente|contato|comprador)/.test(msg)
  ) {
    return { tool: 'search_agent_memory', args: { query: msg } };
  }

  // ── CONVERSAS / MEMÓRIA ──
  if (
    /(busca(?:r|ndo)?|procura(?:r|ndo)?|pesquisa(?:r|ndo)?)\s+(minhas\s+)?(conversas?|mem[oó]rias?|hist[oó]ricos?|sess[oõ]es?)/.test(
      msg,
    )
  ) {
    return { tool: 'search_agent_sessions', args: { query: msg } };
  }

  // ── PLAN PHOTO UPLOAD ──
  if (/(?:faz\s+)?(?:upload|envia|sobe)\s+(?:da\s+)?(?:foto|imagem)\s+(?:do\s+)?plano/i.test(msg)) {
    return { tool: 'upload_plan_image', args: { planName: extractProductName(msg), productName: extractProductName(msg) } };
  }

  // ── APARÊNCIA ──
  if (/modo (escuro|claro)|tema|dark mode/.test(msg)) {
    return { tool: 'toggle_theme', args: { theme: /escuro|dark/.test(msg) ? 'dark' : 'light' } };
  }

  // ── CONFIGURAÇÕES ──
  if (/(meus |minhas )?configura[cç][oõ]es/.test(msg)) {
    return { tool: 'get_settings', args: {} };
  }

  // ── EDITAR CONFIG AFILIADOS ──
  if (/(?:configura(?:r|ndo)?|atualiza(?:r|ndo)?|edita(?:r|ndo)?|muda(?:r|ndo)?|altera(?:r|ndo)?)\s+(?:o\s+)?(?:programa\s+(?:de\s+)?)?(?:comiss[aã]o\s+(?:de\s+)?)?afiliad/.test(msg)) {
    return { tool: 'update_affiliate_config', args: extractAffiliateArgs(msg) };
  }

  // ── AFILIADOS ──
  if (/afiliados?|comiss[aã]o|programa.*afiliado/.test(msg)) {
    return { tool: 'get_affiliate_config', args: {} };
  }

  // ── EDITAR PLANO / CHECKOUT ──
  if (/(edita(?:r|ndo)?|atualiza(?:r|ndo)?|muda(?:r|ndo)?|altera(?:r|ndo)?)\s+(?:o\s+)?(plano|checkout)/.test(msg)) {
    const isCheckout = /checkout/.test(msg);
    return { tool: isCheckout ? 'update_checkout' : 'update_plan', args: extractPlanArgs(msg) };
  }

  // ── CRM / PIPELINE ──
  if (/pipeline|funil|oportunidades|meu(s)?\s+(pipeline|lead|funil)/.test(msg)) {
    return { tool: 'list_leads', args: {} };
  }
  if (/(detalhes|info)\s+(do\s+)?lead/.test(msg)) {
    return { tool: 'get_lead_details', args: { leadName: extractProductName(msg) } };
  }

  // ── REDES SOCIAIS ──
  if (/redes sociais/.test(msg)) {
    return { tool: 'get_social_channels', args: {} };
  }

  // ── GARANTIA / EXIT INTENT / AFTER PAY ──
  if (/garantia|warranty/.test(msg)) {
    return { tool: 'configure_warranty', args: { productName: extractProductName(msg) } };
  }
  if (/exit intent|popup.*sa[ií]da/.test(msg)) {
    return { tool: 'configure_exit_intent', args: { productName: extractProductName(msg) } };
  }
  if (/after pay|pagamento.*depois|comprar.*depois/.test(msg)) {
    return { tool: 'configure_after_pay', args: { productName: extractProductName(msg) } };
  }

  // ── LISTAR AFILIADOS ──
  if (/(?:lista|mostra|ver|meus)\s+(?:afiliados?|partners?)/.test(msg)) {
    return { tool: 'list_affiliates', args: {} };
  }

  // ── MARKETPLACE / AFILIAR-SE ──
  if (/marketplace|afiliar.se|afiliar a|produtos.*p[uú]blicos/.test(msg)) {
    return { tool: 'browse_marketplace', args: {} };
  }

  // ── VENDAS FÍSICAS / ENVIO / RASTREIO ──
  if (/fulfillment|dropshipping|transportadora/.test(msg)) {
    return { tool: 'configure_shipping', args: { productName: extractProductName(msg) } };
  }

  // ── MULTI-CANAL ── (antes de redes sociais)
  if (/conectar\s+(instagram|facebook|tiktok|email)/.test(msg)) {
    const channel = msg.match(/(instagram|facebook|tiktok|email)/i)?.[1] || '';
    return { tool: 'connect_channel', args: { channel } };
  }
  if (/(?:enviar|mandar|disparar)\s+(?:por\s+)?(instagram|facebook|tiktok|email)/.test(msg)) {
    return { tool: 'send_channel_message', args: { channel: msg.match(/(instagram|facebook|tiktok|email)/i)?.[1] || '' } };
  }

  // ── REDES SOCIAIS ──
  if (/redes sociais/.test(msg)) {
    return { tool: 'get_social_channels', args: {} };
  }

  // ── ESTORNOS ──
  if (/estornos?|reembolsos?|devolu[cç][aã]o|cancelar\s+(venda|pedido)/.test(msg)) {
    return { tool: 'list_refunds', args: {} };
  }

  // ── ANTECIPAÇÕES ──
  if (/antecipa[cç][aã]o|adiantar\s+receb/.test(msg)) {
    return { tool: 'request_anticipation', args: {} };
  }

  // ── AVALIAÇÕES ──
  if (/avalia[cç][oõ]es|reviews/.test(msg)) {
    return { tool: 'get_product_reviews', args: { productName: extractProductName(msg) } };
  }

  // ── ORDER BUMP ──
  if (/order bump|upsell|downsell/.test(msg)) {
    return { tool: 'configure_order_bump', args: { productName: extractProductName(msg) } };
  }

  // ── SOCIAL PROOF ──
  if (/social proof|prova social/.test(msg)) {
    return { tool: 'configure_social_proof', args: { productName: extractProductName(msg) } };
  }

  // ── EDITAR CUPOM ──
  if (/(?:edita(?:r|ndo)?|atualiza(?:r|ndo)?|muda(?:r|ndo)?|altera(?:r|ndo)?)\s+(?:o\s+)?cupom/.test(msg)) {
    return { tool: 'update_coupon', args: extractCouponArgs(msg) };
  }

  // ── WHATSAPP ──
  if (/whatsapp.*(conectar|conex[aã]o|status|verificar)/.test(msg) || /status\s+(do\s+)?whatsapp/.test(msg) || /whatsapp.*(est[aá]|como)/.test(msg)) {
    return { tool: 'get_whatsapp_status', args: {} };
  }
  if (/(envia|manda|dispara)\s+(mensagem|whatsapp|zap)\s+para/.test(msg)) {
    return { tool: 'send_whatsapp_message', args: { message: msg } };
  }
  if (/lista\s+(contatos|chats)\s+whatsapp/.test(msg)) {
    return { tool: 'list_whatsapp_chats', args: {} };
  }

  // ── FRETE / ENTREGA ──
  if (/(configura(r|ndo)?|defini(r|ndo)?|alterar|mudar)\s+(frete|entreg[a]|envio|transportadora)/.test(msg)) {
    return { tool: 'configure_shipping', args: { productName: extractProductName(msg) } };
  }

  // ── ASSINATURAS ──
  if (/minhas\s+assinaturas|gest[aã]o\s+de\s+assinatura|lista(r|ndo)?\s+assinatura/.test(msg)) {
    return { tool: 'list_subscriptions', args: {} };
  }

  // ── PRODUTOS FÍSICOS ──
  if (/(status|rastreio|tracking)\s+(do|de)\s+(envio|pedido|produto)/.test(msg)) {
    return { tool: 'get_order_details', args: { productName: extractProductName(msg) } };
  }

  // ── DADOS FISCAIS / DOCUMENTOS ──
  if (/(atualiza(?:r|ndo)?|salva(?:r|ndo)?|altera(?:r|ndo)?)\s+(meus\s+)?(dados\s+(fiscais|pessoais|banc[aá]rios)|documento)/.test(msg)) {
    return { tool: 'update_fiscal_data', args: extractFiscalArgs(msg) };
  }
  if (/envia(?:r|ndo)?\s+(documento|contrato|identidade|cnpj)/.test(msg)) {
    return { tool: 'upload_document', args: { docType: msg.match(/(identidade|contrato|cnpj)/i)?.[1] || 'document' } };
  }

  // ── UPLOAD / IMAGEM ──
  if (/(faz\s+)?(upload|envia|sobe|essa é a|imagem do|foto do)\s+(?:da\s+)?(imagem|foto|arquivo)\b/.test(msg)) {
    return { tool: 'upload_product_image', args: { productName: extractProductName(msg) } };
  }

  // ── PIXEL ──
  if (/pixel\s+(facebook|google|meta|ads)/.test(msg) || /configura\s+pixel/.test(msg)) {
    return { tool: 'configure_pixel', args: { productName: extractProductName(msg) } };
  }

  // ── E-MAIL / MARKETING ──
  if (/(envia(?:r|ndo)?|manda(?:r|ndo)?|dispara(?:r|ndo)?)\s+(email|campanha|broadcast)/.test(msg)) {
    return { tool: 'create_broadcast', args: { name: extractProductName(msg) } };
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
  if (/(?:lint|problema|erro|issue|bug).*(?:c[oó]digo|code)|detectar|analisar/.test(msg)) {
    return { tool: 'code_detect_issues', args: {} };
  }
  if (/c[oó]digo.*(fonte|source)|ler.*arquivo|read.*file|estrutura|arquivo.*codigo/.test(msg)) {
    const pathMatch = msg.match(/(?:arquivo|file|path|codigo|schema|prisma|fonte|source)\s+(?:de\s+)?['"]?([a-zA-Z0-9_\-/.]+(?:\.prisma|\.ts|\.tsx|\.js|\.json|\.md)?)/i);
    const extracted = pathMatch?.[1] || '';
      const filePath = extracted.includes('.')
        ? (extracted.startsWith('backend/') || extracted.startsWith('frontend/') || extracted.startsWith('worker/')
          ? extracted : `backend/src/${extracted.replace(/^src\//, '')}`)
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
      args: { pattern: (msg.replace(/.*c[oó]digo\s*/, '').trim() || '.').replace(/^por\s+/i, '') },
    };
  }


  // ── CODEGRAPH (Meta 1 — knowledge-graph code intelligence) ──
  if (/codegraph\s+status|status\s+codegraph|estado.*codegraph/.test(msg)) {
    return { tool: 'codegraph_status', args: {} };
  }
  if (/codegraph\s+busca|codegraph\s+search|procura\s+no\s+codegraph/.test(msg)) {
    const qMatch = msg.match(/(?:busca|search|procura|por)\s+(?:no\s+codegraph\s+)?['"]?([A-Za-zÀ-ÿ0-9\s_\-.+]{2,60}?)(?:\s*$|\.|\?)/i);
    return { tool: 'codegraph_search', args: { query: qMatch?.[1]?.trim() || msg } };
  }
  if (/codegraph\s+contexto|contexto\s+codegraph|codegraph\s+context/.test(msg)) {
    const qMatch = msg.match(/(?:contexto|context)\s*:?\s*['"]?([A-Za-zÀ-ÿ0-9\s_\-.+]{2,60}?)(?:\s*$)/i);
    return { tool: 'codegraph_context', args: { task: qMatch?.[1]?.trim() || 'overview' } };
  }
  if (/codegraph\s+(quem\s+chama|callers|quem\s+usa)/.test(msg)) {
    const qMatch = msg.match(/(?:chama|callers|usa)\s+(?:o\s+|a\s+)?['"]?([A-Za-zÀ-ÿ0-9_\-.+]{2,40})/i);
    return { tool: 'codegraph_callers', args: { symbol: qMatch?.[1]?.trim() || '' } };
  }
  if (/codegraph\s+(o\s+que\s+chama|callees|depend[eê]ncias)/.test(msg)) {
    const qMatch = msg.match(/(?:chama|callees|depend[eê]ncias\s+de)\s+(?:o\s+|a\s+)?['"]?([A-Za-zÀ-ÿ0-9_\-.+]{2,40})/i);
    return { tool: 'codegraph_callees', args: { symbol: qMatch?.[1]?.trim() || '' } };
  }
  if (/codegraph\s+impacto|impacto\s+codegraph|codegraph\s+impact/.test(msg)) {
    const qMatch = msg.match(/(?:impacto|impact)\s+(?:de\s+)?['"]?([A-Za-zÀ-ÿ0-9_\-.+]{2,40})/i);
    return { tool: 'codegraph_impact', args: { symbol: qMatch?.[1]?.trim() || '' } };
  }
  if (/codegraph\s+(detalhes|node|info|mostra)/.test(msg)) {
    const qMatch = msg.match(/(?:detalhes|node|info|mostra)\s+(?:o\s+|a\s+)?['"]?([A-Za-zÀ-ÿ0-9_\-.+]{2,40})/i);
    return { tool: 'codegraph_node', args: { symbol: qMatch?.[1]?.trim() || '' } };
  }
  if (/codegraph\s+(arquivos|files|[aá]rvore|estrutura)/.test(msg)) {
    return { tool: 'codegraph_files', args: {} };
  }
  return null;
}

export function extractProductName(msg: string): string {
  // Try "para Produto X" pattern (for commands ending with product reference)
  const prodMatch = msg.match(/para\s+(?:o\s+|a\s+)?(?:produto\s+)?["']?([A-Za-zÀ-ÿ0-9\s\-\.\+]{2,60}?)(?:\s*(?:,|\.|R\$|pre[çc]o|valor|\bcom\b|\bpor\b|\bpara\b|\burl\b|https?|\bcor\b|\bdescri[cç][aã]o\b|\bdescricao\b|$)|$)/i);
  if (prodMatch?.[1]) {
    const pn = prodMatch[1].trim();
    if (pn.length >= 3) return pn;
  }
  // Try "do Produto X" or "da Oferta X" pattern first (for venda/pedido contexts)
  const doMatch = msg.match(/\b(?:do|da)\s+(?:produto|oferta|plano|checkout|item)?\s*["']?([A-Za-zÀ-ÿ0-9\s\-\.\+]{2,60}?)(?:\s*(?:R\$|pre[çc]o|valor|\bcom\b|\bpor\b|\bpara\b|\bdo\b|\bpara\b|$)|$)/i);
  if (doMatch?.[1]) {
    const cleanName = doMatch[1].trim();
    if (cleanName.length >= 3) return cleanName;
  }
  const m = msg.match(
    /(?:produtos?|planos?|ofertas?|checkouts?|cupons?|vendas?|pedidos?|orders?)\s+(?:chamad[oa]|de\s+)?["']?([A-Za-zÀ-ÿ0-9\s\-\.\+]{2,60}?)(?:\s*(?:R\$|pre[çc]o|valor|\bcom\b|\bpor\b|\bpara\b|\bdo\b|\bmudando\b|\bmuda\b|\bdescri[cç][aã]o\b|\btags?\b|\bgarantia\b|\bcategoria\b|\bformato\b|\bcart[aã]o\b|\bpix\b|\bboleto\b|\bcor\b|\bcupom\b|\.\s+[A-ZÀ]|$)|$)/i,
  );
  const name = (m?.[1] || '').trim() || '';
  // Strip leading prepositions and trailing punctuation
  return name
    .replace(/^(para|do|da|de|no|na|em|o|a)\s+/i, '')
    .replace(/[.,;:!]+$/, '')
    .trim();
}

export function extractProductArgs(msg: string): Record<string, unknown> {
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
    args.price = parseFloat((pm[1] as string).replace(',', '.'));
  }
  // Format: físico, digital, híbrido
  if (/\b(f[ií]sico|digital|h[ií]brido)\b/i.test(msg)) {
    const fmt = msg.match(/\b(f[ií]sico|digital|h[ií]brido)\b/i)?.[1].toLowerCase() || '';
    args.format = fmt === 'físico' || fmt === 'fisico' ? 'PHYSICAL' : fmt === 'digital' ? 'DIGITAL' : 'HYBRID';
  }
  // Category
  const catMatch = msg.match(/(?:categoria|tipo)\s*:?\s*([A-Za-zÀ-ÿ0-9\s]{2,30}?)(?:\s*(?:,|\.|R\$|pre[çc]o|$))/i);
  if (catMatch?.[1]) args.category = catMatch[1].trim();
  // Image URL
  const imgMatch = msg.match(/(?:imagem|foto|image)\s*(?:url|link)?\s*:?\s*(https?:\/\/\S+)/i);
  if (imgMatch?.[1]) args.imageUrl = imgMatch[1];
  // Description
  const descMatch = msg.match(/(?:descri[cç][aã]o|description)\s*:?\s*['"]?([A-Za-zÀ-ÿ0-9\s\-.,!]{5,200}?)(?:\s*(?:,|\.|R\$|pre[çc]o|categoria|formato|tags|garantia|url|$))/i);
  if (descMatch?.[1]) args.description = descMatch[1].trim();
  // Tags
  const tagsMatch = msg.match(/(?:tags?|palavras?[-\s]?chave)\s*:?\s*([A-Za-zÀ-ÿ0-9\s,]{3,100}?)(?:\s*(?:,|\.|R\$|pre[çc]o|$))/i);
  if (tagsMatch?.[1]) args.tags = tagsMatch[1].split(',').map((t: string) => t.trim()).filter(Boolean);
  // Warranty days
  const warrantyMatch = msg.match(/(?:garantia|warranty)\s*(?:de\s+)?(\d+)\s*(?:dias?|days?)/i);
  if (warrantyMatch?.[1]) args.warrantyDays = parseInt(warrantyMatch[1], 10);
  // Sales page URL
  const salesUrlMatch = msg.match(/(?:p[aá]gina\s*(?:de\s+)?vendas|url\s*(?:de\s+)?vendas)\s*:?\s*(https?:\/\/\S+)/i);
  if (salesUrlMatch?.[1]) args.salesPageUrl = salesUrlMatch[1];
  // Thank you URLs
  const thanksUrlMatch = msg.match(/(?:obrigado|thank.?you)\s*(?:url|p[aá]gina)?\s*:?\s*(https?:\/\/\S+)/i);
  if (thanksUrlMatch?.[1]) args.thankyouUrl = thanksUrlMatch[1];
  // Support email
  const emailMatch = msg.match(/(?:email|e-mail|suporte)\s*:?\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
  if (emailMatch?.[1]) args.supportEmail = emailMatch[1];
  // Disponivel para venda
  if (/\b(dispon[ií]vel|ativo|disponivel)\b.*\b(venda|vender)\b/i.test(msg)) args.active = true;
  if (/\b(indispon[ií]vel|pausar|desativar)\b/i.test(msg)) args.active = false;
  return args;
}

export function extractPlanArgs(msg: string): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  // Product name: after "para" or "do produto" — more reliable than extractProductName for plan/checkout contexts
  const prodMatch = msg.match(/para\s+(?:o\s+|a\s+)?(?:produto\s+)?["']?([A-Za-zÀ-ÿ0-9\s\-\.\+]{2,60}?)(?:\s*(?:,|\.|R\$|pre[çc]o|valor|\bcom\b|\bpor\b|\bpara\b|\burl\b|https?|\bcor\b|\bdescri[cç][aã]o\b|\bdescricao\b|$)|$)/i);
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
    args.planName = nm[1].trim();
  }
  // Fallback: extract name directly after "checkout " or "plano " without colon
  if (!args.planName) {
    const directMatch = msg.match(/(?:checkout|plano)\s+(?!com\b|para\b|sem\b|chamad[oa]\b)([A-Z][A-Za-zÀ-ÿ0-9\s-]{2,30}?)(?:\s*(?:,|\.|R\$|pre[çc]o|\bcom\b|\bpor\b|\bpara\b|\bcor\b|$))/i);
    if (directMatch?.[1]) args.planName = directMatch[1].trim();
  }
  // Price
  const pm =
    msg.match(/(?:R\$\s*|pre[çc]o\s*:?\s*)(\d+[.,]?\d*)/i) ||
    msg.match(/(\d+[.,]?\d*)\s*(?:reais|real)/i);
  if (pm && pm[1]) {
    args.price = parseFloat((pm[1] as string).replace(',', '.'));
  }
  // Quantity
  const qm = msg.match(/(?:qtd|quantidade|itens?)\s*:?\s*(\d+)/i);
  if (qm && qm[1]) {
    args.quantity = parseInt(qm[1] as string, 10);
  }
  // Installments
  const instMatch = msg.match(/(\d+)\s*(?:x|vezes|parcelas?)/i);
  if (instMatch?.[1]) args.maxInstallments = parseInt(instMatch[1], 10);
  // Shipping
  if (/frete\s+gr[aá]tis/i.test(msg)) args.shippingType = 'FREE';
  if (/frete\s+fixo/i.test(msg)) args.shippingType = 'FIXED';
  if (/frete\s+vari[aá]vel/i.test(msg)) args.shippingType = 'VARIABLE';
  const shipValue = msg.match(/(?:frete\s+(?:fixo\s+)?(?:de\s+)?)?R\$\s*(\d+[.,]?\d*)/i);
  if (shipValue?.[1]) args.shippingValue = parseFloat(shipValue[1].replace(',', '.'));
  // Origin CEP
  const cepMatch = msg.match(/(?:cep|origem)\s*:?\s*(\d{5}-?\d{3})/i);
  if (cepMatch?.[1]) args.originCep = cepMatch[1];
  // Affiliate visibility
  if (/(?:vis[ií]vel|dispon[ií]vel)\s+(?:para|pr[ao])\s+afiliados?/i.test(msg)) args.visibleToAffiliates = true;
  if (/ocult[oa]\s+(?:para|pr[ao]|de)\s+afiliados?/i.test(msg)) args.visibleToAffiliates = false;
  // Billing type
  if (/\b(assinatura|recorrente|subscript|mensal|anual|semanal)\b/i.test(msg) && !/\b([aà] vista|unico|único)\b/i.test(msg)) args.billingType = 'RECURRING';
  if (/\b(grat[uí]to|free|gratis)\b/i.test(msg)) args.billingType = 'FREE';
  // Recurring interval
  if (/mensal/i.test(msg)) args.recurringInterval = 'MONTHLY';
  if (/anual/i.test(msg)) args.recurringInterval = 'ANNUAL';
  if (/semanal/i.test(msg)) args.recurringInterval = 'WEEKLY';
  // Trial
  if (/\btrial\b|\bper[íi]odo\s+(?:de\s+)?teste\b/i.test(msg)) args.trialEnabled = true;
  const trialMatch = msg.match(/(\d+)\s*dias?\s*(?:de\s+)?(?:trial|teste)/i);
  if (trialMatch?.[1]) { args.trialEnabled = true; args.trialDays = parseInt(trialMatch[1], 10); }
  // Payment methods toggle
  if (/sem\s+cart[aã]o|desativar\s+cart[aã]o/i.test(msg)) { if (!args.paymentMethods) args.paymentMethods = ['pix', 'boleto']; }
  if (/sem\s+pix|desativar\s+pix/i.test(msg)) { if (!args.paymentMethods) args.paymentMethods = ['card', 'boleto']; }
  if (/sem\s+boleto|desativar\s+boleto/i.test(msg)) { if (!args.paymentMethods) args.paymentMethods = ['card', 'pix']; }
  if (/\b(cart[aã]o|pix|boleto)\b.*\b(todos|completo)\b/i.test(msg)) args.paymentMethods = ['card', 'pix', 'boleto'];
  // Custom commission
  const customComm = msg.match(/(?:comiss[aã]o|custom)\s+(?:personalizada|de\s+)?(\d+)\s*%/i);

  // Checkout-specific
  if (/cart[aã]o/i.test(msg) && !/desmarc|remover|tirar/i.test(msg)) {
    if (!args.paymentMethods) args.paymentMethods = [];
    (args.paymentMethods as string[]).push('card');
  }
  if (/pix/i.test(msg) && !/desmarc|remover|tirar/i.test(msg)) {
    if (!args.paymentMethods) args.paymentMethods = [];
    (args.paymentMethods as string[]).push('pix');
  }
  if (/boleto/i.test(msg) && !/desmarc|remover|tirar/i.test(msg)) {
    if (!args.paymentMethods) args.paymentMethods = [];
    (args.paymentMethods as string[]).push('boleto');
  }
  if (/cupom\s+autom[aá]tico/i.test(msg)) args.couponAuto = true;
  if (/contador|social\s+proof/i.test(msg)) args.counterEnabled = true;
  const colorMatch = msg.match(/cor\s+(?:principal|fundo|bot[aã]o)?\s*:?\s*(#[0-9a-fA-F]{3,6}|\w+)/i);
  if (colorMatch?.[1]) {
    const colorKey = msg.includes('fundo') ? 'backgroundColor' : msg.includes('bot') ? 'buttonText' : 'primaryColor';
    if (colorKey === 'buttonText') args.buttonText = colorMatch[1];
    else args[colorKey] = colorMatch[1];
  }
  if (customComm?.[1]) args.customCommission = parseInt(customComm[1], 10);
  return args;
}

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
    const am2 = msg.match(/de\s+R\$\s*(\d+[.,]?\d*)/i) || msg.match(/de\s+(\d+[.,]?\d*)\s*(reais|real)/i);
    if (am2?.[1]) {
      args.amount = parseFloat(am2[1].replace(',', '.'));
    }
  }
  const nm = msg.match(/para\s+(?:o\s+|a\s+)?(?:comprador[a]?|client[e]?|lead\s+)?([A-Z][a-zÀ-ÿ]{2,25}(?:\s+[A-Z][a-zÀ-ÿ]{2,25})?)(?:\s+(?:comprar|adquirir|pagar|para)\b|$)/i);
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
  if (limitMatch?.[1]) args.usageLimit = parseInt(limitMatch[1], 10);
  // Expiration
  const expMatch = msg.match(/(?:expira|v[aá]lido\s+at[eé]|validade)\s*(?:em\s+)?(\d+)\s*(dias?|days?|meses?|months?)/i);
  if (expMatch?.[1]) {
    const num = parseInt(expMatch[1], 10);
    const unit = expMatch[2]?.toLowerCase();
    if (unit?.startsWith('mes')) args.expiresInDays = num * 30;
    else args.expiresInDays = num;
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
  const labelMatch = msg.match(/(?:descri[cç][aã]o|label|nome)\s*:?\s*['"]?([A-Za-zÀ-ÿ0-9\s\-.]{2,40}?)(?:\s*(?:,|\.|url|https?|$))/i);
  if (labelMatch?.[1]) args.label = labelMatch[1].trim();
  const urlMatch = msg.match(/(https?:\/\/\S+)/i);
  if (urlMatch?.[1]) args.url = urlMatch[1];
  if (/privad[oa]/.test(msg)) args.isPrivate = true;
  if (/aprender|aprendizado/.test(msg)) args.learnEnabled = true;
  if (/integrar|chat.*kloel/.test(msg)) args.chatEnabled = true;
  return args;
}

export function extractAffiliateArgs(msg: string): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  if (/\b(participar|ativar|sim|entrar)\b.*\b(programa|afiliado)\b/i.test(msg)) args.participate = true;
  if (/\b(vis[ií]vel|mostrar|p[uú]blico)\b.*\b(loja|vitrine)\b/i.test(msg)) args.visibleInStore = true;
  if (/\b(aprova[cç][aã]o)\s+(auto|autom[aá]tica)\b/i.test(msg)) args.autoApproval = true;
  if (/\b(acesso)\s+(dados|data)\b/i.test(msg)) args.accessData = true;
  if (/\b(acesso)\s+(abandonos?|carrinhos?)\b/i.test(msg)) args.accessAbandonments = true;
  if (/\bcomiss[aã]o\b.*\b(1a?\s*parcela|primeira)\b/i.test(msg)) args.commissionFirstInstallment = true;
  if (/\b(primeiro|1o?)\s+clique\b/i.test(msg)) args.attributionModel = 'FIRST_CLICK';
  if (/\b([uú]ltimo)\s+clique\b/i.test(msg)) args.attributionModel = 'LAST_CLICK';
  if (/\bdivis[aã]o\b.*\bproporcional\b/i.test(msg)) args.attributionModel = 'PROPORTIONAL';
  const cookieMatch = msg.match(/(\d+)\s*(dias?|days?)\s*(de\s+)?cookie/i);
  if (cookieMatch?.[1]) args.cookieDays = parseInt(cookieMatch[1], 10);
  const pctMatch = msg.match(/(\d+)\s*%\s*(?:de\s+)?comiss[aã]o/i);
  if (pctMatch?.[1]) args.commissionPercent = parseInt(pctMatch[1], 10);
  const prodMatch = msg.match(/para\s+(?:o\s+|a\s+)?(?:produto\s+)?["']?([A-Za-zÀ-ÿ0-9\s\-\.\+]{2,60}?)(?:\s*(?:,|\.|R\$|pre[çc]o|valor|\bcom\b|\bpor\b|\bpara\b|\burl\b|https?|\bcor\b|\bdescri[cç][aã]o\b|\bdescricao\b|$)|$)/i);
  if (prodMatch?.[1]) args.productName = prodMatch[1].trim();
  return args;
}

export function extractFiscalArgs(msg: string): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  const cnpj = msg.match(/(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})/);
  if (cnpj?.[1]) args.cnpj = cnpj[1];
  const cpf = msg.match(/(\d{3}\.?\d{3}\.?\d{3}-?\d{2})/);
  if (cpf?.[1] && !cnpj) args.cpf = cpf[1];
  const fullName = msg.match(/(?:nome|raz[aã]o|respons[aá]vel)\s*:?\s*([A-Za-zÀ-ÿ\s]{5,60}?)(?:\s*(?:,|\.|CNPJ|CPF|cep|endereço|banco|$))/i);
  if (fullName?.[1]) args.businessName = fullName[1].trim();
  const cep = msg.match(/(?:cep\s*:?\s*)(\d{5}-?\d{3})/i);
  if (cep?.[1]) args.cep = cep[1];
  const bank = msg.match(/(?:banco\s*:?\s*)(\d{3})/i);
  if (bank?.[1]) args.bankCode = bank[1];
  const ag = msg.match(/(?:ag[eê]ncia\s*:?\s*)(\d+)/i);
  if (ag?.[1]) args.agency = ag[1];
  const cc = msg.match(/(?:conta\s*:?\s*)(\d+[-\d]*)/i);
  if (cc?.[1]) args.account = cc[1];
  return args;
}

export { formatToolResult } from './guest-chat.format-tool-result.helpers';
