import type { ChatCompletionTool } from 'openai/resources/chat';

/**
 * Product management and marketing tool definitions for the Unified Agent.
 */
/**
 * CRITICAL GAP TOOLS — Added 2026-05-20
 * Plan, Checkout, Coupon management for complete product operations via chat.
 */
const PRODUCT_SUB_RESOURCE_TOOLS: ChatCompletionTool[] = [
  // === PLANOS ===
  {
    type: 'function',
    function: {
      name: 'create_plan',
      description:
        'Cria um novo plano para um produto, com pagamentos, frete, parcelas e afiliação',
      parameters: {
        type: 'object',
        properties: {
          productId: { type: 'string', description: 'ID do produto' },
          productName: { type: 'string', description: 'Nome do produto (alternativa ao ID)' },
          planName: {
            type: 'string',
            description: 'Nome do plano (ex: "1 Frasco", "Kit 3 Frascos")',
          },
          price: { type: 'number', description: 'Preço em reais' },
          quantity: { type: 'number', description: 'Quantidade de itens no plano' },
          maxInstallments: { type: 'number', description: 'Máximo de parcelas (1 = à vista)' },
          acceptPix: { type: 'boolean', description: 'Aceitar pagamento via PIX' },
          acceptCard: { type: 'boolean', description: 'Aceitar pagamento via cartão' },
          acceptBoleto: { type: 'boolean', description: 'Aceitar pagamento via boleto' },
          freightType: {
            type: 'string',
            enum: ['free', 'fixed', 'variable'],
            description: 'Tipo de frete',
          },
          freightValue: {
            type: 'number',
            description: 'Valor do frete fixo (se freightType=fixed)',
          },
          allowCoupons: { type: 'boolean', description: 'Permitir cupons de desconto' },
          visibleToAffiliates: { type: 'boolean', description: 'Visível para afiliados' },
          customCommission: { type: 'number', description: 'Comissão personalizada em %' },
        },
        required: ['productName', 'planName', 'price'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_plan',
      description: 'Atualiza um plano existente',
      parameters: {
        type: 'object',
        properties: {
          planId: { type: 'string', description: 'ID do plano' },
          planName: { type: 'string' },
          price: { type: 'number' },
          quantity: { type: 'number' },
          maxInstallments: { type: 'number' },
          acceptPix: { type: 'boolean' },
          acceptCard: { type: 'boolean' },
          acceptBoleto: { type: 'boolean' },
          freightType: { type: 'string', enum: ['free', 'fixed', 'variable'] },
          freightValue: { type: 'number' },
          allowCoupons: { type: 'boolean' },
          visibleToAffiliates: { type: 'boolean' },
          customCommission: { type: 'number' },
          active: { type: 'boolean', description: 'Disponível para venda' },
        },
        required: ['planId'],
      },
    },
  },
  // === CHECKOUTS ===
  {
    type: 'function',
    function: {
      name: 'create_checkout',
      description: 'Cria um novo checkout vinculado a planos de um produto',
      parameters: {
        type: 'object',
        properties: {
          productId: { type: 'string', description: 'ID do produto' },
          productName: { type: 'string', description: 'Nome do produto (alternativa ao ID)' },
          checkoutName: { type: 'string', description: 'Nome do checkout' },
          description: { type: 'string', description: 'Descrição do checkout' },
          acceptPix: { type: 'boolean', description: 'Aceitar PIX' },
          acceptCard: { type: 'boolean', description: 'Aceitar cartão' },
          acceptBoleto: { type: 'boolean', description: 'Aceitar boleto' },
          buttonText: { type: 'string', description: 'Texto do botão (ex: "Comprar agora")' },
          primaryColor: { type: 'string', description: 'Cor principal em hex' },
          bgColor: { type: 'string', description: 'Cor de fundo em hex' },
          planIds: {
            type: 'array',
            items: { type: 'string' },
            description: 'IDs dos planos a vincular',
          },
          couponCode: { type: 'string', description: 'Código do cupom automático' },
          showCounter: { type: 'boolean', description: 'Exibir contador' },
          showSocialProof: { type: 'boolean', description: 'Exibir prova social' },
          showGuarantee: { type: 'boolean', description: 'Exibir garantia' },
          exitIntentPopup: { type: 'boolean', description: 'Ativar popup de saída' },
        },
        required: ['productName', 'checkoutName'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_checkout',
      description: 'Atualiza um checkout existente',
      parameters: {
        type: 'object',
        properties: {
          checkoutId: { type: 'string' },
          checkoutName: { type: 'string' },
          description: { type: 'string' },
          acceptPix: { type: 'boolean' },
          acceptCard: { type: 'boolean' },
          acceptBoleto: { type: 'boolean' },
          buttonText: { type: 'string' },
          primaryColor: { type: 'string' },
          bgColor: { type: 'string' },
          planIds: { type: 'array', items: { type: 'string' } },
          couponCode: { type: 'string' },
          showCounter: { type: 'boolean' },
          showSocialProof: { type: 'boolean' },
          showGuarantee: { type: 'boolean' },
          exitIntentPopup: { type: 'boolean' },
          active: { type: 'boolean' },
        },
        required: ['checkoutId'],
      },
    },
  },
  // === CUPONS ===
  {
    type: 'function',
    function: {
      name: 'create_coupon',
      description: 'Cria um cupom de desconto para um produto',
      parameters: {
        type: 'object',
        properties: {
          productId: { type: 'string', description: 'ID do produto' },
          productName: { type: 'string', description: 'Nome do produto (alternativa ao ID)' },
          code: { type: 'string', description: 'Código do cupom (ex: "PDRN10")' },
          discountType: {
            type: 'string',
            enum: ['percentage', 'fixed'],
            description: 'Tipo de desconto',
          },
          discountValue: { type: 'number', description: 'Valor do desconto (% ou R$)' },
          usageLimit: { type: 'number', description: 'Limite de usos' },
          expiresInDays: { type: 'number', description: 'Dias até expirar' },
        },
        required: ['productName', 'code', 'discountType', 'discountValue'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_coupons',
      description: 'Lista cupons de um produto',
      parameters: {
        type: 'object',
        properties: {
          productId: { type: 'string' },
          productName: { type: 'string' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_coupon',
      description: 'Remove um cupom',
      parameters: {
        type: 'object',
        properties: {
          couponId: { type: 'string' },
          productId: { type: 'string' },
        },
        required: ['couponId'],
      },
    },
  },
  // === BOLETO ===
  {
    type: 'function',
    function: {
      name: 'generate_boleto',
      description: 'Gera um boleto bancário real para um lead/comprador',
      parameters: {
        type: 'object',
        properties: {
          productName: { type: 'string', description: 'Nome do produto' },
          amount: { type: 'number', description: 'Valor em reais' },
          customerName: { type: 'string', description: 'Nome completo do comprador' },
          customerPhone: { type: 'string', description: 'Telefone do comprador' },
          customerEmail: { type: 'string', description: 'Email do comprador' },
          customerCpf: { type: 'string', description: 'CPF do comprador' },
        },
        required: ['productName', 'amount', 'customerName', 'customerPhone'],
      },
    },
  },
  // === PIX ===
  {
    type: 'function',
    function: {
      name: 'generate_pix',
      description: 'Gera um PIX (QR code + copia e cola) real para um lead/comprador',
      parameters: {
        type: 'object',
        properties: {
          productName: { type: 'string', description: 'Nome do produto' },
          amount: { type: 'number', description: 'Valor em reais' },
          customerName: { type: 'string', description: 'Nome completo do comprador' },
          customerPhone: { type: 'string', description: 'Telefone do comprador' },
          customerEmail: { type: 'string', description: 'Email do comprador (opcional)' },
        },
        required: ['productName', 'amount', 'customerName', 'customerPhone'],
      },
    },
  },
];
export const UNIFIED_AGENT_TOOLS_PRODUCT: ChatCompletionTool[] = [
  ...PRODUCT_SUB_RESOURCE_TOOLS,

  // === KIA LAYER: GERENCIAMENTO AUTÔNOMO ===
  {
    type: 'function',
    function: {
      name: 'create_product',
      description: 'Cria um novo produto no catálogo do workspace',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Nome do produto' },
          price: { type: 'number', description: 'Preço em reais' },
          description: { type: 'string', description: 'Descrição do produto' },
          category: { type: 'string', description: 'Categoria do produto' },
          imageUrl: { type: 'string', description: 'URL da imagem do produto' },
          paymentLink: { type: 'string', description: 'Link de pagamento' },
        },
        required: ['name', 'price'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_product',
      description: 'Atualiza um produto existente',
      parameters: {
        type: 'object',
        properties: {
          productId: { type: 'string' },
          name: { type: 'string' },
          price: { type: 'number' },
          description: { type: 'string' },
          active: { type: 'boolean' },
        },
        required: ['productId'],
      },
    },
  },
  // === MARKETING ARTIFICIAL TOOLS ===
  {
    type: 'function',
    function: {
      name: 'get_product_plans',
      description: 'Lista todos os planos de um produto',
      parameters: {
        type: 'object',
        properties: { productId: { type: 'string' } },
        required: ['productId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_product_ai_config',
      description:
        'Retorna a configuração de inteligência artificial de um produto (perfil cliente, objeções, tom, argumentos)',
      parameters: {
        type: 'object',
        properties: { productId: { type: 'string' } },
        required: ['productId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_product_reviews',
      description: 'Lista avaliações de um produto',
      parameters: {
        type: 'object',
        properties: { productId: { type: 'string' } },
        required: ['productId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_product_urls',
      description: 'Lista URLs cadastradas de um produto (páginas de venda, landing pages)',
      parameters: {
        type: 'object',
        properties: { productId: { type: 'string' } },
        required: ['productId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'validate_coupon',
      description: 'Valida um cupom de desconto para um produto',
      parameters: {
        type: 'object',
        properties: {
          productId: { type: 'string' },
          code: { type: 'string' },
        },
        required: ['productId', 'code'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_flow',
      description: 'Cria um novo fluxo de automação',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Nome do fluxo' },
          trigger: {
            type: 'string',
            enum: ['message', 'keyword', 'tag', 'schedule', 'event'],
            description: 'Tipo de gatilho',
          },
          triggerValue: {
            type: 'string',
            description: 'Valor do gatilho (palavra-chave, tag, etc)',
          },
          steps: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                type: { type: 'string', enum: ['message', 'delay', 'condition', 'action'] },
                content: { type: 'string' },
                delay: { type: 'number', description: 'Delay em minutos se tipo for delay' },
              },
            },
            description: 'Passos do fluxo',
          },
        },
        required: ['name', 'trigger'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_workspace_settings',
      description: 'Atualiza configurações do workspace',
      parameters: {
        type: 'object',
        properties: {
          businessName: { type: 'string' },
          businessHours: {
            type: 'object',
            properties: {
              start: { type: 'string' },
              end: { type: 'string' },
              days: { type: 'array', items: { type: 'string' } },
            },
          },
          autoReplyEnabled: { type: 'boolean' },
          autoReplyMessage: { type: 'string' },
          aiEnabled: { type: 'boolean' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_broadcast',
      description: 'Cria uma campanha de broadcast para múltiplos contatos',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Nome da campanha' },
          message: { type: 'string', description: 'Mensagem a ser enviada' },
          targetTags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Tags dos contatos que receberão',
          },
          scheduleAt: { type: 'string', description: 'Data/hora para envio (ISO)' },
        },
        required: ['name', 'message'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_analytics',
      description: 'Obtém métricas e analytics do workspace',
      parameters: {
        type: 'object',
        properties: {
          metric: {
            type: 'string',
            enum: ['messages', 'contacts', 'sales', 'conversions', 'response_time'],
          },
          period: { type: 'string', enum: ['today', 'week', 'month', 'year'] },
        },
        required: ['metric'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_products',
      description: 'Lista todos os produtos do workspace com nome, preco e status ativo',
      parameters: {
        type: 'object',
        properties: {
          search: { type: 'string', description: 'Filtro opcional por nome' },
          limit: { type: 'number', description: 'Maximo de resultados (padrao 50)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'configure_ai_persona',
      description: 'Configura a persona e tom de voz da IA',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Nome da IA (ex: KLOEL)' },
          personality: { type: 'string', description: 'Descrição da personalidade' },
          tone: {
            type: 'string',
            enum: ['formal', 'informal', 'friendly', 'professional', 'funny'],
          },
          language: { type: 'string', default: 'pt-BR' },
          useEmojis: { type: 'boolean' },
        },
      },
    },
  },
];
