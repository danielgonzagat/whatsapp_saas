import type { ChatCompletionTool } from 'openai/resources/chat';

/**
 * Autopilot control, workspace operations, and billing tool definitions.
 */
export const UNIFIED_AGENT_TOOLS_CONTROL: ChatCompletionTool[] = [
  // === KIA LAYER: AUTOPILOT CONTROL ===
  {
    type: 'function',
    function: {
      name: 'toggle_autopilot',
      description: 'Liga ou desliga o autopilot de atendimento automático',
      parameters: {
        type: 'object',
        properties: {
          enabled: { type: 'boolean', description: 'true para ligar, false para desligar' },
          mode: {
            type: 'string',
            enum: ['full', 'copilot', 'off'],
            description:
              'Modo: full (100% automático), copilot (sugere respostas), off (desligado)',
          },
          workingHoursOnly: { type: 'boolean', description: 'Só operar em horário comercial' },
        },
        required: ['enabled'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_flow_from_description',
      description: 'Cria um fluxo completo de automação baseado em descrição natural',
      parameters: {
        type: 'object',
        properties: {
          description: { type: 'string', description: 'Descrição do que o fluxo deve fazer' },
          objective: {
            type: 'string',
            enum: ['sales', 'support', 'onboarding', 'nurturing', 'reactivation', 'feedback'],
            description: 'Objetivo principal do fluxo',
          },
          productId: { type: 'string', description: 'Produto relacionado (se for venda)' },
          autoActivate: { type: 'boolean', description: 'Ativar automaticamente após criar' },
        },
        required: ['description', 'objective'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'connect_whatsapp',
      description: 'Inicia conexão oficial do WhatsApp via Meta Cloud API',
      parameters: {
        type: 'object',
        properties: {
          provider: {
            type: 'string',
            enum: ['meta-cloud'],
            description: 'Provedor oficial do WhatsApp',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'import_contacts',
      description: 'Importa contatos de uma fonte',
      parameters: {
        type: 'object',
        properties: {
          source: {
            type: 'string',
            enum: ['csv', 'google_contacts', 'webhook'],
            description: 'Fonte dos contatos',
          },
          csvData: { type: 'string', description: 'Dados CSV se fonte for csv' },
          addTags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Tags a adicionar nos contatos importados',
          },
        },
        required: ['source'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generate_sales_funnel',
      description: 'Gera um funil de vendas completo com múltiplos fluxos',
      parameters: {
        type: 'object',
        properties: {
          funnelName: { type: 'string', description: 'Nome do funil' },
          productId: { type: 'string', description: 'Produto principal' },
          stages: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['awareness', 'interest', 'consideration', 'intent', 'purchase', 'retention'],
            },
            description: 'Etapas do funil a criar',
          },
          includeFollowUps: { type: 'boolean', description: 'Incluir follow-ups automáticos' },
          includeUpsell: { type: 'boolean', description: 'Incluir ofertas de upsell' },
        },
        required: ['funnelName', 'productId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'schedule_campaign',
      description: 'Agenda uma campanha para data/hora específica',
      parameters: {
        type: 'object',
        properties: {
          campaignId: { type: 'string', description: 'ID da campanha existente' },
          scheduleAt: { type: 'string', description: 'Data/hora ISO para disparo' },
          targetFilters: {
            type: 'object',
            properties: {
              tags: { type: 'array', items: { type: 'string' } },
              leadScore: { type: 'number' },
              lastInteractionDays: { type: 'number' },
            },
          },
        },
        required: ['scheduleAt'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_workspace_status',
      description: 'Retorna status completo do workspace: conexões, métricas, saúde',
      parameters: {
        type: 'object',
        properties: {
          includeMetrics: { type: 'boolean', description: 'Incluir métricas de uso' },
          includeConnections: { type: 'boolean', description: 'Incluir status de conexões' },
          includeHealth: { type: 'boolean', description: 'Incluir indicadores de saúde' },
        },
      },
    },
  },
  // === BILLING ===
  {
    type: 'function',
    function: {
      name: 'update_billing_info',
      description:
        'Gera um link seguro para o usuário cadastrar ou atualizar seu cartão de crédito',
      parameters: {
        type: 'object',
        properties: {
          returnUrl: { type: 'string', description: 'URL para redirecionar após conclusão' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_billing_status',
      description: 'Retorna status da assinatura e métodos de pagamento do workspace',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'change_plan',
      description: 'Altera o plano de assinatura do workspace',
      parameters: {
        type: 'object',
        properties: {
          plan: {
            type: 'string',
            enum: ['starter', 'pro', 'enterprise'],
            description: 'Novo plano',
          },
        },
        required: ['plan'],
      },
    },
  },
];
