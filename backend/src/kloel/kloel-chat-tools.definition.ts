import { ChatCompletionTool } from 'openai/resources/chat';
import { KLOEL_CHAT_TOOLS_MEDIA_BILLING } from './kloel-chat-tools-b.definition';

/** Core tool definitions (products, automation, metrics, payments, whatsapp, leads, settings, campaigns). */
const KLOEL_CHAT_TOOLS_CORE: ChatCompletionTool[] = [
  // === PRODUTOS ===
  {
    type: 'function',
    function: {
      name: 'save_product',
      description: 'Cadastra um novo produto no catálogo',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Nome do produto' },
          price: { type: 'number', description: 'Preço em reais' },
          description: { type: 'string', description: 'Descrição do produto' },
        },
        required: ['name', 'price'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_products',
      description: 'Lista todos os produtos cadastrados',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_product',
      description: 'Remove um produto do catálogo',
      parameters: {
        type: 'object',
        properties: {
          productId: { type: 'string', description: 'ID do produto' },
          productName: { type: 'string', description: 'Nome do produto (alternativa ao ID)' },
        },
      },
    },
  },
  // === AUTOMAÇÃO ===
  {
    type: 'function',
    function: {
      name: 'toggle_autopilot',
      description: 'Liga ou desliga o Autopilot (IA de vendas automáticas)',
      parameters: {
        type: 'object',
        properties: {
          enabled: { type: 'boolean', description: 'true para ligar, false para desligar' },
        },
        required: ['enabled'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_brand_voice',
      description: 'Define o tom de voz e personalidade da IA',
      parameters: {
        type: 'object',
        properties: {
          tone: { type: 'string', description: 'Tom de voz (ex: formal, casual, amigável)' },
          personality: { type: 'string', description: 'Descrição da personalidade' },
        },
        required: ['tone'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'remember_user_info',
      description:
        'Salva uma informação útil sobre o usuário do dashboard para personalizar conversas futuras',
      parameters: {
        type: 'object',
        properties: {
          key: {
            type: 'string',
            description:
              'Tipo de informação: nome, preferencia, nicho, produto, tom_de_voz, meta, objeção',
          },
          value: { type: 'string', description: 'Informação concreta revelada pelo usuário' },
        },
        required: ['key', 'value'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_web',
      description:
        'Pesquisa a web quando a pergunta exige dados atuais, fatos recentes, preços, disponibilidade ou confirmação factual',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Consulta objetiva para pesquisar na web' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_flow',
      description: 'Cria um fluxo de automação simples',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Nome do fluxo' },
          trigger: { type: 'string', description: 'Gatilho (ex: nova_mensagem, nova_venda)' },
          actions: {
            type: 'array',
            items: { type: 'string' },
            description: 'Lista de ações do fluxo',
          },
        },
        required: ['name', 'trigger'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_flows',
      description: 'Lista todos os fluxos de automação',
      parameters: { type: 'object', properties: {} },
    },
  },
  // === MÉTRICAS ===
  {
    type: 'function',
    function: {
      name: 'get_dashboard_summary',
      description: 'Retorna resumo de métricas do dashboard',
      parameters: {
        type: 'object',
        properties: {
          period: { type: 'string', enum: ['today', 'week', 'month'], description: 'Período' },
        },
      },
    },
  },
  // === PAGAMENTOS ===
  {
    type: 'function',
    function: {
      name: 'create_payment_link',
      description: 'Cria um link de pagamento PIX',
      parameters: {
        type: 'object',
        properties: {
          amount: { type: 'number', description: 'Valor em reais' },
          description: { type: 'string', description: 'Descrição do pagamento' },
          customerName: { type: 'string', description: 'Nome do cliente' },
        },
        required: ['amount', 'description'],
      },
    },
  },
  // === WHATSAPP ===
  {
    type: 'function',
    function: {
      name: 'connect_whatsapp',
      description: 'Inicia o processo de conexão do WhatsApp via QR Code',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_whatsapp_status',
      description: 'Verifica o status da conexão do WhatsApp',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'send_whatsapp_message',
      description: 'Envia uma mensagem via WhatsApp',
      parameters: {
        type: 'object',
        properties: {
          phone: { type: 'string', description: 'Número do telefone (apenas números)' },
          message: { type: 'string', description: 'Mensagem a enviar' },
        },
        required: ['phone', 'message'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_whatsapp_contacts',
      description: 'Lista os contatos reais disponíveis para a IA operar no WhatsApp e no CRM',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Quantidade máxima de contatos retornados' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_whatsapp_contact',
      description:
        'Cria ou atualiza um contato operacional no CRM para uso imediato pela IA no WhatsApp',
      parameters: {
        type: 'object',
        properties: {
          phone: { type: 'string', description: 'Número do telefone (apenas números ou chatId)' },
          name: { type: 'string', description: 'Nome do contato' },
          email: { type: 'string', description: 'E-mail opcional do contato' },
        },
        required: ['phone'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_whatsapp_chats',
      description: 'Lista as conversas reais do WhatsApp, incluindo não lidas e pendentes',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Quantidade máxima de conversas retornadas' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_whatsapp_messages',
      description: 'Busca as mensagens antigas e recentes de uma conversa específica do WhatsApp',
      parameters: {
        type: 'object',
        properties: {
          chatId: { type: 'string', description: 'ID completo do chat (ex: 5511999999999@c.us)' },
          phone: { type: 'string', description: 'Telefone do contato (alternativa ao chatId)' },
          limit: { type: 'number', description: 'Quantidade máxima de mensagens' },
          offset: { type: 'number', description: 'Paginação' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_whatsapp_backlog',
      description: 'Retorna quantas conversas e mensagens estão pendentes agora no WhatsApp',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_whatsapp_presence',
      description:
        'Envia um estado operacional no WhatsApp, como digitando, pausado ou visualizado',
      parameters: {
        type: 'object',
        properties: {
          chatId: { type: 'string', description: 'ID completo do chat' },
          phone: { type: 'string', description: 'Telefone do contato como alternativa ao chatId' },
          presence: {
            type: 'string',
            enum: ['typing', 'paused', 'seen'],
            description: 'Estado a ser enviado',
          },
        },
        required: ['presence'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'sync_whatsapp_history',
      description: 'Dispara a sincronização ativa do histórico e backlog do WhatsApp para a IA',
      parameters: {
        type: 'object',
        properties: {
          reason: { type: 'string', description: 'Motivo operacional da sincronização' },
        },
      },
    },
  },
  // === LEADS/CRM ===
  {
    type: 'function',
    function: {
      name: 'list_leads',
      description: 'Lista os leads/contatos recentes',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Quantidade máxima de leads' },
          status: {
            type: 'string',
            description: 'Filtrar por status (new, contacted, qualified, converted)',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_lead_details',
      description: 'Retorna detalhes de um lead específico',
      parameters: {
        type: 'object',
        properties: {
          phone: { type: 'string', description: 'Telefone do lead' },
          leadId: { type: 'string', description: 'ID do lead (alternativa ao phone)' },
        },
      },
    },
  },
  // === CONFIGURAÇÕES ===
  {
    type: 'function',
    function: {
      name: 'save_business_info',
      description: 'Salva informações do negócio',
      parameters: {
        type: 'object',
        properties: {
          businessName: { type: 'string', description: 'Nome do negócio' },
          description: { type: 'string', description: 'Descrição do negócio' },
          segment: { type: 'string', description: 'Segmento (ecommerce, serviços, etc)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_business_hours',
      description: 'Define o horário de funcionamento',
      parameters: {
        type: 'object',
        properties: {
          weekdayStart: { type: 'string', description: 'Horário início dias úteis (ex: 09:00)' },
          weekdayEnd: { type: 'string', description: 'Horário fim dias úteis (ex: 18:00)' },
          saturdayStart: { type: 'string', description: 'Horário início sábado' },
          saturdayEnd: { type: 'string', description: 'Horário fim sábado' },
          workOnSunday: { type: 'boolean', description: 'Funciona aos domingos?' },
        },
      },
    },
  },
  // === CAMPANHAS ===
  {
    type: 'function',
    function: {
      name: 'create_campaign',
      description: 'Cria uma campanha de mensagens em massa',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Nome da campanha' },
          message: { type: 'string', description: 'Mensagem da campanha' },
          targetAudience: {
            type: 'string',
            description: 'Público-alvo (ex: todos, leads_quentes)',
          },
        },
        required: ['name', 'message'],
      },
    },
  },
];

/** Tool definitions available in the KLOEL dashboard chat. */
export const KLOEL_CHAT_TOOLS: ChatCompletionTool[] = [
  ...KLOEL_CHAT_TOOLS_CORE,
  ...KLOEL_CHAT_TOOLS_MEDIA_BILLING,
];
