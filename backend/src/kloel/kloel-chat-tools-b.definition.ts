import { ChatCompletionTool } from 'openai/resources/chat';

/** Media and billing tool definitions for the KLOEL dashboard chat. */
export const KLOEL_CHAT_TOOLS_MEDIA_BILLING: ChatCompletionTool[] = [
  // === MÍDIA ===
  {
    type: 'function',
    function: {
      name: 'send_audio',
      description: 'Gera um áudio com a resposta e envia para o contato via WhatsApp',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Texto a ser convertido em áudio' },
          phone: { type: 'string', description: 'Número do telefone do contato' },
          voice: {
            type: 'string',
            enum: ['nova', 'alloy', 'echo', 'fable', 'onyx', 'shimmer'],
            description: 'Voz a usar',
          },
        },
        required: ['text', 'phone'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'send_document',
      description: 'Envia um documento (PDF, catálogo, contrato) para o contato via WhatsApp',
      parameters: {
        type: 'object',
        properties: {
          documentName: {
            type: 'string',
            description: 'Nome do documento cadastrado (ex: "catálogo", "contrato")',
          },
          url: { type: 'string', description: 'URL direta do documento (alternativa ao nome)' },
          phone: { type: 'string', description: 'Número do telefone do contato' },
          caption: { type: 'string', description: 'Legenda opcional' },
        },
        required: ['phone'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'send_voice_note',
      description: 'Gera e envia uma nota de voz personalizada para o contato',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Texto para converter em voz' },
          phone: { type: 'string', description: 'Número do telefone' },
        },
        required: ['text', 'phone'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'transcribe_audio',
      description: 'Transcreve um áudio recebido (de URL ou base64) para texto usando Whisper',
      parameters: {
        type: 'object',
        properties: {
          audioUrl: { type: 'string', description: 'URL do áudio para transcrever' },
          audioBase64: { type: 'string', description: 'Áudio em base64 (alternativa à URL)' },
          language: { type: 'string', description: 'Idioma do áudio (pt, en, es)', default: 'pt' },
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
        'Atualiza as informações de cobrança do cliente. Gera um link seguro do Stripe para adicionar/atualizar cartão de crédito.',
      parameters: {
        type: 'object',
        properties: {
          returnUrl: {
            type: 'string',
            description: 'URL para redirecionar após atualizar (opcional)',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_billing_status',
      description:
        'Retorna o status atual de cobrança: plano ativo, data de renovação, uso, limites e se está suspenso.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'change_plan',
      description:
        'Altera o plano do cliente (upgrade/downgrade). Planos disponíveis: starter, pro, enterprise.',
      parameters: {
        type: 'object',
        properties: {
          newPlan: {
            type: 'string',
            description: 'Novo plano desejado',
            enum: ['starter', 'pro', 'enterprise'],
          },
          immediate: {
            type: 'boolean',
            description: 'Se true, aplica imediatamente. Se false, aplica na próxima renovação.',
          },
        },
        required: ['newPlan'],
      },
    },
  },
];
