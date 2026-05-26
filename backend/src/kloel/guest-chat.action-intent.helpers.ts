import {
  extractPlanArgs,
  extractProductArgs,
  extractProductName,
} from './guest-chat.product-args.helpers';
import {
  extractAffiliateArgs,
  extractCouponArgs,
  extractFiscalArgs,
  extractPaymentArgs,
  extractUrlArgs,
} from './guest-chat.commerce-args.helpers';

export function detectActionIntent(
  message: string,
): { tool: string; args: Record<string, unknown> } | null {
  const msg = message.toLowerCase().trim();

  // ── PRODUTOS ──
  if (
    /cria(r|ndo)?\s+(?:um[a]?\s+)?(produto|oferta|novo)/.test(msg) ||
    /cadastra(r|ndo)?\s+(?:um[a]?\s+)?produto/.test(msg)
  ) {
    return { tool: 'create_product', args: extractProductArgs(msg) };
  }
  if (/lista(r|ndo)? (produtos|meus produtos|ofertas|cat[aá]logo)/.test(msg)) {
    return { tool: 'list_products', args: {} };
  }
  if (/(?:edita|atualiza|muda|altera)(?:r|ndo)?\s+(?:um[a]?\s+)?(?:o\s+)?produto/.test(msg)) {
    return { tool: 'update_product', args: extractProductArgs(msg) };
  }
  if (/(apaga|deleta|exclui|remove)(?:r|ndo)?\s+(?:um[a]?\s+)?(?:o\s+)?produto/.test(msg)) {
    return { tool: 'delete_product', args: { productName: extractProductName(msg) } };
  }

  // ── DELETAR PLANO / CHECKOUT ──
  if (
    /(apaga(?:r|ndo)?|deleta(?:r|ndo)?|exclui(?:r|ndo)?|remove(?:r|ndo)?)\s+(?:o\s+)?plano/.test(
      msg,
    )
  ) {
    return {
      tool: 'delete_plan',
      args: { planName: extractProductName(msg), productName: extractProductName(msg) },
    };
  }
  if (
    /(apaga(?:r|ndo)?|deleta(?:r|ndo)?|exclui(?:r|ndo)?|remove(?:r|ndo)?)\s+(?:o\s+)?checkout/.test(
      msg,
    )
  ) {
    return {
      tool: 'delete_checkout',
      args: { checkoutName: extractProductName(msg), productName: extractProductName(msg) },
    };
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

  if (
    /(?:lista(?:r|ndo)?|meus|ver|mostra)\s+(?:checkouts?|p[aá]ginas?\s+(?:de\s+)?checkouts?)/.test(
      msg,
    )
  ) {
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
    /(busca(?:r|ndo)?|procura(?:r|ndo)?|pesquisa(?:r|ndo)?).*(lead|cliente|contato|comprador)/.test(
      msg,
    )
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
    return {
      tool: 'upload_plan_image',
      args: { planName: extractProductName(msg), productName: extractProductName(msg) },
    };
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
  if (
    /(?:configura(?:r|ndo)?|atualiza(?:r|ndo)?|edita(?:r|ndo)?|muda(?:r|ndo)?|altera(?:r|ndo)?)\s+(?:o\s+)?(?:programa\s+(?:de\s+)?)?(?:comiss[aã]o\s+(?:de\s+)?)?afiliad/.test(
      msg,
    )
  ) {
    return { tool: 'update_affiliate_config', args: extractAffiliateArgs(msg) };
  }

  // ── AFILIADOS ──
  if (/afiliados?|comiss[aã]o|programa.*afiliado/.test(msg)) {
    return { tool: 'get_affiliate_config', args: {} };
  }

  // ── EDITAR PLANO / CHECKOUT ──
  if (
    /(edita(?:r|ndo)?|atualiza(?:r|ndo)?|muda(?:r|ndo)?|altera(?:r|ndo)?)\s+(?:o\s+)?(plano|checkout)/.test(
      msg,
    )
  ) {
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
    return {
      tool: 'send_channel_message',
      args: { channel: msg.match(/(instagram|facebook|tiktok|email)/i)?.[1] || '' },
    };
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
  if (
    /(?:edita(?:r|ndo)?|atualiza(?:r|ndo)?|muda(?:r|ndo)?|altera(?:r|ndo)?)\s+(?:o\s+)?cupom/.test(
      msg,
    )
  ) {
    return { tool: 'update_coupon', args: extractCouponArgs(msg) };
  }

  // ── WHATSAPP ──
  if (
    /whatsapp.*(conectar|conex[aã]o|status|verificar)/.test(msg) ||
    /status\s+(do\s+)?whatsapp/.test(msg) ||
    /whatsapp.*(est[aá]|como)/.test(msg)
  ) {
    return { tool: 'get_whatsapp_status', args: {} };
  }
  if (/(envia|manda|dispara)\s+(mensagem|whatsapp|zap)\s+para/.test(msg)) {
    return { tool: 'send_whatsapp_message', args: { message: msg } };
  }
  if (/lista\s+(contatos|chats)\s+whatsapp/.test(msg)) {
    return { tool: 'list_whatsapp_chats', args: {} };
  }

  // ── FRETE / ENTREGA ──
  if (
    /(configura(r|ndo)?|defini(r|ndo)?|alterar|mudar)\s+(frete|entreg[a]|envio|transportadora)/.test(
      msg,
    )
  ) {
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
  if (
    /(atualiza(?:r|ndo)?|salva(?:r|ndo)?|altera(?:r|ndo)?)\s+(meus\s+)?(dados\s+(fiscais|pessoais|banc[aá]rios)|documento)/.test(
      msg,
    )
  ) {
    return { tool: 'update_fiscal_data', args: extractFiscalArgs(msg) };
  }
  if (/envia(?:r|ndo)?\s+(documento|contrato|identidade|cnpj)/.test(msg)) {
    return {
      tool: 'upload_document',
      args: { docType: msg.match(/(identidade|contrato|cnpj)/i)?.[1] || 'document' },
    };
  }

  // ── UPLOAD / IMAGEM ──
  if (
    /(faz\s+)?(upload|envia|sobe|essa é a|imagem do|foto do)\s+(?:da\s+)?(imagem|foto|arquivo)\b/.test(
      msg,
    )
  ) {
    return { tool: 'upload_product_image', args: { productName: extractProductName(msg) } };
  }

  // ── PIXEL ──
  if (/pixel\s+(facebook|google|meta|ads)/.test(msg) || /configura\s+pixel/.test(msg)) {
    return { tool: 'configure_pixel', args: { productName: extractProductName(msg) } };
  }

  // ── E-MAIL / MARKETING ──
  if (
    /(envia(?:r|ndo)?|manda(?:r|ndo)?|dispara(?:r|ndo)?)\s+(email|campanha|broadcast)/.test(msg)
  ) {
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
    const pathMatch = msg.match(
      /(?:arquivo|file|path|codigo|schema|prisma|fonte|source)\s+(?:de\s+)?['"]?([a-zA-Z0-9_\-/.]+(?:\.prisma|\.ts|\.tsx|\.js|\.json|\.md)?)/i,
    );
    const extracted = pathMatch?.[1] || '';
    const filePath = extracted.includes('.')
      ? extracted.startsWith('backend/') ||
        extracted.startsWith('frontend/') ||
        extracted.startsWith('worker/')
        ? extracted
        : `backend/src/${extracted.replace(/^src\//, '')}`
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
    const qMatch = msg.match(
      /(?:busca|search|procura|por)\s+(?:no\s+codegraph\s+)?['"]?([A-Za-zÀ-ÿ0-9\s_\-.+]{2,60}?)(?:\s*$|\.|\?)/i,
    );
    return { tool: 'codegraph_search', args: { query: qMatch?.[1]?.trim() || msg } };
  }
  if (/codegraph\s+contexto|contexto\s+codegraph|codegraph\s+context/.test(msg)) {
    const qMatch = msg.match(
      /(?:contexto|context)\s*:?\s*['"]?([A-Za-zÀ-ÿ0-9\s_\-.+]{2,60}?)(?:\s*$)/i,
    );
    return { tool: 'codegraph_context', args: { task: qMatch?.[1]?.trim() || 'overview' } };
  }
  if (/codegraph\s+(quem\s+chama|callers|quem\s+usa)/.test(msg)) {
    const qMatch = msg.match(
      /(?:chama|callers|usa)\s+(?:o\s+|a\s+)?['"]?([A-Za-zÀ-ÿ0-9_\-.+]{2,40})/i,
    );
    return { tool: 'codegraph_callers', args: { symbol: qMatch?.[1]?.trim() || '' } };
  }
  if (/codegraph\s+(o\s+que\s+chama|callees|depend[eê]ncias)/.test(msg)) {
    const qMatch = msg.match(
      /(?:chama|callees|depend[eê]ncias\s+de)\s+(?:o\s+|a\s+)?['"]?([A-Za-zÀ-ÿ0-9_\-.+]{2,40})/i,
    );
    return { tool: 'codegraph_callees', args: { symbol: qMatch?.[1]?.trim() || '' } };
  }
  if (/codegraph\s+impacto|impacto\s+codegraph|codegraph\s+impact/.test(msg)) {
    const qMatch = msg.match(/(?:impacto|impact)\s+(?:de\s+)?['"]?([A-Za-zÀ-ÿ0-9_\-.+]{2,40})/i);
    return { tool: 'codegraph_impact', args: { symbol: qMatch?.[1]?.trim() || '' } };
  }
  if (/codegraph\s+(detalhes|node|info|mostra)/.test(msg)) {
    const qMatch = msg.match(
      /(?:detalhes|node|info|mostra)\s+(?:o\s+|a\s+)?['"]?([A-Za-zÀ-ÿ0-9_\-.+]{2,40})/i,
    );
    return { tool: 'codegraph_node', args: { symbol: qMatch?.[1]?.trim() || '' } };
  }
  if (/codegraph\s+(arquivos|files|[aá]rvore|estrutura)/.test(msg)) {
    return { tool: 'codegraph_files', args: {} };
  }
  return null;
}

export { formatToolResult } from './guest-chat.format-tool-result.helpers';
