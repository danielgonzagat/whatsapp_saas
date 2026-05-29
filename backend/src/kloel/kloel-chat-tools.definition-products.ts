import { ChatCompletionTool } from 'openai/resources/chat';

/**
 * Wave7 L1 — fine-grained product tool definitions (Y-1/Y-2).
 *
 * One ChatCompletionTool per fine-grained product capability registered in
 * `capability-registry-v2/partitions/tier-1-products.ts`. Each tool name is the
 * canonical capability id, so the KloelDomainServiceResolver dispatches it
 * straight to the real ProductService method (resolver path: `(ws, args)`),
 * never Prisma-direct.
 *
 * This per-domain file is intentionally NOT spread into the shared aggregator
 * here — the aggregator (`kloel-chat-tools.definition.ts`) owns that wiring.
 * Consumers import `KLOEL_CHAT_TOOLS_PRODUCTS` and add it to the aggregate.
 */
export const KLOEL_CHAT_TOOLS_PRODUCTS: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'products.set_pixels',
      description: 'Configura os pixels de rastreamento (FB/Google/TikTok) de um produto',
      parameters: {
        type: 'object',
        properties: {
          productId: { type: 'string', description: 'ID do produto' },
          pixels: {
            type: 'array',
            description: 'Lista de pixels { type, pixelId, accessToken? }',
            items: {
              type: 'object',
              properties: {
                type: { type: 'string', description: 'FACEBOOK, GOOGLE_ADS, TIKTOK, etc.' },
                pixelId: { type: 'string', description: 'ID do pixel' },
                accessToken: { type: 'string', description: 'Token de acesso (opcional)' },
              },
              required: ['type', 'pixelId'],
            },
          },
        },
        required: ['productId', 'pixels'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'products.set_shipping',
      description: 'Configura tipo, valor e origem de frete e garantia de um produto',
      parameters: {
        type: 'object',
        properties: {
          productId: { type: 'string', description: 'ID do produto' },
          shippingType: {
            type: 'string',
            enum: ['FREE', 'FIXED', 'VARIABLE', 'NONE'],
            description: 'Tipo de frete',
          },
          shippingValue: { type: 'number', description: 'Valor do frete em reais' },
          originCep: { type: 'string', description: 'CEP de origem' },
          warrantyDays: { type: 'number', description: 'Dias de garantia' },
        },
        required: ['productId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'products.set_fulfillment',
      description: 'Configura o provedor de logística/entrega (fulfillment) de um produto',
      parameters: {
        type: 'object',
        properties: {
          productId: { type: 'string', description: 'ID do produto' },
          provider: { type: 'string', description: 'Provedor de logística' },
        },
        required: ['productId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'products.set_sales_page',
      description: 'Define a URL da página de vendas de um produto',
      parameters: {
        type: 'object',
        properties: {
          productId: { type: 'string', description: 'ID do produto' },
          salesPageUrl: { type: 'string', description: 'URL da página de vendas' },
        },
        required: ['productId', 'salesPageUrl'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'products.update_urls',
      description:
        'Atualiza URLs de obrigado, boleto, pix, Reclame Aqui e e-mail de suporte de um produto',
      parameters: {
        type: 'object',
        properties: {
          productId: { type: 'string', description: 'ID do produto' },
          thankyouUrl: { type: 'string', description: 'URL de obrigado' },
          thankyouBoletoUrl: { type: 'string', description: 'URL de obrigado (boleto)' },
          thankyouPixUrl: { type: 'string', description: 'URL de obrigado (pix)' },
          reclameAquiUrl: { type: 'string', description: 'URL do Reclame Aqui' },
          supportEmail: { type: 'string', description: 'E-mail de suporte' },
        },
        required: ['productId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'products.toggle_availability',
      description: 'Liga ou desliga a disponibilidade de venda de um produto',
      parameters: {
        type: 'object',
        properties: {
          productId: { type: 'string', description: 'ID do produto' },
          available: { type: 'boolean', description: 'true para disponibilizar, false para pausar' },
        },
        required: ['productId', 'available'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'products.review_and_publish',
      description: 'Revisa, aprova e publica um produto, tornando-o ativo para venda',
      parameters: {
        type: 'object',
        properties: {
          productId: { type: 'string', description: 'ID do produto' },
        },
        required: ['productId'],
      },
    },
  },
];

/** Canonical capability ids exposed by this partition (for aggregator wiring). */
export const KLOEL_CHAT_TOOLS_PRODUCTS_NAMES = [
  'products.set_pixels',
  'products.set_shipping',
  'products.set_fulfillment',
  'products.set_sales_page',
  'products.update_urls',
  'products.toggle_availability',
  'products.review_and_publish',
] as const;
