import { Injectable, Logger } from '@nestjs/common';
import type { IntentClassification } from '../capability-registry-v2/capability-registry-v2.types';
import { CapabilityRegistryV2Service } from '../capability-registry-v2/capability-registry-v2.service';

/**
 * Intent Router — deterministic pre-LLM classification layer.
 *
 * Every user message passes through this router BEFORE reaching the LLM.
 * The LLM never decides whether to call a tool. The router classifies the
 * intent, and if it matches a known capability, the ToolPlanner takes over.
 *
 * This implements Principle 2.1 of the Kloel Organism mission:
 * "Roteador determinístico antes do LLM."
 */
@Injectable()
export class IntentRouterService {
  private readonly logger = new Logger(IntentRouterService.name);

  // Pattern-based matchers for high-confidence intents
  private readonly PATTERNS: Array<{
    regex: RegExp;
    capabilityId: string;
    extract: (match: RegExpMatchArray) => Record<string, unknown>;
  }> = [
    // === Self-awareness ===
    {
      regex: /(?:o que|quais|liste|lista|mostre|que)\s.*(?:consegue|capaci|sabe|pode)\s.*(?:fazer?|operar?)/i,
      capabilityId: 'self.capabilities',
      extract: () => ({}),
    },
    {
      regex: /(?:sa[uú]de|health|status|funcionando|quebrad[ao])/i,
      capabilityId: 'self.health',
      extract: () => ({}),
    },
    {
      regex: /(?:gap|lacuna|falt[ae]|incompleto|ausente|nao funciona)/i,
      capabilityId: 'self.gaps',
      extract: () => ({}),
    },
    {
      regex: /(?:log|audit[oó]ria|a[cç][oõ]es?\s.*execut|o que vc fez|historico)/i,
      capabilityId: 'self.audit_log',
      extract: () => ({}),
    },
    {
      regex: /lista(?:r|ndo)?\s+(?:meus\s+)?(?:produtos|ofertas|cat[aá]logo)/i,
      capabilityId: 'list_products',
      extract: () => ({}),
    },

    // === Products ===
    {
      regex: /(?:cri[ae]r?\s.*produt|cadastra\s.*produt|nov[oa]\s.*produt)/i,
      capabilityId: 'create_product',
      extract: (match) => ({
        name: match[0].match(/produto\s+["""']?([^""""'"]+)/i)?.[1] || undefined,
        price: parseFloat(match[0].match(/r?\$?\s*(\d+(?:[.,]\d+)?)/i)?.[1]?.replace(',', '.') ?? '') || undefined,
      }),
    },
    {
      regex: /(?:edit[ae]r?\s.*produt|alter[ae]r?\s.*produt|atualiz[ae]r?\s.*produt)/i,
      capabilityId: 'products.update',
      extract: () => ({}),
    },
    {
      regex: /(?:imagem|foto)\s.*(?:produto|subir|anex[ae]r?|coloc[ae]r?)/i,
      capabilityId: 'products.upload_image',
      extract: () => ({}),
    },
    {
      regex: /(?:ativ[ae]r?|desativ[ae]r?|public[ae]r?|dispon[ií]vel)\s.*(?:vend[ae]r?|produt)/i,
      capabilityId: 'products.update',
      extract: () => ({ active: true }),
    },

    // === Plans ===
    {
      regex: /(?:cri[ae]r?\s.*plan|nov[oa]\s.*plan|adicion[ae]r?\s.*plan)/i,
      capabilityId: 'plans.create',
      extract: () => ({}),
    },
    {
      regex: /(?:edit[ae]r?\s.*plan|alter[ae]r?\s.*plan)\s/i,
      capabilityId: 'plans.update',
      extract: () => ({}),
    },

    // === Checkouts ===
    {
      regex: /(?:cri[ae]r?\s.*checkout|nov[oa]\s.*checkout)/i,
      capabilityId: 'checkouts.create',
      extract: () => ({}),
    },
    {
      regex: /(?:edit[ae]r?\s.*checkout|alter[ae]r?\s.*checkou)/i,
      capabilityId: 'checkouts.update',
      extract: () => ({}),
    },

    // === Theme toggle ===
    {
      regex: /(?:tem[ae]\s+(?:clar[oa]?|escur[oa]?)|(?:clar[oa]?|escur[oa]?)\s+tem[ae]|(?:dark|light)\s+mode)/i,
      capabilityId: 'ui.theme',
      extract: (match) => ({
        theme: /escur[oa]|dark/i.test(match[0]) ? 'dark' : 'light',
      }),
    },
    // === Coupons ===
    {
      regex: /(?:cri[ae]r?\s.*cupom|cupom\s.*nov[oa]|cadastra\s.*cupom)/i,
      capabilityId: 'coupons.create',
      extract: () => ({}),
    },
    {
      regex: /(?:exclu[ui]r?\s.*cupom|remov[ae]r?\s.*cupom|delet[ae]r?\s.*cupom)/i,
      capabilityId: 'coupons.delete',
      extract: () => ({}),
    },

    // === Orders / Sales ===
    {
      regex: /(?:minhas\s+|meus\s+)?(?:vendas|pedidos|orders?)/i,
      capabilityId: 'list_orders',
      extract: () => ({}),
    },
    {
      regex: /resumo\s+(?:de\s+)?vendas?/i,
      capabilityId: 'get_sales_summary',
      extract: () => ({}),
    },

    // === Leads / CRM ===
    {
      regex: /(?:meus?\s+)?(?:leads?|contatos?|pipeline)/i,
      capabilityId: 'list_leads',
      extract: () => ({}),
    },

    // === Wallet ===
    {
      regex: /(?:extrato|hist[oó]rico\s+(?:de\s+)?(?:transa[cç][aã]o|financeiro))/i,
      capabilityId: 'get_wallet_statement',
      extract: () => ({}),
    },

    // === Product plans/reviews/urls ===
    {
      regex: /(?:quais?\s+(?:s[aã]o\s+)?(?:os?\s+)?|meus?\s+|ver\s+|mostr[ae]r?\s+)planos?/i,
      capabilityId: 'get_product_plans',
      extract: () => ({}),
    },
    {
      regex: /(?:avalia[cç][oõ]es?|reviews?)/i,
      capabilityId: 'get_product_reviews',
      extract: () => ({}),
    },
    {
      regex: /(?:urls?\s+(?:do\s+)?produto|p[aá]ginas?\s+(?:do\s+)?produto)/i,
      capabilityId: 'get_product_urls',
      extract: () => ({}),
    },

    // === Coupon management ===
    {
      regex: /(?:exclu[ui]r?|remov[ae]r?|delet[ae]r?|apag[ae]r?)\s+(?:o\s+|a\s+)?cupom/i,
      capabilityId: 'delete_coupon',
      extract: () => ({}),
    },
    {
      regex: /valid[ae]r?\s+(?:o\s+|a\s+)?cupom/i,
      capabilityId: 'validate_coupon',
      extract: () => ({}),
    },

    // === Document upload ===
    {
      regex: /(?:envi[ae]r?|upload|anex[ae]r?)\s+(?:meu\s+)?(?:documento|contrato|rg|cpf|cnpj|identidade)/i,
      capabilityId: 'upload_document',
      extract: (match) => ({
        documentType: match[0].match(/contrato/i) ? 'contract' :
                      match[0].match(/(?:rg|identidad)/i) ? 'identity' :
                      match[0].match(/cnpj/i) ? 'cnpj_card' : 'document',
      }),
    },
    {
      regex: /envi[ae]r?\s+(?:meu\s+)?(?:pdf|arquivo)/i,
      capabilityId: 'upload_document',
      extract: () => ({}),
    },

    // === Subscriptions ===
    {
      regex: /(?:minhas?\s+)?(?:assinaturas?|assinantes?|subscriptions?)/i,
      capabilityId: 'list_subscriptions',
      extract: () => ({}),
    },

    // === Shipping ===
    {
      regex: /(?:configur[ae]r?|defin[ei]r?)\s+(?:o\s+)?(?:frete|entreg[ae]?)/i,
      capabilityId: 'configure_shipping',
      extract: () => ({}),
    },

    // === Warranty ===
    {
      regex: /(?:configur[ae]r?|defin[ei]r?|qual\s+(?:a\s+)?)\s*(?:garantia|warranty)/i,
      capabilityId: 'configure_warranty',
      extract: (match) => {
        const days = match[0].match(/(\d+)\s*(?:dias?|days?)/i);
        return days ? { warrantyDays: parseInt(days[1], 10) } : {};
      },
    },

    // === Exit intent ===
    {
      regex: /(?:exit\s+intent|popup\s+(?:de\s+)?sa[ií]da)/i,
      capabilityId: 'configure_exit_intent',
      extract: (match) => ({
        enabled: !/desativ[ae]|remov[ae]|tir[ae]/i.test(match[0]),
      }),
    },

    // === Sales / PIX / Boleto ===
    {
      regex: /(?:emit[ei]r?\s.*pix|ger[ae]r?\s.*pix|cri[ae]r?\s.*pix)/i,
      capabilityId: 'generate_pix',
      extract: (match) => {
        const amount = parseFloat(match[0].match(/r?\$?\s*(\d+(?:[.,]\d+)?)/i)?.[1]?.replace(',', '.') ?? '') || undefined;
        return { amount: amount || undefined };
      },
    },
    {
      regex: /(?:emit[ei]r?\s.*bolet|ger[ae]r?\s.*bolet|cri[ae]r?\s.*bolet)/i,
      capabilityId: 'generate_boleto',
      extract: () => ({}),
    },
    {
      regex: /(?:consult[ae]r?\s.*vend[ae]|status\s.*vend[ae]|buscar?\s.*vend[ae]|mostr[ae]r?\s.*vend[ae])/i,
      capabilityId: 'sales.list',
      extract: () => ({}),
    },

    // === URLs ===
    {
      regex: /(?:adicion[ae]r?|cri[ae]r?|nov[ao])\s+(?:o\s+|a\s+)?url/i,
      capabilityId: 'add_url',
      extract: (match) => {
        const urlMatch = match[0].match(/(https?:\/\/[^\s]+)/i);
        return urlMatch ? { url: urlMatch[1] } : {};
      },
    },
    {
      regex: /(?:edit[ae]r?|atualiz[ae]r?|mud[ae]r?|alter[ae]r?)\s+(?:o\s+|a\s+)?url/i,
      capabilityId: 'update_url',
      extract: () => ({}),
    },
    {
      regex: /(?:apag[ae]r?|delet[ae]r?|remov[ae]r?|exclu[ui]r?)\s+(?:o\s+|a\s+)?url/i,
      capabilityId: 'delete_url',
      extract: () => ({}),
    },

    // === Social proof ===
    {
      regex: /(?:social\s+proof|prova\s+social|depoimentos?|ativ[ae]r?\s+(?:prova\s+social|social))/i,
      capabilityId: 'configure_social_proof',
      extract: (match) => ({
        enabled: !/desativ[ae]|remov[ae]/i.test(match[0]),
      }),
    },

    // === Pixel ===
    {
      regex: /(?:configur[ae]r?|ativ[ae]r?)\s+(?:o\s+)?pixel/i,
      capabilityId: 'configure_pixel',
      extract: () => ({}),
    },

    // === Checkout listing ===
    {
      regex: /(?:list[ae]r?|meus?|ver)\s+(?:checkouts?|p[aá]ginas?\s+(?:de\s+)?checkouts?)/i,
      capabilityId: 'list_checkouts',
      extract: () => ({}),
    },

    // === Agent memory/sessions ===
    {
      regex: /(?:buscar?|pesquisar?|procur[ae]r?)\s+(?:minhas\s+)?(?:conversas?|mem[oó]rias?|hist[oó]ricos?)/i,
      capabilityId: 'search_agent_memory',
      extract: (match) => ({ query: match[0] }),
    },
    {
      regex: /(?:buscar?|pesquisar?)\s+(?:sess[oõ]es?|minhas\s+sess[oõ]es?)/i,
      capabilityId: 'search_agent_sessions',
      extract: (match) => ({ query: match[0] }),
    },

    // === Dashboard ===
    {
      regex: /(?:dashboard|painel|resumo\s+(?:do\s+)?dia)/i,
      capabilityId: 'get_dashboard_summary',
      extract: () => ({}),
    },

    // === Checkout listing ===
    {
      regex: /(?:list[ae]r?|meus?|ver)\s+(?:checkouts?|p[aá]ginas?\s+(?:de\s+)?checkouts?)/i,
      capabilityId: 'list_checkouts',
      extract: () => ({}),
    },

    // === URLs ===
    {
      regex: /(?:adicion[ae]r?\s.*url|url\s.*nov[oa])/i,
      capabilityId: 'urls.add',
      extract: () => ({}),
    },

    // === Affiliates ===
    {
      regex: /(?:ativ[ae]r?\s.*afil|desativ[ae]r?\s.*afil|configur[ae]r?\s.*afil|programa\s.*afil)/i,
      capabilityId: 'affiliates.configure',
      extract: () => ({}),
    },

    // === Wallet ===
    {
      regex: /(?:saldo|carteir|meu\s.*saldo|quanto\s.*tenho)/i,
      capabilityId: 'wallet.balance',
      extract: () => ({}),
    },
    {
      regex: /(?:saqu[ei]|solicit[ae]r?\s.*saqu|ped[ei]r?\s.*saqu|sac[ae]r?)/i,
      capabilityId: 'wallet.withdraw',
      extract: () => ({}),
    },

    // === Reports ===
    {
      regex: /(?:relat[oó]rio\s.*opera[cç][ãa]o|opera[cç][õo]es)/i,
      capabilityId: 'reports.operations',
      extract: () => ({}),
    },
    {
      regex: /(?:abandon|carrinho abandon)/i,
      capabilityId: 'reports.abandonments',
      extract: () => ({}),
    },

    // === CRM ===
    {
      regex: /(?:pipeline|crm|stage|est[áa]gio)/i,
      capabilityId: 'crm.pipeline',
      extract: () => ({}),
    },

    // === Payment link ===
    {
      regex: /(?:cri[ae]r?|ger[ae]r?)\s+(?:link\s+(?:de\s+)?pagamento|payment\s+link)/i,
      capabilityId: 'create_payment_link',
      extract: (match) => {
        const amount = parseFloat(match[0].match(/r?\$?\s*(\d+(?:[.,]\d+)?)/i)?.[1]?.replace(',', '.') ?? '') || undefined;
        return { amount: amount || undefined };
      },
    },

    // === Saque/antecipação ===
    {
      regex: /(?:solicit[ae]r?|ped[ei]r?)\s+(?:meu\s+)?saque/i,
      capabilityId: 'request_withdrawal',
      extract: (match) => {
        const amount = parseFloat(match[0].match(/r?\$?\s*(\d+(?:[.,]\d+)?)/i)?.[1]?.replace(',', '.') ?? '') || undefined;
        return { amount: amount || undefined };
      },
    },
    {
      regex: /(?:solicit[ae]r?|ped[ei]r?)\s+(?:minha\s+)?antecipa[cç][aã]o/i,
      capabilityId: 'request_anticipation',
      extract: () => ({}),
    },

    // === Subscription ===
    {
      regex: /(?:cancel[ae]r?|paus[ae]r?|desativ[ae]r?)\s+(?:minha\s+)?(?:assinatura|subscri)/i,
      capabilityId: 'update_subscription',
      extract: (match) => ({
        action: /cancel|paus/i.test(match[0]) ? 'cancel' : 'pause',
      }),
    },

    // === Broadcast ===
    {
      regex: /cri[ae]r?\s+(?:uma\s+)?(?:campanha|broadcast|disparo)/i,
      capabilityId: 'create_broadcast',
      extract: () => ({}),
    },


    // === NPS / Churn ===
    {
      regex: /nps|net\s+promoter/i,
      capabilityId: 'get_nps',
      extract: () => ({}),
    },
    {
      regex: /churn|cancelamento\s+(?:total|geral)/i,
      capabilityId: 'get_churn',
      extract: () => ({}),
    },

    // === Marketplace ===
    {
      regex: /(?:marketplace|afiliar\s*(?:-se|se)|produtos\s+p[uú]blicos)/i,
      capabilityId: 'browse_marketplace',
      extract: () => ({}),
    },

    // === Detalhes do produto ===
    {
      regex: /(?:detalhes|info|mostr[ae]r?)\s+(?:do|o)\s+produto/i,
      capabilityId: 'get_product_details',
      extract: () => ({}),
    },

    // === Estornos ===
    {
      regex: /(?:estornos?|reembolsos?|devolu[cç][aã]o)/i,
      capabilityId: 'list_refunds',
      extract: () => ({}),
    },

    // === After Pay ===
    {
      regex: /after\s+pay|pagamento\s+(?:depois|posterior|faturado)/i,
      capabilityId: 'configure_after_pay',
      extract: (match) => ({
        enabled: !/desativ/i.test(match[0]),
      }),
    },

    // === Order bump ===
    {
      regex: /order\s+bump|upsell|downsell/i,
      capabilityId: 'configure_order_bump',
      extract: (match) => ({
        enabled: !/desativ/i.test(match[0]),
      }),
    },

    // === Afiliados config ===
    {
      regex: /(?:configura[cç][aã]o\s+(?:de\s+)?afiliad|programa\s+(?:de\s+)?afiliad)/i,
      capabilityId: 'get_affiliate_config',
      extract: () => ({}),
    },
    {
      regex: /(?:atualiz[ae]r?|edit[ae]r?|mud[ae]r?)\s+(?:o\s+)?(?:programa\s+(?:de\s+)?)?afiliad/i,
      capabilityId: 'update_affiliate_config',
      extract: () => ({}),
    },

    // === Redes sociais / canais ===
    {
      regex: /(?:redes?\s+sociais|canais?\s+(?:sociais|conectados))/i,
      capabilityId: 'get_social_channels',
      extract: () => ({}),
    },
    // === Autopilot ===
    {
      regex: /(?:ativ[ae]r?|desativ[ae]r?)\s+(?:o\s+)?autopilot/i,
      capabilityId: 'toggle_autopilot',
      extract: (match) => ({
        enabled: !/desativ/i.test(match[0]),
      }),
    },


    // === AI persona ===
    {
      regex: /(?:configur[ae]r?|defin[ei]r?|mud[ae]r?)\s+(?:a\s+|o\s+)?(?:persona|personalidade|tom|voz)\s+(?:da|do)\s+ia/i,
      capabilityId: 'configure_ai_persona',
      extract: (match) => ({
        personality: match[0].match(/(?:formal|informal|friendly|professional|funny|amig[aá]vel|profissional|engra[cç]ad[ao])/i)?.[0] || undefined,
      }),
    },

    // === WhatsApp ===
    {
      regex: /(?:status\s+(?:do\s+)?whatsapp|whatsapp\s+(?:est[aá]\s+)?(?:funcionando|conectado|online))/i,
      capabilityId: 'get_whatsapp_status',
      extract: () => ({}),
    },
    {
      regex: /(?:conect[ae]r?|vincular?)\s+(?:o\s+)?whatsapp/i,
      capabilityId: 'connect_whatsapp',
      extract: () => ({}),
    },

    // === Billing ===
    {
      regex: /(?:atualiz[ae]r?|mud[ae]r?)\s+(?:meu\s+)?(?:plano|billing|cobran[cç]a)/i,
      capabilityId: 'update_billing_info',
      extract: () => ({}),
    },

    // === Image upload ===
    {
      regex: /(?:faz\s+)?(?:upload|envi[ae]r?|sob[ei]r?)\s+(?:da\s+)?(?:foto|imagem)\s+(?:do\s+)?(?:plano|produto)/i,
      capabilityId: 'upload_product_image',
      extract: (match) => ({
        targetType: /plano/i.test(match[0]) ? 'plan' : 'product',
      }),
    },
    // === Conectar canal ===
    {
      regex: /conect[ae]r?\s+(?:o\s+|meu\s+)?(whatsapp|instagram|facebook|tiktok|email)/i,
      capabilityId: 'connect_channel',
      extract: (match) => ({
        channel: match[1]?.toLowerCase() || 'whatsapp',
      }),
    },

    // === Settings ===
    {
      regex: /(?:minhas|meus)\s+(?:configura[cç][oõ]es|settings|conta)/i,
      capabilityId: 'get_settings',
      extract: () => ({}),
    },
    {
      regex: /(?:dados\s+banc[aá]rios|conta\s+banc[aá]ria)/i,
      capabilityId: 'get_settings',
      extract: () => ({}),
    },

    // === Configuration ===
    {
      regex: /(?:tema\s.*(?:clar[oa]?|escur[oa]?)|(?:clar[oa]?|escur[oa]?)\s.*tema)/i,
      capabilityId: 'ui.theme',
      extract: (match) => ({
        theme: match[0].toLowerCase().includes('escuro') ? 'dark' : 'light',
      }),
    },
    {
      regex: /(?:dados?\s.*fisc|atualiz[ae]r?\s.*fisc|alter[ae]r?\s.*fisc|c?p[fjn]|cnpj)/i,
      capabilityId: 'account.update_fiscal',
      extract: () => ({}),
    },
    {
      regex: /(?:dados?\s.*banc[áa]ri|atualiz[ae]r?\s.*banc|alter[ae]r?\s.*banc|conta\s.*banc)/i,
      capabilityId: 'account.update_bank',
      extract: () => ({}),
    },
    {
      regex: /(?:chave\s.*pix|pix\s.*chave|cadastr[ae]r?\s.*pix)/i,
      capabilityId: 'account.set_pix_key',
      extract: () => ({}),
    },
    {
      regex: /(?:envi[ae]r?\s.*(?:doc|pdf|arquiv|contrat|identidad))|(?:document[oa]?\s.*fisc)/i,
      capabilityId: 'account.upload_document',
      extract: () => ({}),
    },
  ];

  constructor(
    private readonly registry: CapabilityRegistryV2Service,
  ) {}

  /**
   * Classify a user message into an intent.
   *
   * Three-stage classification:
   * 1. Pattern matching (regex/keywords) — highest confidence
   * 2. Registry-based keyword scoring — fallback
   * 3. Chat — no capability matched
   */
  classify(
    message: string,
    surface: string,
    permissions: string[],
  ): { classification?: IntentClassification; isChat: boolean } {
    const startTime = Date.now();
    const normalized = message.trim();

    if (!normalized) {
      return { isChat: true };
    }

    // Stage 1: Pattern matching
    for (const pattern of this.PATTERNS) {
      const match = normalized.match(pattern.regex);
      if (match) {
        const cap = this.registry.get(pattern.capabilityId);
        if (!cap) continue;

        const entities = pattern.extract(match);
        const missingInputs = cap.inputSchema
          .filter((f) => f.required && !entities[f.key])
          .map((f) => f.key);

        this.logger.debug(
          `Intent matched pattern: "${pattern.capabilityId}" in ${Date.now() - startTime}ms`,
        );

        return {
          classification: {
            intent: pattern.capabilityId,
            capabilityId: pattern.capabilityId,
            entities,
            confidence: 0.9,
            missingInputs,
            requiresConfirmation: cap.requiresConfirmation,
          },
          isChat: false,
        };
      }
    }

    // Stage 2: Registry-based classification
    const registryResult = this.registry.classifyIntent(normalized, surface, permissions);
    if (registryResult && registryResult.confidence >= 0.5) {
      return { classification: registryResult, isChat: false };
    }

    // Stage 3: Chat — no capability matched
    return { isChat: true };
  }
}