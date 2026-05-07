import type { ChatCompletionTool } from 'openai/resources/chat';

/**
 * Sales, leads, and scheduling tool definitions for the Unified Agent.
 */
export const UNIFIED_AGENT_TOOLS_SALES: ChatCompletionTool[] = [
  // === VENDAS ===
  {
    type: 'function',
    function: {
      name: 'send_product_info',
      description: 'Envia informações sobre um produto específico, incluindo preço e descrição',
      parameters: {
        type: 'object',
        properties: {
          productName: { type: 'string', description: 'Nome do produto' },
          includePrice: { type: 'boolean', description: 'Se deve incluir preço' },
          includeLink: { type: 'boolean', description: 'Se deve incluir link de pagamento' },
        },
        required: ['productName'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_payment_link',
      description: 'Cria e envia um link de pagamento para o cliente',
      parameters: {
        type: 'object',
        properties: {
          productName: { type: 'string' },
          amount: { type: 'number' },
          description: { type: 'string' },
        },
        required: ['productName', 'amount'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'apply_discount',
      description: 'Aplica um desconto para fechar a venda',
      parameters: {
        type: 'object',
        properties: {
          discountPercent: { type: 'number', minimum: 1, maximum: 30 },
          reason: { type: 'string' },
          expiresIn: { type: 'string', description: 'Tempo de expiração (ex: 24h, 1d)' },
        },
        required: ['discountPercent', 'reason'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'handle_objection',
      description: 'Trata objeção do cliente com técnicas de vendas',
      parameters: {
        type: 'object',
        properties: {
          objectionType: {
            type: 'string',
            enum: ['price', 'time', 'trust', 'need', 'competitor', 'other'],
          },
          technique: {
            type: 'string',
            enum: ['value_focus', 'social_proof', 'urgency', 'guarantee', 'comparison'],
          },
        },
        required: ['objectionType'],
      },
    },
  },
  // === LEADS ===
  {
    type: 'function',
    function: {
      name: 'qualify_lead',
      description: 'Qualifica o lead perguntando informações estratégicas',
      parameters: {
        type: 'object',
        properties: {
          questions: {
            type: 'array',
            items: { type: 'string' },
            description: 'Perguntas de qualificação',
          },
          stage: {
            type: 'string',
            enum: ['awareness', 'interest', 'decision', 'action'],
          },
        },
        required: ['questions'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_lead_status',
      description: 'Atualiza o status do lead no CRM',
      parameters: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['new', 'qualified', 'interested', 'negotiating', 'won', 'lost', 'nurturing'],
          },
          intent: { type: 'string' },
          score: { type: 'number', minimum: 0, maximum: 100 },
        },
        required: ['status'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_tag',
      description: 'Adiciona uma tag ao contato para segmentação',
      parameters: {
        type: 'object',
        properties: { tag: { type: 'string' } },
        required: ['tag'],
      },
    },
  },
  // === AGENDAMENTO ===
  {
    type: 'function',
    function: {
      name: 'schedule_meeting',
      description: 'Agenda uma reunião ou demonstração',
      parameters: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['demo', 'consultation', 'followup', 'support'] },
          suggestedTimes: {
            type: 'array',
            items: { type: 'string' },
            description: 'Horários sugeridos',
          },
        },
        required: ['type'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'schedule_followup',
      description: 'Agenda um follow-up automático',
      parameters: {
        type: 'object',
        properties: {
          delayHours: { type: 'number' },
          message: { type: 'string' },
          reason: { type: 'string' },
        },
        required: ['delayHours'],
      },
    },
  },
];
