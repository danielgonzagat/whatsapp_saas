/**
 * ============================================
 * ONBOARDING TOOL SCHEMAS
 * ============================================
 * OpenAI ChatCompletion tool definitions for the
 * conversational onboarding AI tool-calling flow.
 * ============================================
 */

import type OpenAI from 'openai';

export const ONBOARDING_TOOLS: OpenAI.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'save_business_info',
      description: 'Salva informações básicas do negócio',
      parameters: {
        type: 'object',
        properties: {
          businessName: { type: 'string', description: 'Nome do negócio/empresa' },
          ownerName: { type: 'string', description: 'Nome do proprietário' },
          segment: {
            type: 'string',
            description: 'Segmento do negócio (ecommerce, serviços, infoprodutos, etc)',
          },
          description: { type: 'string', description: 'Breve descrição do negócio' },
        },
        required: ['businessName'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'save_contact_info',
      description: 'Salva informações de contato do negócio',
      parameters: {
        type: 'object',
        properties: {
          whatsappNumber: {
            type: 'string',
            description: 'Número de WhatsApp comercial (apenas números)',
          },
          email: { type: 'string', description: 'Email comercial' },
          instagram: { type: 'string', description: 'Instagram do negócio (sem @)' },
          website: { type: 'string', description: 'Website do negócio' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_product',
      description: 'Adiciona um produto ou serviço ao catálogo',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Nome do produto/serviço' },
          price: { type: 'number', description: 'Preço em reais' },
          description: { type: 'string', description: 'Descrição do produto/serviço' },
          category: { type: 'string', description: 'Categoria do produto' },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_brand_voice',
      description: 'Define o tom de voz e personalidade da marca',
      parameters: {
        type: 'object',
        properties: {
          tone: {
            type: 'string',
            enum: ['formal', 'informal', 'amigável', 'profissional', 'divertido'],
            description: 'Tom de voz da comunicação',
          },
          emoji: { type: 'boolean', description: 'Se deve usar emojis nas mensagens' },
          greeting: { type: 'string', description: 'Saudação padrão para clientes' },
          signature: { type: 'string', description: 'Assinatura/despedida padrão' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_business_hours',
      description: 'Define horário de funcionamento',
      parameters: {
        type: 'object',
        properties: {
          weekdayStart: {
            type: 'string',
            description: 'Horário de início dias úteis (ex: 09:00)',
          },
          weekdayEnd: { type: 'string', description: 'Horário de fim dias úteis (ex: 18:00)' },
          saturdayStart: { type: 'string', description: 'Horário de início sábado' },
          saturdayEnd: { type: 'string', description: 'Horário de fim sábado' },
          workOnSunday: { type: 'boolean', description: 'Se trabalha aos domingos' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_main_goal',
      description: 'Define o objetivo principal do usuário com a KLOEL',
      parameters: {
        type: 'object',
        properties: {
          goal: {
            type: 'string',
            enum: ['vendas', 'leads', 'atendimento', 'agendamentos', 'suporte'],
            description: 'Objetivo principal',
          },
          targetAudience: { type: 'string', description: 'Público-alvo do negócio' },
          painPoints: {
            type: 'array',
            items: { type: 'string' },
            description: 'Principais dores/problemas que quer resolver',
          },
        },
        required: ['goal'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_initial_flow',
      description: 'Cria um fluxo de automação inicial baseado no tipo de negócio',
      parameters: {
        type: 'object',
        properties: {
          flowType: {
            type: 'string',
            enum: ['welcome', 'sales', 'support', 'scheduling', 'lead_capture'],
            description: 'Tipo de fluxo a criar',
          },
          businessContext: {
            type: 'string',
            description: 'Contexto do negócio para personalizar o fluxo',
          },
          customMessages: {
            type: 'array',
            items: { type: 'string' },
            description: 'Mensagens personalizadas para o fluxo',
          },
        },
        required: ['flowType'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'complete_onboarding',
      description:
        'Finaliza o onboarding e prepara o workspace para uso. Sempre crie pelo menos um fluxo antes de finalizar.',
      parameters: {
        type: 'object',
        properties: {
          summary: { type: 'string', description: 'Resumo do que foi configurado' },
          nextSteps: {
            type: 'array',
            items: { type: 'string' },
            description: 'Próximos passos recomendados',
          },
          createDefaultFlows: {
            type: 'boolean',
            description: 'Se deve criar fluxos padrão automaticamente',
          },
        },
        required: ['summary'],
      },
    },
  },
];
