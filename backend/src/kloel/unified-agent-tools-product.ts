import type { ChatCompletionTool } from 'openai/resources/chat';

/**
 * Product management and marketing tool definitions for the Unified Agent.
 */
export const UNIFIED_AGENT_TOOLS_PRODUCT: ChatCompletionTool[] = [
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
