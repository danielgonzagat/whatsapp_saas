import { ChatCompletionTool } from 'openai/resources/chat';

export const KLOEL_CHAT_TOOLS_SETTINGS_CAMPAIGNS: ChatCompletionTool[] = [
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
