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
  {
    type: 'function',
    function: {
      name: 'create_agent_job',
      description:
        'Agenda um job autônomo governado do Kloel para lembrar, auditar ou revisar algo no tempo',
      parameters: {
        type: 'object',
        properties: {
          jobId: { type: 'string', description: 'Identificador estável opcional do job' },
          title: { type: 'string', description: 'Título curto do job' },
          prompt: { type: 'string', description: 'Tarefa operacional que o Kloel deve executar' },
          everyMinutes: { type: 'number', description: 'Intervalo em minutos para recorrência' },
          runAt: { type: 'string', description: 'Data ISO para execução única' },
          toolScope: {
            type: 'array',
            items: { type: 'string' },
            description: 'Ferramentas permitidas para o job',
          },
        },
        required: ['title', 'prompt'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_agent_jobs',
      description: 'Lista jobs autônomos governados registrados na memória operacional do Kloel',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_agent_job_enabled',
      description: 'Pausa ou reativa um job autônomo governado do Kloel sem apagar seu histórico',
      parameters: {
        type: 'object',
        properties: {
          jobId: { type: 'string', description: 'ID ou chave do job autônomo' },
          enabled: { type: 'boolean', description: 'true para ativar, false para pausar' },
        },
        required: ['jobId', 'enabled'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_agent_memory',
      description:
        'Busca memórias episódicas, operacionais e procedurais persistidas pelo runtime do Kloel',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Consulta textual sobre memória passada' },
          limit: { type: 'number', description: 'Quantidade máxima de memórias retornadas' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_agent_sessions',
      description:
        'Busca conversas e sessões passadas do Kloel agrupadas por thread, sessão ou contato, com janela focada no assunto pesquisado',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Assunto para recall de sessão/conversa passada' },
          limit: { type: 'number', description: 'Quantidade máxima de sessões retornadas' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'upsert_agent_skill',
      description:
        'Registra ou atualiza uma skill procedural governada para o Kloel reutilizar em tarefas futuras',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Identificador da skill' },
          title: { type: 'string', description: 'Nome da skill' },
          summary: { type: 'string', description: 'Resumo do procedimento' },
          category: {
            type: 'string',
            enum: ['commercial', 'operational', 'pulse', 'workspace'],
          },
          riskLevel: { type: 'string', enum: ['safe', 'normal', 'high', 'critical'] },
          allowedTools: { type: 'array', items: { type: 'string' } },
          requiredEvidence: { type: 'array', items: { type: 'string' } },
          validation: { type: 'array', items: { type: 'string' } },
          rollback: { type: 'array', items: { type: 'string' } },
          metrics: { type: 'array', items: { type: 'string' } },
          body: { type: 'string', description: 'Passos do procedimento' },
        },
        required: ['id', 'title', 'summary'],
      },
    },
  },
];
