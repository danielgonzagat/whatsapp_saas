/**
 * Engagement and platform intent patterns: WhatsApp, profile/PIX, refund,
 * product AI persona, web search, broadcast, NPS/churn, marketplace, after-pay,
 * order bumps, affiliates config, social channels, autopilot, billing,
 * image upload, channel connection, and account settings.
 */

import type { IntentPattern } from '../intent-router.parsers';

export const ENGAGEMENT_INTENT_PATTERNS: IntentPattern[] = [
  // === WhatsApp ===
  {
    regex:
      /(?:lista[er]?|ver|mostr[ae]r?)\s+(?:minhas\s+)?(?:conversas|chats)\s+(?:do\s+)?whatsapp/i,
    capabilityId: 'list_whatsapp_chats',
    extract: () => ({}),
  },
  {
    regex: /(?:lista[er]?|ver|mostr[ae]r?)\s+(?:meus\s+)?(?:contatos)\s+(?:do\s+)?whatsapp/i,
    capabilityId: 'list_whatsapp_contacts',
    extract: () => ({}),
  },
  {
    regex:
      /(?:manda|envi[ae]r?|dispara)\s+(?:uma?\s+)?(?:mensagem|msg|zap)(?:\s+(?:no|via|por|pra)\s+(?:whatsapp|whats|zap))?/i,
    capabilityId: 'whatsapp.send',
    extract: () => ({}),
  },
  // === Profile / Bio ===
  {
    regex:
      /(?:atualiz[ae]r?|mud[ae]r?|alter[ae]r?)\s+(?:meus?\s+)?(?:dados\s+pessoais|perfil|nome\s+completo)/i,
    capabilityId: 'update_personal_data',
    extract: () => ({}),
  },
  {
    regex: /(?:cri[ae]r?|cadastr[ae]r?)\s+(?:minha\s+)?(?:chave\s+|)pix/i,
    capabilityId: 'set_pix_key',
    extract: () => ({}),
  },

  // === Refund ===
  {
    regex: /(?:estorn[ae]r?|reembols[ae]r?|cancel[ae]r?\s+(?:venda|pedido))/i,
    capabilityId: 'sales.refund',
    extract: () => ({}),
  },

  // === Product AI ===
  {
    regex: /(?:config\s+(?:da\s+)?ia|ia\s+do\s+produto|persona\s+do\s+produto)/i,
    capabilityId: 'get_product_ai_config',
    extract: () => ({}),
  },
  {
    regex:
      /(?:mud[ae]r?|atualiz[ae]r?)\s+(?:a\s+)?(?:persona|tom|voz)\s+(?:do|da)\s+(?:produto|marca)/i,
    capabilityId: 'configure_ai_persona',
    extract: () => ({}),
  },

  // === Pesquisa / Search ===
  {
    regex: /(?:pesquis[ae]r?|buscar?|procura[er]?)\s+(?:na\s+)?(?:web|internet|google)/i,
    capabilityId: 'search_web',
    extract: (match) => ({ query: match[0] }),
  },

  // === Estornos ===
  {
    regex: /(?:estornos?|reembolsos?|chargebacks?)/i,
    capabilityId: 'list_refunds',
    extract: () => ({}),
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

  // === Estornos (variant) ===
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
  {
    regex: /(?:dm|direct|mensagem)\s+(?:no|do|via)\s+(?:insta|instagram)/i,
    capabilityId: 'instagram.send_dm',
    extract: () => ({}),
  },
  {
    regex: /(?:manda|envia|dispara)\s+(?:um\s+)?e[\s-]?mail/i,
    capabilityId: 'email.send',
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
    regex:
      /(?:configur[ae]r?|defin[ei]r?|mud[ae]r?)\s+(?:a\s+|o\s+)?(?:persona|personalidade|tom|voz)\s+(?:da|do)\s+ia/i,
    capabilityId: 'configure_ai_persona',
    extract: (match) => ({
      personality:
        match[0].match(
          /(?:formal|informal|friendly|professional|funny|amig[aá]vel|profissional|engra[cç]ad[ao])/i,
        )?.[0] || undefined,
    }),
  },

  // === WhatsApp status / connection ===
  {
    regex:
      /(?:status\s+(?:do\s+)?whatsapp|whatsapp\s+(?:est[aá]\s+)?(?:funcionando|conectado|online))/i,
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
    regex:
      /(?:faz\s+)?(?:upload|envi[ae]r?|sob[ei]r?)\s+(?:da\s+)?(?:foto|imagem)\s+(?:do\s+)?(?:plano|produto)/i,
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
