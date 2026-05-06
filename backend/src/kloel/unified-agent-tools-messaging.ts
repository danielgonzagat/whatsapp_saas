import type { ChatCompletionTool } from 'openai/resources/chat';

/**
 * Messaging, attendance, retention, flows, and analytics tool definitions.
 */
export const UNIFIED_AGENT_TOOLS_MESSAGING: ChatCompletionTool[] = [
  // === COMUNICAÇÃO ===
  {
    type: 'function',
    function: {
      name: 'send_message',
      description: 'Envia mensagem de texto para o cliente',
      parameters: {
        type: 'object',
        properties: {
          message: { type: 'string' },
          quickReplies: {
            type: 'array',
            items: { type: 'string' },
            description: 'Botões de resposta rápida',
          },
        },
        required: ['message'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'send_media',
      description: 'Envia mídia (imagem, PDF, vídeo) para o cliente',
      parameters: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['image', 'document', 'video', 'audio'] },
          url: { type: 'string' },
          caption: { type: 'string' },
        },
        required: ['type', 'url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'send_document',
      description:
        'Envia documento ou catálogo (PDF/arquivo) para o cliente. Pode buscar pelo nome do documento cadastrado ou usar URL direta.',
      parameters: {
        type: 'object',
        properties: {
          documentName: {
            type: 'string',
            description:
              'Nome do documento cadastrado no sistema (ex: "catálogo", "tabela preços")',
          },
          url: {
            type: 'string',
            description: 'URL direta do documento (usado se documentName não for informado)',
          },
          caption: {
            type: 'string',
            description: 'Mensagem opcional que acompanha o documento',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'send_voice_note',
      description: 'Gera e envia nota de voz usando TTS',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Texto para converter em áudio' },
          voice: {
            type: 'string',
            enum: ['nova', 'alloy', 'echo', 'fable', 'onyx', 'shimmer'],
          },
        },
        required: ['text'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'send_audio',
      description: 'Gera e envia um áudio curto a partir de texto informado',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Texto para converter em áudio' },
          voice: {
            type: 'string',
            description: 'Voz/TTS a utilizar',
            enum: ['nova', 'alloy', 'echo', 'fable', 'onyx', 'shimmer'],
          },
        },
        required: ['text'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'transcribe_audio',
      description: 'Transcreve áudio de uma URL ou base64 usando Whisper para texto',
      parameters: {
        type: 'object',
        properties: {
          audioUrl: { type: 'string', description: 'URL do áudio para transcrever' },
          audioBase64: { type: 'string', description: 'Áudio em base64 (alternativa à URL)' },
          language: {
            type: 'string',
            description: 'Idioma do áudio (pt, en, es, etc)',
            default: 'pt',
          },
        },
      },
    },
  },
  // === ATENDIMENTO ===
  {
    type: 'function',
    function: {
      name: 'transfer_to_human',
      description: 'Transfere conversa para atendente humano',
      parameters: {
        type: 'object',
        properties: {
          reason: { type: 'string' },
          priority: { type: 'string', enum: ['low', 'normal', 'high', 'urgent'] },
          department: { type: 'string' },
        },
        required: ['reason'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_knowledge_base',
      description: 'Busca informação na base de conhecimento',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query'],
      },
    },
  },
  // === RETENÇÃO ===
  {
    type: 'function',
    function: {
      name: 'anti_churn_action',
      description: 'Executa ação de retenção para evitar cancelamento',
      parameters: {
        type: 'object',
        properties: {
          strategy: {
            type: 'string',
            enum: ['discount', 'upgrade', 'downgrade', 'pause', 'feedback', 'vip_support'],
          },
          offer: { type: 'string' },
        },
        required: ['strategy'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'reactivate_ghost',
      description: 'Tenta reativar um lead que parou de responder',
      parameters: {
        type: 'object',
        properties: {
          strategy: {
            type: 'string',
            enum: ['curiosity', 'urgency', 'value', 'question', 'social_proof'],
          },
          daysSilent: { type: 'number' },
        },
        required: ['strategy'],
      },
    },
  },
  // === FLUXOS ===
  {
    type: 'function',
    function: {
      name: 'trigger_flow',
      description: 'Inicia um fluxo automatizado',
      parameters: {
        type: 'object',
        properties: {
          flowId: { type: 'string' },
          flowName: { type: 'string', description: 'Nome do fluxo se ID não disponível' },
        },
      },
    },
  },
  // === ANALYTICS ===
  {
    type: 'function',
    function: {
      name: 'log_event',
      description: 'Registra evento para analytics',
      parameters: {
        type: 'object',
        properties: {
          event: { type: 'string' },
          properties: { type: 'object' },
        },
        required: ['event'],
      },
    },
  },
];
