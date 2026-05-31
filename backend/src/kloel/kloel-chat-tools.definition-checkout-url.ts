import { ChatCompletionTool } from 'openai/resources/chat';

/**
 * KLOEL CHAT TOOLS — fine-grained checkout + product-URL capabilities (Wave7 L3).
 *
 * OpenAI tool schemas for the fine-grained `checkouts.*` / `urls.*` capabilities
 * registered in capability-registry-v2 (tier-3 checkouts / tier-6 urls). These are
 * dispatched by KloelDomainServiceResolver to real CheckoutService / ProductUrlService
 * methods (never Prisma-direct).
 *
 * Consumers should import the aggregated KLOEL_CHAT_TOOLS from
 * './kloel-chat-tools.definition' rather than this partition directly.
 */
export const KLOEL_CHAT_TOOLS_CHECKOUT_URL: ChatCompletionTool[] = [
  // ── CHECKOUTS (fine-grained) ──
  {
    type: 'function',
    function: {
      name: 'checkouts.customize_theme',
      description:
        'Personaliza o tema do checkout: cor principal, cor de fundo, cor do texto, texto do botão e layout (NOIR/BLANC)',
      parameters: {
        type: 'object',
        properties: {
          checkoutId: { type: 'string', description: 'ID do checkout' },
          accentColor: { type: 'string', description: 'Cor principal (accent)' },
          backgroundColor: { type: 'string', description: 'Cor de fundo' },
          textColor: { type: 'string', description: 'Cor do texto' },
          btnFinalizeText: { type: 'string', description: 'Texto do botão de finalizar' },
          theme: {
            type: 'string',
            enum: ['NOIR', 'BLANC'],
            description: 'Layout/tema base do checkout',
          },
        },
        required: ['checkoutId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'checkouts.set_timer',
      description: 'Configura o cronômetro de escassez (contagem regressiva/expiração) do checkout',
      parameters: {
        type: 'object',
        properties: {
          checkoutId: { type: 'string', description: 'ID do checkout' },
          enableTimer: { type: 'boolean', description: 'Ativar cronômetro' },
          timerType: { type: 'string', enum: ['COUNTDOWN', 'EXPIRATION', 'STOCK'] },
          timerMinutes: { type: 'number', description: 'Duração em minutos' },
          timerMessage: { type: 'string', description: 'Mensagem do cronômetro' },
        },
        required: ['checkoutId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'checkouts.set_social_proof',
      description: 'Configura a prova social (alertas de compra recente) do checkout',
      parameters: {
        type: 'object',
        properties: {
          checkoutId: { type: 'string', description: 'ID do checkout' },
          socialProofEnabled: { type: 'boolean', description: 'Ativar prova social' },
          socialProofAlerts: {
            type: 'string',
            description: 'JSON com os alertas configurados',
          },
        },
        required: ['checkoutId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'checkouts.set_testimonials',
      description: 'Configura os depoimentos exibidos no checkout',
      parameters: {
        type: 'object',
        properties: {
          checkoutId: { type: 'string', description: 'ID do checkout' },
          enableTestimonials: { type: 'boolean', description: 'Exibir depoimentos' },
          testimonials: {
            type: 'string',
            description: 'JSON com os depoimentos (nome, texto, nota)',
          },
        },
        required: ['checkoutId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'checkouts.set_warranty',
      description: 'Configura a garantia (devolução do dinheiro) exibida no checkout',
      parameters: {
        type: 'object',
        properties: {
          checkoutId: { type: 'string', description: 'ID do checkout' },
          enableGuarantee: { type: 'boolean', description: 'Exibir bloco de garantia' },
          guaranteeTitle: { type: 'string', description: 'Título da garantia' },
          guaranteeText: { type: 'string', description: 'Texto da garantia' },
          guaranteeDays: { type: 'number', description: 'Dias de garantia' },
        },
        required: ['checkoutId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'checkouts.set_exit_intent',
      description: 'Configura o popup de intenção de saída (exit intent) do checkout',
      parameters: {
        type: 'object',
        properties: {
          checkoutId: { type: 'string', description: 'ID do checkout' },
          enableExitIntent: { type: 'boolean', description: 'Ativar exit intent' },
          exitIntentTitle: { type: 'string', description: 'Título do popup' },
          exitIntentDescription: { type: 'string', description: 'Descrição do popup' },
          exitIntentCouponCode: { type: 'string', description: 'Cupom oferecido na saída' },
        },
        required: ['checkoutId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'checkouts.link_plans',
      description: 'Vincula planos a um checkout',
      parameters: {
        type: 'object',
        properties: {
          checkoutId: { type: 'string', description: 'ID do checkout' },
          planIds: {
            type: 'array',
            items: { type: 'string' },
            description: 'IDs dos planos a vincular',
          },
        },
        required: ['checkoutId', 'planIds'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'checkouts.set_coupon',
      description: 'Configura o uso de cupons no checkout (popup, cupom automático)',
      parameters: {
        type: 'object',
        properties: {
          checkoutId: { type: 'string', description: 'ID do checkout' },
          enableCoupon: { type: 'boolean', description: 'Permitir cupons' },
          showCouponPopup: { type: 'boolean', description: 'Mostrar popup de cupom' },
          autoCouponCode: { type: 'string', description: 'Cupom aplicado automaticamente' },
        },
        required: ['checkoutId'],
      },
    },
  },

  // ── PRODUCT URLS (fine-grained) ──
  {
    type: 'function',
    function: {
      name: 'urls.add',
      description: 'Adiciona uma URL (página de venda, landing page) a um produto',
      parameters: {
        type: 'object',
        properties: {
          productId: { type: 'string', description: 'ID do produto' },
          url: { type: 'string', description: 'URL a adicionar' },
          description: { type: 'string', description: 'Descrição da URL' },
        },
        required: ['productId', 'url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'urls.update',
      description: 'Atualiza uma URL existente de um produto',
      parameters: {
        type: 'object',
        properties: {
          urlId: { type: 'string', description: 'ID da URL' },
          url: { type: 'string', description: 'Nova URL' },
          description: { type: 'string', description: 'Nova descrição' },
          active: { type: 'boolean', description: 'URL ativa' },
        },
        required: ['urlId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'urls.delete',
      description: 'Remove uma URL de um produto',
      parameters: {
        type: 'object',
        properties: {
          urlId: { type: 'string', description: 'ID da URL' },
        },
        required: ['urlId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'urls.toggle_private',
      description: 'Ativa/desativa o modo privado de uma URL de produto',
      parameters: {
        type: 'object',
        properties: {
          urlId: { type: 'string', description: 'ID da URL' },
          enabled: { type: 'boolean', description: 'true para privada, false para pública' },
        },
        required: ['urlId', 'enabled'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'urls.toggle_kloel_learning',
      description: 'Ativa/desativa o aprendizado do Kloel a partir de uma URL de produto',
      parameters: {
        type: 'object',
        properties: {
          urlId: { type: 'string', description: 'ID da URL' },
          enabled: { type: 'boolean', description: 'true para ativar aprendizado' },
        },
        required: ['urlId', 'enabled'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'urls.toggle_kloel_chat_embed',
      description: 'Ativa/desativa o widget de chat do Kloel embutido em uma URL de produto',
      parameters: {
        type: 'object',
        properties: {
          urlId: { type: 'string', description: 'ID da URL' },
          enabled: { type: 'boolean', description: 'true para ativar o widget de chat' },
        },
        required: ['urlId', 'enabled'],
      },
    },
  },
];
