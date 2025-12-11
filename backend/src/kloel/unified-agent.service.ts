import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { ChatCompletionMessageParam, ChatCompletionTool } from 'openai/resources/chat';
import { flowQueue } from '../queue/queue';
import { AsaasService } from './asaas.service';
import { AudioService } from './audio.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { chatCompletionWithFallback, callOpenAIWithRetry } from './openai-wrapper';

/**
 * KLOEL Unified Agent Service
 * 
 * Este serviço unifica IA (KLOEL) e Autopilot em um único agente inteligente
 * que usa tool calling para tomar decisões e executar ações de forma autônoma.
 * 
 * Filosofia: "Um único cérebro, múltiplas habilidades"
 */
@Injectable()
export class UnifiedAgentService {
  private readonly logger = new Logger(UnifiedAgentService.name);
  private openai: OpenAI | null;

  // Definição de todas as ferramentas disponíveis para o agente
  private readonly tools: ChatCompletionTool[] = [
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
          properties: {
            tag: { type: 'string' },
          },
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
        description: 'Envia documento ou catálogo (PDF/arquivo) para o cliente. Pode buscar pelo nome do documento cadastrado ou usar URL direta.',
        parameters: {
          type: 'object',
          properties: {
            documentName: { type: 'string', description: 'Nome do documento cadastrado no sistema (ex: "catálogo", "tabela preços")' },
            url: { type: 'string', description: 'URL direta do documento (usado se documentName não for informado)' },
            caption: { type: 'string', description: 'Mensagem opcional que acompanha o documento' },
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
            voice: { type: 'string', enum: ['nova', 'alloy', 'echo', 'fable', 'onyx', 'shimmer'] },
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
            voice: { type: 'string', description: 'Voz/TTS a utilizar', enum: ['nova', 'alloy', 'echo', 'fable', 'onyx', 'shimmer'] },
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
            language: { type: 'string', description: 'Idioma do áudio (pt, en, es, etc)', default: 'pt' },
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
          properties: {
            query: { type: 'string' },
          },
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
              description: 'Tipo de gatilho' 
            },
            triggerValue: { type: 'string', description: 'Valor do gatilho (palavra-chave, tag, etc)' },
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
              description: 'Tags dos contatos que receberão' 
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
            period: { 
              type: 'string', 
              enum: ['today', 'week', 'month', 'year'],
            },
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
              description: 'Modo: full (100% automático), copilot (sugere respostas), off (desligado)' 
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
              description: 'Objetivo principal do fluxo' 
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
        description: 'Inicia conexão do WhatsApp e retorna QR Code',
        parameters: {
          type: 'object',
          properties: {
            provider: { 
              type: 'string', 
              enum: ['wpp', 'meta', 'evolution'],
              description: 'Provedor do WhatsApp' 
            },
          },
          required: ['provider'],
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
              description: 'Fonte dos contatos' 
            },
            csvData: { type: 'string', description: 'Dados CSV se fonte for csv' },
            addTags: { 
              type: 'array', 
              items: { type: 'string' },
              description: 'Tags a adicionar nos contatos importados' 
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
                enum: ['awareness', 'interest', 'consideration', 'intent', 'purchase', 'retention']
              },
              description: 'Etapas do funil a criar'
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
        description: 'Gera um link seguro para o usuário cadastrar ou atualizar seu cartão de crédito',
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
            plan: { type: 'string', enum: ['starter', 'pro', 'enterprise'], description: 'Novo plano' },
          },
          required: ['plan'],
        },
      },
    },
  ];

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private asaasService: AsaasService,
    private audioService: AudioService,
    private whatsappService: WhatsappService,
  ) {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    this.openai = apiKey ? new OpenAI({ apiKey }) : null;
  }

  /**
   * Processa uma mensagem recebida e decide as ações a tomar
   */
  async processMessage(params: {
    workspaceId: string;
    contactId: string;
    phone: string;
    message: string;
    context?: Record<string, any>;
  }): Promise<{
    actions: Array<{ tool: string; args: any; result?: any }>;
    response?: string;
    intent: string;
    confidence: number;
  }> {
    const { workspaceId, contactId, phone, message, context } = params;

    if (!this.openai) {
      this.logger.warn('OpenAI not configured');
      return {
        actions: [],
        response: undefined,
        intent: 'UNKNOWN',
        confidence: 0,
      };
    }

    // 1. Carregar contexto do workspace e contato
    const [workspace, contact, conversationHistory, products] = await Promise.all([
      this.getWorkspaceContext(workspaceId),
      this.getContactContext(workspaceId, contactId, phone),
      this.getConversationHistory(workspaceId, contactId, 10),
      this.getProducts(workspaceId),
    ]);

    // 2. Construir o prompt do sistema
    const systemPrompt = this.buildSystemPrompt(workspace, products);

    // Extrair tags e dados do contato
    const contactData = contact as any;
    const tagNames = contactData.tags?.map?.((t: any) => t.name || t).join(', ') || 'nenhuma';

    // 3. Construir mensagens
    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory,
      {
        role: 'user',
        content: `[Contato: ${contactData.name || phone}]
[Sentiment: ${contactData.sentiment || 'NEUTRAL'}]
[Lead Score: ${contactData.leadScore || 0}]
[Tags: ${tagNames}]
${context ? `[Contexto adicional: ${JSON.stringify(context)}]` : ''}

Mensagem: ${message}`,
      },
    ];

    // 4. Chamar OpenAI com tools (com retry e fallback)
    const response = await callOpenAIWithRetry(
      () => this.openai!.chat.completions.create({
        model: 'gpt-4o',
        messages,
        tools: this.tools,
        tool_choice: 'auto',
        temperature: 0.7,
      }),
    );

    const assistantMessage = response.choices[0].message;
    const actions: Array<{ tool: string; args: any; result?: any }> = [];

    // 5. Processar tool calls
    if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      for (const toolCall of assistantMessage.tool_calls) {
        const tc = toolCall as any;
        const toolName = tc.function?.name;
        let toolArgs = {};
        
        try {
          toolArgs = JSON.parse(tc.function?.arguments || '{}');
        } catch {
          this.logger.warn(`Failed to parse tool args for ${toolName}`);
        }

        // Executar a ação
        const result = await this.executeToolAction(
          workspaceId,
          contactId,
          phone,
          toolName,
          toolArgs,
        );

        actions.push({
          tool: toolName,
          args: toolArgs,
          result,
        });

        // Registrar evento
        await this.logAutopilotEvent(workspaceId, contactId, toolName, toolArgs, result);
      }
    }

    // 6. Extrair intent e confidence
    const intent = this.extractIntent(actions, message);
    const confidence = this.calculateConfidence(actions, response);

    return {
      actions,
      response: assistantMessage.content || undefined,
      intent,
      confidence,
    };
  }

  /**
   * Executa uma ação de tool
   */
  async executeTool(
    tool: string,
    args: any,
    ctx: { workspaceId: string; contactId?: string; phone?: string },
  ): Promise<any> {
    return this.executeToolAction(
      ctx.workspaceId,
      ctx.contactId || '',
      ctx.phone || '',
      tool,
      args,
    );
  }

  private async executeToolAction(
    workspaceId: string,
    contactId: string,
    phone: string,
    tool: string,
    args: any,
  ): Promise<any> {
    this.logger.log(`Executing tool: ${tool}`, { args });

    switch (tool) {
      case 'send_message':
        return this.actionSendMessage(workspaceId, phone, args);
      
      case 'send_product_info':
        return this.actionSendProductInfo(workspaceId, phone, args);
      
      case 'create_payment_link':
        return this.actionCreatePaymentLink(workspaceId, phone, args);
      
      case 'update_lead_status':
        return this.actionUpdateLeadStatus(workspaceId, contactId, args);
      
      case 'add_tag':
        return this.actionAddTag(workspaceId, contactId, args);
      
      case 'schedule_followup':
        return this.actionScheduleFollowup(workspaceId, contactId, phone, args);
      
      case 'transfer_to_human':
        return this.actionTransferToHuman(workspaceId, contactId, args);
      
      case 'search_knowledge_base':
        return this.actionSearchKnowledgeBase(workspaceId, args);
      
      case 'trigger_flow':
        return this.actionTriggerFlow(workspaceId, phone, args);
      
      case 'log_event':
        return this.actionLogEvent(workspaceId, contactId, args);
      
      // === COMMUNICATION: MEDIA & VOICE ===
      case 'send_media':
        return this.actionSendMedia(workspaceId, phone, args);

      case 'send_document':
        return this.actionSendDocument(workspaceId, phone, args);
      
      case 'send_voice_note':
        return this.actionSendVoiceNote(workspaceId, phone, args);

      case 'send_audio':
        return this.actionSendAudio(workspaceId, phone, args);

      case 'transcribe_audio':
        return this.actionTranscribeAudio(workspaceId, args);
      
      // === KIA LAYER: GERENCIAMENTO AUTÔNOMO ===
      case 'create_product':
        return this.actionCreateProduct(workspaceId, args);
      
      case 'update_product':
        return this.actionUpdateProduct(workspaceId, args);
      
      case 'create_flow':
        return this.actionCreateFlow(workspaceId, args);
      
      case 'update_workspace_settings':
        return this.actionUpdateWorkspaceSettings(workspaceId, args);
      
      case 'create_broadcast':
        return this.actionCreateBroadcast(workspaceId, args);
      
      case 'get_analytics':
        return this.actionGetAnalytics(workspaceId, args);
      
      case 'configure_ai_persona':
        return this.actionConfigureAIPersona(workspaceId, args);
      
      // === KIA LAYER: AUTOPILOT CONTROL ===
      case 'toggle_autopilot':
        return this.actionToggleAutopilot(workspaceId, args);
      
      case 'create_flow_from_description':
        return this.actionCreateFlowFromDescription(workspaceId, args);
      
      case 'connect_whatsapp':
        return this.actionConnectWhatsApp(workspaceId, args);
      
      case 'import_contacts':
        return this.actionImportContacts(workspaceId, args);
      
      case 'generate_sales_funnel':
        return this.actionGenerateSalesFunnel(workspaceId, args);
      
      case 'schedule_campaign':
        return this.actionScheduleCampaign(workspaceId, args);
      
      case 'get_workspace_status':
        return this.actionGetWorkspaceStatus(workspaceId, args);

      // === BILLING ===
      case 'update_billing_info':
        return this.actionUpdateBillingInfo(workspaceId, args);
      
      case 'get_billing_status':
        return this.actionGetBillingStatus(workspaceId);
      
      case 'change_plan':
        return this.actionChangePlan(workspaceId, args);

      // === VENDAS E NEGOCIAÇÃO ===
      case 'apply_discount':
        return this.actionApplyDiscount(workspaceId, contactId, phone, args);

      case 'handle_objection':
        return this.actionHandleObjection(workspaceId, contactId, phone, args);

      case 'qualify_lead':
        return this.actionQualifyLead(workspaceId, contactId, phone, args);

      case 'schedule_meeting':
        return this.actionScheduleMeeting(workspaceId, contactId, phone, args);

      case 'anti_churn_action':
        return this.actionAntiChurn(workspaceId, contactId, phone, args);

      case 'reactivate_ghost':
        return this.actionReactivateGhost(workspaceId, contactId, phone, args);
      
      default:
        this.logger.warn(`Unknown tool: ${tool}`);
        return { success: false, error: 'Unknown tool' };
    }
  }

  // ===== ACTION IMPLEMENTATIONS =====

  private async actionSendMessage(workspaceId: string, phone: string, args: any) {
    try {
      if (!args.message) {
        return { success: false, error: 'Mensagem é obrigatória' };
      }

      // 🚀 ENVIAR MENSAGEM DIRETAMENTE VIA WHATSAPP SERVICE
      this.logger.log(`📤 [AGENT] Enviando mensagem para ${phone}: "${args.message?.substring(0, 50)}..."`);
      
      const result = await this.whatsappService.sendMessage(
        workspaceId,
        phone,
        args.message,
      );

      if (result.error) {
        this.logger.error(`❌ [AGENT] Erro ao enviar: ${result.message}`);
        return { success: false, error: result.message };
      }

      this.logger.log(`✅ [AGENT] Mensagem enviada com sucesso para ${phone}`);
      return { success: true, message: args.message, sent: true };
    } catch (error: any) {
      this.logger.error(`Erro ao enviar mensagem: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  private async actionSendProductInfo(workspaceId: string, phone: string, args: any) {
    // Buscar produto primeiro em KloelMemory (categoria 'products' do onboarding)
    // e depois na tabela Product
    let product = await this.prisma.kloelMemory.findFirst({
      where: {
        workspaceId,
        category: 'products', // Corrigido: usar 'category' ao invés de 'type'
        OR: [
          { key: { contains: args.productName.toLowerCase() } },
          { value: { path: ['name'], string_contains: args.productName } },
        ],
      },
    });

    // Se não encontrou em memória, buscar na tabela Product
    if (!product) {
      const dbProduct = await this.prisma.product.findFirst({
        where: {
          workspaceId,
          name: { contains: args.productName, mode: 'insensitive' },
          active: true,
        },
      });

      if (dbProduct) {
        const message = `${dbProduct.name}: ${dbProduct.description || ''} - R$ ${dbProduct.price}`;
        
        // Enviar informação do produto via WhatsApp
        if (args.includeLink) {
          await this.actionSendMessage(workspaceId, phone, { message });
        }
        
        return {
          success: true,
          product: dbProduct,
          message,
        };
      }
      
      return { success: false, error: 'Produto não encontrado' };
    }

    const productData = product.value as any;
    const message = `${productData.name}: ${productData.description || ''} - R$ ${productData.price || 'A consultar'}`;
    
    // Enviar informação do produto via WhatsApp se solicitado
    if (args.includeLink) {
      await this.actionSendMessage(workspaceId, phone, { message });
    }
    
    return {
      success: true,
      product: productData,
      message,
    };
  }

  private async actionCreatePaymentLink(workspaceId: string, phone: string, args: any) {
    try {
      // Verificar se Asaas está configurado para o workspace
      const status = await this.asaasService.getConnectionStatus(workspaceId);
      
      if (status.connected) {
        // Buscar ou criar cliente no Asaas
        const contact = await this.prisma.contact.findFirst({
          where: { workspaceId, phone },
        });

        // Criar pagamento PIX via Asaas
        const payment = await this.asaasService.createPixPayment(workspaceId, {
          customerName: contact?.name || 'Cliente',
          customerPhone: phone,
          customerEmail: contact?.email || undefined,
          amount: args.amount,
          description: args.description || `Pagamento - ${args.productName}`,
        });

        this.logger.log(`💰 [AGENT] Link de pagamento criado: ${payment.pixQrCodeUrl}`);

        // Enviar link via WhatsApp
        const paymentMessage = `💰 Seu pagamento de R$ ${args.amount.toFixed(2)} está pronto!\n\n📱 Use o QR Code ou copie o código PIX:\n\n${payment.pixCopyPaste}`;
        await this.actionSendMessage(workspaceId, phone, { message: paymentMessage });

        return {
          success: true,
          paymentId: payment.id,
          paymentLink: payment.pixQrCodeUrl,
          pixCopyPaste: payment.pixCopyPaste,
          amount: args.amount,
          sent: true,
        };
      }
      
      // Fallback: gerar link interno
      const paymentId = `pay_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      const paymentLink = `${this.config.get('FRONTEND_URL') || 'https://kloel.com'}/pay/${paymentId}`;
      
      // Salvar venda pendente
      const prismaAny = this.prisma as any;
      await prismaAny.kloelSale.create({
        data: {
          workspaceId,
          paymentId,
          customerPhone: phone,
          productName: args.productName,
          amount: args.amount,
          status: 'pending',
          method: 'INTERNAL',
        },
      }).catch(() => {
        // Tabela pode não existir ainda
        this.logger.warn('kloelSale table not available');
      });

      const message = `💳 Link de pagamento: ${paymentLink}\n\nValor: R$ ${args.amount.toFixed(2)}`;
      await this.actionSendMessage(workspaceId, phone, { message });

      return {
        success: true,
        paymentId,
        paymentLink,
        amount: args.amount,
        method: 'internal',
      };
    } catch (error: any) {
      this.logger.error(`Erro ao criar link de pagamento: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  private async actionUpdateLeadStatus(workspaceId: string, contactId: string, args: any) {
    if (!contactId) return { success: false, error: 'No contact ID' };

    // Use nextBestAction para armazenar status e aiSummary para intent
    await this.prisma.contact.update({
      where: { id: contactId },
      data: {
        nextBestAction: args.status || args.intent,
        aiSummary: args.intent ? `Intent: ${args.intent}` : undefined,
        updatedAt: new Date(),
      },
    });

    return { success: true, status: args.status };
  }

  private async actionAddTag(workspaceId: string, contactId: string, args: any) {
    if (!contactId) return { success: false, error: 'No contact ID' };

    // Encontrar ou criar a tag
    let tag = await this.prisma.tag.findFirst({
      where: { workspaceId, name: args.tag },
    });

    if (!tag) {
      tag = await this.prisma.tag.create({
        data: {
          name: args.tag,
          workspaceId,
          color: '#3B82F6', // default blue
        },
      });
    }

    // Conectar tag ao contato
    await this.prisma.contact.update({
      where: { id: contactId },
      data: {
        tags: {
          connect: { id: tag.id },
        },
      },
    });

    return { success: true, tag: args.tag };
  }

  private async actionScheduleFollowup(
    workspaceId: string,
    contactId: string,
    phone: string,
    args: any,
  ) {
    try {
      const delayMs = (args.delayHours || 24) * 60 * 60 * 1000;
      const scheduledFor = new Date(Date.now() + delayMs);
      
      // Enfileirar job de follow-up com delay
      await flowQueue.add(
        'scheduled-followup',
        {
          type: 'followup',
          workspaceId,
          contactId,
          phone,
          message: args.message,
          scheduledFor: scheduledFor.toISOString(),
        },
        {
          delay: delayMs,
          jobId: `followup_${workspaceId}_${contactId}_${Date.now()}`,
        }
      );

      this.logger.log(`📅 [AGENT] Follow-up agendado para ${phone} em ${args.delayHours}h`);
      
      // Salvar registro do follow-up agendado
      const prismaAny = this.prisma as any;
      await prismaAny.autopilotEvent?.create({
        data: {
          workspaceId,
          contactId,
          intent: 'FOLLOWUP',
          action: 'SCHEDULE_FOLLOWUP',
          status: 'scheduled',
          reason: `Agendado para ${scheduledFor.toISOString()}`,
          responseText: args.message,
          metadata: { scheduledFor: scheduledFor.toISOString(), delayHours: args.delayHours },
        },
      }).catch(() => {
        // Tabela pode não existir
      });
      
      return {
        success: true,
        scheduledFor: scheduledFor.toISOString(),
        message: args.message,
        jobId: `followup_${workspaceId}_${contactId}_${Date.now()}`,
      };
    } catch (error: any) {
      this.logger.error(`Erro ao agendar follow-up: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  private async actionTransferToHuman(workspaceId: string, contactId: string, args: any) {
    // Marcar conversa como pendente de atendimento humano
    if (contactId) {
      await this.prisma.contact.update({
        where: { id: contactId },
        data: {
          nextBestAction: 'HUMAN_NEEDED',
          aiSummary: `Transfer reason: ${args.reason || 'Not specified'}`,
          updatedAt: new Date(),
        },
      });
    }

    return {
      success: true,
      reason: args.reason,
      priority: args.priority || 'normal',
    };
  }

  private async actionSearchKnowledgeBase(workspaceId: string, args: any) {
    const results = await this.prisma.kloelMemory.findMany({
      where: {
        workspaceId,
        OR: [
          { key: { contains: args.query.toLowerCase() } },
          { value: { path: ['$'], string_contains: args.query.toLowerCase() } },
        ],
      },
      take: 5,
    });

    return {
      success: true,
      results: results.map((r) => ({ key: r.key, value: r.value })),
    };
  }

  private async actionTriggerFlow(workspaceId: string, phone: string, args: any) {
    try {
      const flowId = args.flowId || args.flowName;
      
      // Buscar fluxo pelo ID ou nome
      let flow = flowId 
        ? await this.prisma.flow.findUnique({ where: { id: flowId } })
        : null;
        
      if (!flow && args.flowName) {
        flow = await this.prisma.flow.findFirst({
          where: { 
            workspaceId, 
            name: { contains: args.flowName, mode: 'insensitive' },
            isActive: true,
          },
        });
      }
      
      if (!flow) {
        return { success: false, error: 'Fluxo não encontrado' };
      }

      // Enfileirar execução do fluxo
      await flowQueue.add('run-flow', {
        workspaceId,
        flowId: flow.id,
        user: phone,
        initialVars: args.variables || {},
        triggeredBy: 'kloel-agent',
      });

      this.logger.log(`🚀 [AGENT] Fluxo "${flow.name}" disparado para ${phone}`);

      return {
        success: true,
        flowId: flow.id,
        flowName: flow.name,
        triggered: true,
      };
    } catch (error: any) {
      this.logger.error(`Erro ao disparar fluxo: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Envia mídia (imagem, vídeo, documento) via WhatsApp
   */
  private async actionSendMedia(workspaceId: string, phone: string, args: any) {
    try {
      const { type, url, caption } = args;

      if (!url) {
        return { success: false, error: 'URL da mídia é obrigatória' };
      }

      // 🚀 ENVIAR MÍDIA DIRETAMENTE VIA WHATSAPP SERVICE
      this.logger.log(`📎 [AGENT] Enviando mídia para ${phone}: ${type} - ${url.substring(0, 50)}...`);

      const result = await this.whatsappService.sendMessage(
        workspaceId,
        phone,
        caption || '',
        {
          mediaUrl: url,
          mediaType: type || 'image',
          caption: caption || '',
        }
      );

      if (result.error) {
        this.logger.error(`❌ [AGENT] Erro ao enviar mídia: ${result.message}`);
        return { success: false, error: result.message };
      }

      this.logger.log(`✅ [AGENT] Mídia enviada com sucesso para ${phone}`);

      return {
        success: true,
        type,
        url,
        caption,
        sent: true,
      };
    } catch (error: any) {
      this.logger.error(`Erro ao enviar mídia: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Envia documento (PDF/arquivo) via WhatsApp
   * Pode buscar pelo nome do documento no banco ou usar URL direta
   */
  private async actionSendDocument(workspaceId: string, phone: string, args: any) {
    try {
      const { documentName, url, caption } = args;

      let documentUrl = url;
      let documentCaption = caption;
      let documentFileName: string | undefined;

      // Se documentName foi informado, busca no banco de dados
      if (documentName) {
        this.logger.log(`📄 [AGENT] Buscando documento "${documentName}" no workspace ${workspaceId}`);
        
        const document = await (this.prisma as any).document?.findFirst({
          where: {
            workspaceId,
            name: { contains: documentName, mode: 'insensitive' },
            isActive: true,
          },
        });

        if (document) {
          // Montar URL do arquivo local (assumindo servidor de arquivos)
          const baseUrl = this.config.get('APP_URL', 'http://localhost:3001');
          documentUrl = `${baseUrl}/uploads/${document.filePath}`;
          documentFileName = document.fileName;
          
          // Usar descrição do documento se caption não foi fornecido
          if (!documentCaption && document.description) {
            documentCaption = document.description;
          }
          
          this.logger.log(`✅ [AGENT] Documento encontrado: ${document.name} (${document.mimeType})`);
        } else {
          this.logger.warn(`⚠️ [AGENT] Documento "${documentName}" não encontrado no workspace`);
          return { 
            success: false, 
            error: `Documento "${documentName}" não encontrado. Certifique-se de que o documento foi cadastrado.` 
          };
        }
      }

      if (!documentUrl) {
        return { success: false, error: 'URL ou nome do documento é obrigatório' };
      }

      this.logger.log(`📄 [AGENT] Enviando documento para ${phone}: ${documentUrl.substring(0, 80)}...`);

      const result = await this.whatsappService.sendMessage(
        workspaceId,
        phone,
        documentCaption || '',
        {
          mediaUrl: documentUrl,
          mediaType: 'document',
          caption: documentCaption || '',
        },
      );

      if (result.error) {
        this.logger.error(`❌ [AGENT] Erro ao enviar documento: ${result.message}`);
        return { success: false, error: result.message };
      }

      this.logger.log(`✅ [AGENT] Documento enviado para ${phone}`);

      return {
        success: true,
        documentName: documentName || 'URL direta',
        url: documentUrl,
        caption: documentCaption,
        sent: true,
      };
    } catch (error: any) {
      this.logger.error(`Erro ao enviar documento: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Gera e envia nota de voz usando TTS (Text-to-Speech)
   */
  private async actionSendVoiceNote(workspaceId: string, phone: string, args: any) {
    try {
      const { text, voice = 'nova' } = args;

      if (!text) {
        return { success: false, error: 'Texto é obrigatório para gerar áudio' };
      }

      // Verificar se AudioService está disponível
      if (!this.audioService) {
        return { success: false, error: 'Serviço de áudio não disponível' };
      }

      // Gerar áudio usando TTS
      this.logger.log(`🎤 [AGENT] Gerando áudio TTS para ${phone}: "${text.substring(0, 50)}..."`);
      
      const audioBuffer = await this.audioService.textToSpeech(text, voice);

      // Converter para base64 data URL
      const base64Audio = audioBuffer.toString('base64');
      const audioDataUrl = `data:audio/mp3;base64,${base64Audio}`;

      // 🚀 ENVIAR ÁUDIO DIRETAMENTE VIA WHATSAPP SERVICE
      this.logger.log(`🔊 [AGENT] Enviando nota de voz para ${phone}...`);

      const result = await this.whatsappService.sendMessage(
        workspaceId,
        phone,
        '', // Mensagem vazia, pois é áudio
        {
          mediaUrl: audioDataUrl,
          mediaType: 'audio',
        }
      );

      if (result.error) {
        this.logger.error(`❌ [AGENT] Erro ao enviar áudio: ${result.message}`);
        return { success: false, error: result.message };
      }

      this.logger.log(`✅ [AGENT] Nota de voz enviada com sucesso para ${phone}`);

      return {
        success: true,
        text,
        voice,
        sent: true,
        audioSize: audioBuffer.length,
      };
    } catch (error: any) {
      this.logger.error(`Erro ao enviar nota de voz: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Gera áudio a partir de texto e envia como mídia de áudio
   */
  private async actionSendAudio(workspaceId: string, phone: string, args: any) {
    try {
      const { text, voice = 'nova' } = args;

      if (!text) {
        return { success: false, error: 'Texto é obrigatório para gerar áudio' };
      }

      if (!this.audioService) {
        return { success: false, error: 'Serviço de áudio não disponível' };
      }

      this.logger.log(`🎧 [AGENT] Gerando áudio para ${phone}: "${text.substring(0, 80)}..."`);

      const audioBuffer = await this.audioService.textToSpeech(text, voice);
      const base64Audio = audioBuffer.toString('base64');
      const audioDataUrl = `data:audio/mp3;base64,${base64Audio}`;

      const result = await this.whatsappService.sendMessage(
        workspaceId,
        phone,
        '',
        {
          mediaUrl: audioDataUrl,
          mediaType: 'audio',
        },
      );

      if (result.error) {
        this.logger.error(`❌ [AGENT] Erro ao enviar áudio: ${result.message}`);
        return { success: false, error: result.message };
      }

      this.logger.log(`✅ [AGENT] Áudio enviado para ${phone}`);

      return {
        success: true,
        text,
        voice,
        sent: true,
        audioSize: audioBuffer.length,
      };
    } catch (error: any) {
      this.logger.error(`Erro ao enviar áudio: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Transcreve áudio usando Whisper (OpenAI)
   * Aceita URL ou base64
   */
  private async actionTranscribeAudio(workspaceId: string, args: any) {
    try {
      const { audioUrl, audioBase64, language = 'pt' } = args;

      if (!this.audioService) {
        return { success: false, error: 'Serviço de áudio não disponível' };
      }

      if (!audioUrl && !audioBase64) {
        return { success: false, error: 'É necessário fornecer audioUrl ou audioBase64' };
      }

      this.logger.log(`🎤 [AGENT] Transcrevendo áudio para workspace ${workspaceId}...`);

      let result;
      if (audioUrl) {
        result = await this.audioService.transcribeFromUrl(audioUrl, language);
      } else if (audioBase64) {
        result = await this.audioService.transcribeFromBase64(audioBase64, language);
      }

      if (!result?.text) {
        return { success: false, error: 'Transcrição falhou ou retornou vazia' };
      }

      this.logger.log(`✅ [AGENT] Transcrição concluída: "${result.text.substring(0, 100)}..."`);

      return {
        success: true,
        text: result.text,
        duration: result.duration,
        language: result.language,
      };
    } catch (error: any) {
      this.logger.error(`Erro ao transcrever áudio: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  private async actionLogEvent(workspaceId: string, contactId: string, args: any) {
    await this.prisma.autopilotEvent.create({
      data: {
        workspaceId,
        contactId,
        intent: args.event,
        action: 'LOG_EVENT',
        status: 'completed',
        meta: args.properties,
      },
    });

    return { success: true, event: args.event };
  }

  // ===== HELPER METHODS =====

  private buildSystemPrompt(workspace: any, products: any[]): string {
    const productList = products.length > 0
      ? products.map((p) => `- ${(p.value as any).name}: R$ ${(p.value as any).price}`).join('\n')
      : 'Nenhum produto cadastrado';

    return `Você é a KLOEL, uma IA de vendas e atendimento autônoma para WhatsApp.

EMPRESA: ${workspace.name || 'Cliente KLOEL'}
TOM: ${workspace.brandVoice || 'Profissional, amigável e focado em resultados'}

PRODUTOS:
${productList}

DIRETRIZES:
1. Foque em VENDER e CONVERTER
2. Use as ferramentas disponíveis para executar ações
3. Seja proativo - não espere o cliente pedir
4. Personalize baseado no histórico e status do lead
5. Se detectar objeção, trate imediatamente
6. Se cliente sumiu, use reativação
7. Sempre atualize o status do lead
8. Agende follow-ups para não perder oportunidades

REGRAS:
- Nunca diga que é uma IA a menos que perguntado diretamente
- Responda de forma natural e humana
- Use emojis moderadamente
- Seja breve em mensagens WhatsApp (max 200 palavras)`;
  }

  private async getWorkspaceContext(workspaceId: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        name: true,
        providerSettings: true,
      },
    });

    const brandVoice = await this.prisma.kloelMemory.findFirst({
      where: { workspaceId, key: 'brandVoice' },
    });

    return {
      ...workspace,
      brandVoice: (brandVoice?.value as any)?.style,
    };
  }

  private async getContactContext(workspaceId: string, contactId: string, phone: string) {
    if (contactId) {
      const contact = await this.prisma.contact.findUnique({
        where: { id: contactId },
        select: {
          name: true,
          phone: true,
          sentiment: true,
          leadScore: true,
          nextBestAction: true,
          tags: { select: { name: true } },
        },
      });
      if (contact) return contact;
    }

    // Buscar por telefone
    const contact = await this.prisma.contact.findFirst({
      where: { workspaceId, phone },
      select: {
        name: true,
        phone: true,
        sentiment: true,
        leadScore: true,
        nextBestAction: true,
        tags: { select: { name: true } },
      },
    });

    return contact || { phone, name: null, sentiment: 'NEUTRAL', leadScore: 0, tags: [] };
  }

  private async getConversationHistory(
    workspaceId: string,
    contactId: string,
    limit: number,
  ): Promise<ChatCompletionMessageParam[]> {
    if (!contactId) return [];

    const messages = await this.prisma.message.findMany({
      where: { workspaceId, contactId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        content: true,
        direction: true,
      },
    });

    return messages.reverse().map((m) => ({
      role: m.direction === 'INBOUND' ? 'user' : 'assistant',
      content: m.content || '',
    })) as ChatCompletionMessageParam[];
  }

  private async getProducts(workspaceId: string) {
    // Buscar produtos tanto em KloelMemory (onboarding) quanto na tabela Product
    const memoryProducts = await this.prisma.kloelMemory.findMany({
      where: { 
        workspaceId, 
        OR: [
          { type: 'product' },
          { category: 'products' },
        ],
      },
      take: 20,
    });

    // Também buscar produtos oficiais da tabela Product
    const dbProducts = await this.prisma.product.findMany({
      where: { workspaceId, active: true },
      take: 20,
    });

    // Combinar ambas as fontes (Product tem prioridade)
    const combined = [
      ...dbProducts.map(p => ({
        id: p.id,
        value: { name: p.name, price: p.price, description: p.description },
      })),
      ...memoryProducts.filter(m => !dbProducts.some(d => 
        (m.value as any)?.name?.toLowerCase() === d.name.toLowerCase()
      )),
    ];

    return combined;
  }

  private extractIntent(actions: Array<{ tool: string; args: any }>, message: string): string {
    if (actions.length === 0) return 'IDLE';

    const toolIntentMap: Record<string, string> = {
      create_payment_link: 'BUYING',
      send_product_info: 'INTERESTED',
      apply_discount: 'NEGOTIATING',
      handle_objection: 'OBJECTION',
      schedule_meeting: 'SCHEDULING',
      transfer_to_human: 'SUPPORT',
      anti_churn_action: 'CHURN_RISK',
      reactivate_ghost: 'REACTIVATION',
      qualify_lead: 'QUALIFICATION',
    };

    for (const action of actions) {
      if (toolIntentMap[action.tool]) {
        return toolIntentMap[action.tool];
      }
    }

    return 'FOLLOW_UP';
  }

  private calculateConfidence(
    actions: Array<{ tool: string; args: any }>,
    response: OpenAI.Chat.Completions.ChatCompletion,
  ): number {
    // Base confidence
    let confidence = 0.5;

    // Mais ações = mais confiança
    confidence += Math.min(actions.length * 0.1, 0.3);

    // Se usou tool_calls, mais confiança
    if (response.choices[0].message.tool_calls?.length) {
      confidence += 0.15;
    }

    return Math.min(confidence, 1);
  }

  private async logAutopilotEvent(
    workspaceId: string,
    contactId: string,
    action: string,
    args: any,
    result: any,
  ) {
    try {
      await this.prisma.autopilotEvent.create({
        data: {
          workspaceId,
          contactId,
          intent: 'TOOL_CALL',
          action,
          status: result?.success ? 'completed' : 'failed',
          meta: { args, result },
        },
      });
    } catch (err) {
      this.logger.warn('Failed to log autopilot event', err);
    }
  }

  // ===== KIA LAYER: GERENCIAMENTO AUTÔNOMO =====

  private async actionCreateProduct(workspaceId: string, args: any) {
    const productKey = `product_${Date.now()}_${args.name.toLowerCase().replace(/\s+/g, '_')}`;
    
    // Salvar em KloelMemory para contexto da IA
    await this.prisma.kloelMemory.create({
      data: {
        workspaceId,
        key: productKey,
        type: 'product',
        category: 'products', // Consistente com onboarding
        value: {
          name: args.name,
          price: args.price,
          description: args.description || '',
          category: args.category || 'default',
          imageUrl: args.imageUrl || null,
          paymentLink: args.paymentLink || null,
          active: true,
          createdAt: new Date().toISOString(),
        },
      },
    });

    // TAMBÉM persistir na tabela Product para catálogo oficial
    let dbProductId: string | null = null;
    try {
      const dbProduct = await this.prisma.product.create({
        data: {
          workspaceId,
          name: args.name,
          price: args.price || 0,
          description: args.description || '',
          category: args.category || 'default',
          imageUrl: args.imageUrl || null,
          active: true,
        },
      });
      dbProductId = dbProduct.id;
      this.logger.log(`✅ Produto "${args.name}" persistido na tabela Product (${dbProductId})`);
    } catch (err: any) {
      this.logger.warn(`Produto "${args.name}" salvo apenas em memória: ${err?.message}`);
    }

    this.logger.log(`Product created: ${args.name} - R$ ${args.price}`);
    
    return {
      success: true,
      productId: dbProductId || productKey,
      message: `Produto "${args.name}" criado com sucesso por R$ ${args.price}`,
    };
  }

  private async actionUpdateProduct(workspaceId: string, args: any) {
    const product = await this.prisma.kloelMemory.findFirst({
      where: { workspaceId, key: args.productId, type: 'product' },
    });

    if (!product) {
      return { success: false, error: 'Produto não encontrado' };
    }

    const currentValue = product.value as any;
    const updatedValue = {
      ...currentValue,
      ...(args.name && { name: args.name }),
      ...(args.price !== undefined && { price: args.price }),
      ...(args.description && { description: args.description }),
      ...(args.active !== undefined && { active: args.active }),
      updatedAt: new Date().toISOString(),
    };

    await this.prisma.kloelMemory.update({
      where: { id: product.id },
      data: { value: updatedValue },
    });

    return {
      success: true,
      message: `Produto atualizado com sucesso`,
    };
  }

  private async actionCreateFlow(workspaceId: string, args: any) {
    const flowKey = `flow_${Date.now()}_${args.name.toLowerCase().replace(/\s+/g, '_')}`;
    
    // Criar representação do fluxo
    const flowData = {
      name: args.name,
      trigger: args.trigger,
      triggerValue: args.triggerValue || null,
      steps: args.steps || [],
      active: true,
      createdAt: new Date().toISOString(),
    };

    await this.prisma.kloelMemory.create({
      data: {
        workspaceId,
        key: flowKey,
        type: 'flow',
        category: 'automation',
        value: flowData,
      },
    });

    this.logger.log(`Flow created: ${args.name} with trigger ${args.trigger}`);

    return {
      success: true,
      flowId: flowKey,
      message: `Fluxo "${args.name}" criado com gatilho "${args.trigger}"`,
    };
  }

  private async actionUpdateWorkspaceSettings(workspaceId: string, args: any) {
    const updates: any = {};

    if (args.businessName) {
      updates.name = args.businessName;
    }

    if (Object.keys(updates).length > 0) {
      await this.prisma.workspace.update({
        where: { id: workspaceId },
        data: updates,
      });
    }

    // Salvar configurações adicionais no KloelMemory
    if (args.businessHours) {
      await this.prisma.kloelMemory.upsert({
        where: { workspaceId_key: { workspaceId, key: 'businessHours' } },
        create: {
          workspaceId,
          key: 'businessHours',
          type: 'settings',
          value: args.businessHours,
        },
        update: { value: args.businessHours },
      });
    }

    if (args.autoReplyEnabled !== undefined) {
      await this.prisma.kloelMemory.upsert({
        where: { workspaceId_key: { workspaceId, key: 'autoReply' } },
        create: {
          workspaceId,
          key: 'autoReply',
          type: 'settings',
          value: {
            enabled: args.autoReplyEnabled,
            message: args.autoReplyMessage || 'Olá! Responderemos em breve.',
          },
        },
        update: {
          value: {
            enabled: args.autoReplyEnabled,
            message: args.autoReplyMessage,
          },
        },
      });
    }

    return {
      success: true,
      message: 'Configurações atualizadas com sucesso',
    };
  }

  private async actionCreateBroadcast(workspaceId: string, args: any) {
    const broadcastKey = `broadcast_${Date.now()}`;

    // Contar contatos que receberão
    let contactCount = 0;
    if (args.targetTags && args.targetTags.length > 0) {
      contactCount = await this.prisma.contact.count({
        where: {
          workspaceId,
          tags: {
            some: {
              name: { in: args.targetTags },
            },
          },
        },
      });
    } else {
      contactCount = await this.prisma.contact.count({
        where: { workspaceId },
      });
    }

    // Salvar broadcast
    await this.prisma.kloelMemory.create({
      data: {
        workspaceId,
        key: broadcastKey,
        type: 'broadcast',
        category: 'campaign',
        value: {
          name: args.name,
          message: args.message,
          targetTags: args.targetTags || [],
          scheduleAt: args.scheduleAt || null,
          contactCount,
          status: 'pending',
          createdAt: new Date().toISOString(),
        },
      },
    });

    return {
      success: true,
      broadcastId: broadcastKey,
      contactCount,
      message: `Broadcast "${args.name}" criado para ${contactCount} contatos`,
    };
  }

  private async actionGetAnalytics(workspaceId: string, args: any) {
    const now = new Date();
    let startDate: Date;

    switch (args.period) {
      case 'today':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case 'year':
        startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }

    let result: any = {};

    switch (args.metric) {
      case 'messages':
        result = {
          total: await this.prisma.message.count({
            where: { workspaceId, createdAt: { gte: startDate } },
          }),
        };
        break;
      case 'contacts':
        result = {
          total: await this.prisma.contact.count({
            where: { workspaceId, createdAt: { gte: startDate } },
          }),
          active: await this.prisma.contact.count({
            where: { workspaceId, updatedAt: { gte: startDate } },
          }),
        };
        break;
      case 'sales':
        // Contar eventos de pagamento
        result = {
          count: await this.prisma.autopilotEvent.count({
            where: {
              workspaceId,
              action: 'PAYMENT_RECEIVED',
              createdAt: { gte: startDate },
            },
          }),
        };
        break;
      case 'conversions':
        const events = await this.prisma.autopilotEvent.groupBy({
          by: ['status'],
          where: { workspaceId, createdAt: { gte: startDate } },
          _count: true,
        });
        result = { events };
        break;
      case 'response_time':
        // Métrica simplificada
        result = { averageMinutes: 5 }; // Placeholder
        break;
    }

    return {
      success: true,
      metric: args.metric,
      period: args.period,
      data: result,
    };
  }

  private async actionConfigureAIPersona(workspaceId: string, args: any) {
    const personaData = {
      name: args.name || 'KLOEL',
      personality: args.personality || 'Profissional, amigável e focada em resultados',
      tone: args.tone || 'friendly',
      language: args.language || 'pt-BR',
      useEmojis: args.useEmojis !== undefined ? args.useEmojis : true,
      updatedAt: new Date().toISOString(),
    };

    await this.prisma.kloelMemory.upsert({
      where: { workspaceId_key: { workspaceId, key: 'aiPersona' } },
      create: {
        workspaceId,
        key: 'aiPersona',
        type: 'settings',
        category: 'ai',
        value: personaData,
      },
      update: { value: personaData },
    });

    return {
      success: true,
      message: `Persona da IA configurada: ${personaData.name} com tom ${personaData.tone}`,
    };
  }

  // ===== NEW KIA LAYER ACTIONS =====

  /**
   * Toggle Autopilot ON/OFF via IA
   */
  private async actionToggleAutopilot(workspaceId: string, args: any) {
    const { enabled, mode = 'full', workingHoursOnly = false } = args;

    const autopilotConfig = {
      enabled,
      mode,
      workingHoursOnly,
      updatedAt: new Date().toISOString(),
      updatedBy: 'kloel-ai',
    };

    // Atualizar settings do workspace
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
    });

    const currentSettings = (workspace?.providerSettings as any) || {};
    const newSettings = {
      ...currentSettings,
      autopilot: autopilotConfig,
    };

    await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: { providerSettings: newSettings },
    });

    this.logger.log(`🤖 Autopilot ${enabled ? 'LIGADO' : 'DESLIGADO'} para workspace ${workspaceId}`);

    return {
      success: true,
      message: `Autopilot ${enabled ? 'ativado' : 'desativado'} no modo ${mode}`,
      config: autopilotConfig,
    };
  }

  /**
   * Cria fluxo completo a partir de descrição natural
   */
  private async actionCreateFlowFromDescription(workspaceId: string, args: any) {
    const { description, objective, productId, autoActivate = false } = args;

    this.logger.log(`🔧 Criando fluxo a partir de descrição: "${description}"`);

    // Usar IA para gerar estrutura do fluxo
    if (!this.openai) {
      return { success: false, error: 'OpenAI não configurada' };
    }

    const prompt = `Você é um especialista em automação comercial. 
Crie um fluxo de automação para WhatsApp com base na descrição:
"${description}"

Objetivo: ${objective}

Retorne APENAS um JSON válido com a seguinte estrutura:
{
  "name": "Nome do fluxo",
  "nodes": [
    { "id": "1", "type": "message", "data": { "content": "Mensagem inicial" }, "position": { "x": 250, "y": 0 } },
    { "id": "2", "type": "wait", "data": { "delay": 5, "unit": "minutes" }, "position": { "x": 250, "y": 100 } },
    { "id": "3", "type": "message", "data": { "content": "Follow-up" }, "position": { "x": 250, "y": 200 } }
  ],
  "edges": [
    { "id": "e1-2", "source": "1", "target": "2" },
    { "id": "e2-3", "source": "2", "target": "3" }
  ]
}

Tipos de nós disponíveis: message, wait, condition, aiNode, mediaNode, endNode
Seja criativo mas prático. Foco em conversão e engajamento.`;

    try {
      const completion = await chatCompletionWithFallback(this.openai!, {
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'Você gera estruturas de fluxo em JSON.' },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_object' },
      });

      const flowData = JSON.parse(completion.choices[0]?.message?.content || '{}');

      // Criar o fluxo no banco
      const flow = await this.prisma.flow.create({
        data: {
          name: flowData.name || `Fluxo: ${objective}`,
          workspaceId,
          nodes: flowData.nodes || [],
          edges: flowData.edges || [],
          triggerType: 'MANUAL',
          triggerCondition: '',
          isActive: autoActivate,
        },
      });

      this.logger.log(`✅ Fluxo criado: ${flow.id} - ${flow.name}`);

      return {
        success: true,
        flowId: flow.id,
        flowName: flow.name,
        message: `Fluxo "${flow.name}" criado com sucesso! ${autoActivate ? 'Já está ativo.' : 'Ative quando quiser.'}`,
        nodes: flowData.nodes?.length || 0,
      };
    } catch (error: any) {
      this.logger.error(`Erro ao criar fluxo: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Inicia conexão WhatsApp - chama o serviço real para gerar QR Code
   */
  private async actionConnectWhatsApp(workspaceId: string, args: any) {
    try {
      const { provider = 'wpp' } = args;

      // Atualizar settings do workspace com provedor escolhido
      const workspace = await this.prisma.workspace.findUnique({
        where: { id: workspaceId },
      });

      const currentSettings = (workspace?.providerSettings as any) || {};
      const newSettings = {
        ...currentSettings,
        whatsappProvider: provider,
        connectionStatus: 'connecting',
        connectionInitiatedAt: new Date().toISOString(),
      };

      await this.prisma.workspace.update({
        where: { id: workspaceId },
        data: { providerSettings: newSettings },
      });

      // 🚀 Chamar o serviço real de WhatsApp para criar sessão
      await this.whatsappService.createSession(workspaceId);
      
      this.logger.log(`📱 [AGENT] Sessão WhatsApp criada para ${workspaceId}`);

      return {
        success: true,
        message: 'Sessão WhatsApp iniciada! Escaneie o QR Code para conectar.',
        sessionId: workspaceId,
        provider,
        qrCodeUrl: `/whatsapp/qr/${workspaceId}`,
        nextStep: 'Escaneie o QR Code que aparecerá na tela',
      };
    } catch (error: any) {
      this.logger.error(`Erro ao conectar WhatsApp: ${error.message}`);
      return { 
        success: false, 
        error: error.message,
        nextStep: 'Tente novamente ou acesse /whatsapp para conectar manualmente',
      };
    }
  }

  /**
   * Importa contatos
   */
  private async actionImportContacts(workspaceId: string, args: any) {
    const { source, csvData, addTags = [] } = args;

    if (source === 'csv' && csvData) {
      const lines = csvData.split('\n').filter((l: string) => l.trim());
      const header = lines[0].split(',').map((h: string) => h.trim().toLowerCase());
      
      const contacts: Array<{ phone: string; name?: string; email?: string }> = [];
      
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map((v: string) => v.trim());
        const contact: any = {};
        
        header.forEach((h, idx) => {
          if (h.includes('phone') || h.includes('telefone') || h.includes('whatsapp')) {
            contact.phone = values[idx]?.replace(/\D/g, '');
          } else if (h.includes('name') || h.includes('nome')) {
            contact.name = values[idx];
          } else if (h.includes('email')) {
            contact.email = values[idx];
          }
        });
        
        if (contact.phone) {
          contacts.push(contact);
        }
      }

      // Criar contatos
      let created = 0;
      for (const c of contacts) {
        try {
          await this.prisma.contact.upsert({
            where: { workspaceId_phone: { workspaceId, phone: c.phone } },
            create: {
              workspaceId,
              phone: c.phone,
              name: c.name,
              email: c.email,
            },
            update: {
              name: c.name || undefined,
              email: c.email || undefined,
            },
          });
          created++;
        } catch (e) {
          // Skip duplicates
        }
      }

      return {
        success: true,
        message: `${created} contatos importados com sucesso`,
        total: contacts.length,
        created,
      };
    }

    return {
      success: false,
      error: 'Fonte de importação não suportada ou dados inválidos',
    };
  }

  /**
   * Gera funil de vendas completo
   */
  private async actionGenerateSalesFunnel(workspaceId: string, args: any) {
    const { funnelName, productId, stages = ['awareness', 'interest', 'purchase'], includeFollowUps = true } = args;

    const createdFlows: string[] = [];

    // Buscar produto
    const product = productId ? await this.prisma.product.findUnique({
      where: { id: productId },
    }) : null;

    const productName = product?.name || 'seu produto';
    const productPrice = product?.price || 0;

    // Criar fluxo para cada estágio
    for (const stage of stages) {
      let flowName = '';
      let trigger = 'manual';
      let triggerValue = '';
      let nodes: any[] = [];
      let edges: any[] = [];

      switch (stage) {
        case 'awareness':
          flowName = `${funnelName} - Descoberta`;
          nodes = [
            { id: '1', type: 'message', data: { content: `Olá! 👋 Você conhece ${productName}? É incrível para resolver seus problemas!` }, position: { x: 250, y: 0 } },
            { id: '2', type: 'wait', data: { delay: 5, unit: 'minutes' }, position: { x: 250, y: 100 } },
            { id: '3', type: 'message', data: { content: 'Posso te contar mais sobre os benefícios?' }, position: { x: 250, y: 200 } },
          ];
          edges = [
            { id: 'e1-2', source: '1', target: '2' },
            { id: 'e2-3', source: '2', target: '3' },
          ];
          break;

        case 'interest':
          flowName = `${funnelName} - Interesse`;
          trigger = 'keyword';
          triggerValue = 'sim,quero,interessado';
          nodes = [
            { id: '1', type: 'message', data: { content: `Ótimo! ${productName} vai transformar seu negócio! 🚀` }, position: { x: 250, y: 0 } },
            { id: '2', type: 'message', data: { content: `Principais benefícios:\n✅ Economia de tempo\n✅ Mais vendas\n✅ Automação inteligente` }, position: { x: 250, y: 100 } },
            { id: '3', type: 'message', data: { content: 'Quer ver uma demonstração ou já fechar?' }, position: { x: 250, y: 200 } },
          ];
          edges = [
            { id: 'e1-2', source: '1', target: '2' },
            { id: 'e2-3', source: '2', target: '3' },
          ];
          break;

        case 'purchase':
          flowName = `${funnelName} - Fechamento`;
          trigger = 'keyword';
          triggerValue = 'comprar,fechar,quero comprar';
          nodes = [
            { id: '1', type: 'message', data: { content: `Perfeito! Vou preparar seu acesso ao ${productName}! 🎉` }, position: { x: 250, y: 0 } },
            { id: '2', type: 'message', data: { content: productPrice ? `O investimento é de R$ ${productPrice}. Aqui está o link para pagamento:` : 'Vou enviar o link de pagamento:' }, position: { x: 250, y: 100 } },
            { id: '3', type: 'aiNode', data: { action: 'create_payment_link' }, position: { x: 250, y: 200 } },
          ];
          edges = [
            { id: 'e1-2', source: '1', target: '2' },
            { id: 'e2-3', source: '2', target: '3' },
          ];
          break;
      }

      // Criar fluxo
      const flow = await this.prisma.flow.create({
        data: {
          name: flowName,
          workspaceId,
          nodes,
          edges,
          triggerType: trigger.toUpperCase(),
          triggerCondition: triggerValue,
          isActive: false,
        },
      });

      createdFlows.push(flow.name);
    }

    // Criar fluxo de follow-up se solicitado
    if (includeFollowUps) {
      const followUpFlow = await this.prisma.flow.create({
        data: {
          name: `${funnelName} - Follow-up`,
          workspaceId,
          nodes: [
            { id: '1', type: 'wait', data: { delay: 24, unit: 'hours' }, position: { x: 250, y: 0 } },
            { id: '2', type: 'message', data: { content: `Oi! 👋 Vi que você se interessou por ${productName}. Ainda está pensando? Posso tirar alguma dúvida?` }, position: { x: 250, y: 100 } },
            { id: '3', type: 'wait', data: { delay: 48, unit: 'hours' }, position: { x: 250, y: 200 } },
            { id: '4', type: 'message', data: { content: '⏰ Última chance! Tenho uma condição especial válida só até hoje...' }, position: { x: 250, y: 300 } },
          ],
          edges: [
            { id: 'e1-2', source: '1', target: '2' },
            { id: 'e2-3', source: '2', target: '3' },
            { id: 'e3-4', source: '3', target: '4' },
          ],
          triggerType: 'MANUAL',
          triggerCondition: '',
          isActive: false,
        },
      });
      createdFlows.push(followUpFlow.name);
    }

    return {
      success: true,
      message: `Funil "${funnelName}" criado com ${createdFlows.length} fluxos!`,
      flows: createdFlows,
      nextStep: 'Ative os fluxos quando estiver pronto para começar a vender!',
    };
  }

  /**
   * Agenda campanha
   */
  private async actionScheduleCampaign(workspaceId: string, args: any) {
    const { campaignId, scheduleAt, targetFilters } = args;

    const scheduledDate = new Date(scheduleAt);

    // Atualizar campanha existente ou criar nova
    if (campaignId) {
      await this.prisma.campaign.update({
        where: { id: campaignId },
        data: {
          scheduledAt: scheduledDate,
          status: 'SCHEDULED',
        },
      });

      return {
        success: true,
        message: `Campanha agendada para ${scheduledDate.toLocaleString('pt-BR')}`,
        scheduledAt: scheduledDate.toISOString(),
      };
    }

    return {
      success: false,
      error: 'ID da campanha necessário para agendar',
    };
  }

  /**
   * Retorna status completo do workspace
   */
  private async actionGetWorkspaceStatus(workspaceId: string, args: any) {
    const { includeMetrics = true, includeConnections = true, includeHealth = true } = args;

    const result: any = { workspaceId };

    if (includeConnections) {
      const workspace = await this.prisma.workspace.findUnique({
        where: { id: workspaceId },
      });
      const settings = (workspace?.providerSettings as any) || {};

      result.connections = {
        whatsapp: {
          provider: settings.whatsappProvider || 'none',
          status: settings.connectionStatus || 'disconnected',
          sessionId: settings.sessionId,
        },
        autopilot: {
          enabled: settings.autopilot?.enabled || false,
          mode: settings.autopilot?.mode || 'off',
        },
      };
    }

    if (includeMetrics) {
      const now = new Date();
      const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      result.metrics = {
        totalContacts: await this.prisma.contact.count({ where: { workspaceId } }),
        totalMessages: await this.prisma.message.count({ 
          where: { workspaceId, createdAt: { gte: last30Days } } 
        }),
        activeFlows: await this.prisma.flow.count({ 
          where: { workspaceId, isActive: true } 
        }),
        products: await this.prisma.product.count({ where: { workspaceId } }),
      };
    }

    if (includeHealth) {
      result.health = {
        status: 'healthy',
        lastActivity: new Date().toISOString(),
        warnings: [],
      };

      // Verificar problemas
      if (!result.connections?.whatsapp?.sessionId) {
        result.health.warnings.push('WhatsApp não conectado');
        result.health.status = 'warning';
      }

      if (result.metrics?.activeFlows === 0) {
        result.health.warnings.push('Nenhum fluxo ativo');
      }
    }

    return {
      success: true,
      ...result,
    };
  }

  // ===== BILLING =====

  /**
   * Gera link para atualizar cartão de crédito (Stripe SetupIntent)
   */
  private async actionUpdateBillingInfo(workspaceId: string, args: any) {
    try {
      const Stripe = require('stripe');
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
      
      if (!process.env.STRIPE_SECRET_KEY) {
        return { 
          success: false, 
          error: 'Stripe não configurado. Configure STRIPE_SECRET_KEY.',
          suggestion: 'Entre em contato com o suporte para ativar pagamentos.',
        };
      }

      // Buscar workspace
      const workspace = await this.prisma.workspace.findUnique({
        where: { id: workspaceId },
      });

      if (!workspace) {
        return { success: false, error: 'Workspace não encontrado' };
      }

      const settings = (workspace.providerSettings as any) || {};
      let customerId = settings.stripeCustomerId || workspace.stripeCustomerId;

      if (!customerId) {
        const customer = await stripe.customers.create({
          email: `workspace-${workspaceId}@kloel.com`,
          name: workspace.name || 'Workspace',
          metadata: { workspaceId },
        });
        customerId = customer.id;

        // Salvar customerId
        await this.prisma.workspace.update({
          where: { id: workspaceId },
          data: {
            stripeCustomerId: customerId,
            providerSettings: {
              ...settings,
              stripeCustomerId: customerId,
            },
          },
        });
      }

      // Criar SetupIntent
      const setupIntent = await stripe.setupIntents.create({
        customer: customerId,
        payment_method_types: ['card'],
        metadata: { workspaceId },
      });

      const returnUrl = args?.returnUrl || `${process.env.FRONTEND_URL || 'http://localhost:3000'}/account`;

      return {
        success: true,
        clientSecret: setupIntent.client_secret,
        setupIntentId: setupIntent.id,
        returnUrl,
        instructions: 'Use o client_secret para completar o cadastro do cartão no frontend usando Stripe Elements.',
      };
    } catch (error: any) {
      this.logger.error(`Erro ao criar SetupIntent: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Retorna status da assinatura
   */
  private async actionGetBillingStatus(workspaceId: string) {
    try {
      const workspace = await this.prisma.workspace.findUnique({
        where: { id: workspaceId },
      });

      if (!workspace) {
        return { success: false, error: 'Workspace não encontrado' };
      }

      const settings = (workspace.providerSettings as any) || {};

      return {
        success: true,
        billing: {
          plan: settings.plan || 'free',
          status: settings.subscriptionStatus || 'inactive',
          stripeCustomerId: settings.stripeCustomerId || null,
          stripeSubscriptionId: settings.stripeSubscriptionId || null,
          currentPeriodEnd: settings.currentPeriodEnd || null,
          hasPaymentMethod: !!settings.paymentMethodId,
          isSuspended: !!settings.billingSuspended,
        },
        limits: {
          contacts: settings.limits?.contacts || 100,
          messagesPerDay: settings.limits?.messagesPerDay || 50,
          flows: settings.limits?.flows || 3,
          campaigns: settings.limits?.campaigns || 1,
        },
      };
    } catch (error: any) {
      this.logger.error(`Erro ao obter status de billing: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Altera o plano de assinatura
   */
  private async actionChangePlan(workspaceId: string, args: any) {
    try {
      const { plan } = args;
      
      if (!['starter', 'pro', 'enterprise'].includes(plan)) {
        return { success: false, error: 'Plano inválido. Use: starter, pro ou enterprise' };
      }

      const Stripe = require('stripe');
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

      if (!process.env.STRIPE_SECRET_KEY) {
        return { success: false, error: 'Stripe não configurado' };
      }

      const priceIds: Record<string, string | undefined> = {
        starter: process.env.STRIPE_PRICE_STARTER,
        pro: process.env.STRIPE_PRICE_PRO,
        enterprise: process.env.STRIPE_PRICE_ENTERPRISE,
      };

      const priceId = priceIds[plan];
      if (!priceId) {
        return { success: false, error: `Preço não configurado para plano ${plan}` };
      }

      const workspace = await this.prisma.workspace.findUnique({
        where: { id: workspaceId },
      });

      if (!workspace) {
        return { success: false, error: 'Workspace não encontrado' };
      }

      const settings = (workspace.providerSettings as any) || {};
      const customerId = settings.stripeCustomerId;
      const subscriptionId = settings.stripeSubscriptionId;

      if (!customerId) {
        return { 
          success: false, 
          error: 'Nenhum cartão cadastrado',
          action: 'Cadastre um cartão primeiro usando a ferramenta update_billing_info',
        };
      }

      let result;
      if (subscriptionId) {
        // Atualizar assinatura existente
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        result = await stripe.subscriptions.update(subscriptionId, {
          items: [{
            id: subscription.items.data[0].id,
            price: priceId,
          }],
          proration_behavior: 'create_prorations',
        });
      } else {
        // Criar nova assinatura
        result = await stripe.subscriptions.create({
          customer: customerId,
          items: [{ price: priceId }],
          metadata: { workspaceId },
        });

        // Salvar subscriptionId
        await this.prisma.workspace.update({
          where: { id: workspaceId },
          data: {
            providerSettings: {
              ...settings,
              stripeSubscriptionId: result.id,
              plan,
              subscriptionStatus: result.status,
            },
          },
        });
      }

      return {
        success: true,
        plan,
        subscriptionId: result.id,
        status: result.status,
        message: `Plano alterado para ${plan} com sucesso!`,
      };
    } catch (error: any) {
      this.logger.error(`Erro ao alterar plano: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  // ===== VENDAS E NEGOCIAÇÃO =====

  /**
   * Aplica desconto para fechar a venda
   */
  private async actionApplyDiscount(
    workspaceId: string,
    contactId: string,
    phone: string,
    args: any,
  ) {
    try {
      const discountPercent = Math.min(Math.max(Number(args?.discountPercent) || 10, 1), 30);
      const reason = args?.reason || 'Oferta especial';
      const expiresIn = args?.expiresIn || '24h';

      // Buscar produto mais recente mencionado
      const recentMemory = await this.prisma.kloelMemory.findFirst({
        where: {
          workspaceId,
          category: 'products',
        },
        orderBy: { createdAt: 'desc' },
      });

      let originalPrice = 0;
      let productName = 'produto';
      
      if (recentMemory?.value) {
        const productData = typeof recentMemory.value === 'string' 
          ? JSON.parse(recentMemory.value) 
          : recentMemory.value;
        originalPrice = productData.price || 0;
        productName = productData.name || 'produto';
      }

      const finalPrice = originalPrice * (1 - discountPercent / 100);

      // Registrar evento
      await this.prisma.autopilotEvent.create({
        data: {
          workspaceId,
          contactId,
          intent: 'NEGOTIATION',
          action: 'DISCOUNT_APPLIED',
          status: 'executed',
          meta: { 
            discountPercent, 
            reason, 
            expiresIn,
            originalPrice,
            finalPrice,
            productName,
          },
        },
      });

      // Formatar mensagem
      const priceFormatted = new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
      }).format(finalPrice);

      const message = `🎁 *Oferta Especial para Você!*\n\n` +
        `Consegui um desconto exclusivo de *${discountPercent}%* para você!\n\n` +
        `💰 De: R$ ${originalPrice.toFixed(2)}\n` +
        `✨ Por apenas: ${priceFormatted}\n\n` +
        `⏰ ${reason}\n` +
        `Válido por ${expiresIn}. Aproveite!`;

      await this.actionSendMessage(workspaceId, phone, { message });

      return {
        success: true,
        discountPercent,
        originalPrice,
        finalPrice,
        expiresIn,
        messageSent: true,
      };
    } catch (error: any) {
      this.logger.error(`Erro ao aplicar desconto: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Trata objeção do cliente com técnicas de vendas
   */
  private async actionHandleObjection(
    workspaceId: string,
    contactId: string,
    phone: string,
    args: any,
  ) {
    try {
      const objectionType = args?.objectionType || 'other';
      const technique = args?.technique || 'value_focus';

      // Buscar objeções salvas na memória
      const objections = await this.prisma.kloelMemory.findMany({
        where: {
          workspaceId,
          category: 'objections',
        },
      });

      // Templates de resposta por tipo de objeção
      const objectionResponses: Record<string, string> = {
        price: `Entendo sua preocupação com o valor. Mas pense assim: quanto você perde por mês sem essa solução? 
O investimento se paga rapidamente quando você considera os resultados que vai alcançar.`,
        
        time: `Sei que seu tempo é precioso. Por isso desenvolvemos algo que economiza horas do seu dia. 
A implementação é rápida e você já começa a ver resultados na primeira semana.`,
        
        trust: `É natural ter dúvidas sobre algo novo. Por isso oferecemos garantia total. 
Se não ficar satisfeito nos primeiros 7 dias, devolvemos 100% do seu dinheiro.`,
        
        need: `Entendo! Talvez você ainda não tenha percebido como isso pode transformar seu negócio. 
Posso mostrar casos de clientes do seu segmento que tiveram resultados incríveis?`,
        
        competitor: `Ótimo que você está avaliando opções! Isso mostra que leva a sério a decisão. 
A diferença é que aqui você tem suporte personalizado e resultados comprovados.`,
        
        other: `Compreendo totalmente sua posição. Cada cliente é único e merece atenção especial. 
O que posso fazer para ajudar você a tomar a melhor decisão?`,
      };

      // Buscar objeção customizada se existir
      const customObjection = objections.find((o) => {
        const val = typeof o.value === 'string' ? JSON.parse(o.value) : o.value;
        return val?.type === objectionType;
      });

      let response = objectionResponses[objectionType] || objectionResponses.other;
      
      if (customObjection?.value) {
        const customData = typeof customObjection.value === 'string' 
          ? JSON.parse(customObjection.value) 
          : customObjection.value;
        if (customData?.response) {
          response = customData.response;
        }
      }

      // Registrar evento
      await this.prisma.autopilotEvent.create({
        data: {
          workspaceId,
          contactId,
          intent: 'OBJECTION',
          action: 'OBJECTION_HANDLED',
          status: 'executed',
          meta: { objectionType, technique, response: response.substring(0, 100) },
        },
      });

      await this.actionSendMessage(workspaceId, phone, { message: response });

      return {
        success: true,
        objectionType,
        technique,
        messageSent: true,
      };
    } catch (error: any) {
      this.logger.error(`Erro ao tratar objeção: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Qualifica lead com perguntas estratégicas
   */
  private async actionQualifyLead(
    workspaceId: string,
    contactId: string,
    phone: string,
    args: any,
  ) {
    try {
      const questions = args?.questions || [
        'Qual o principal desafio que você enfrenta hoje?',
        'Você já tentou resolver isso antes?',
        'Qual seria o resultado ideal para você?',
      ];
      const stage = args?.stage || 'interest';

      // Atualizar estágio do contato (purchaseProbability é string no schema)
      await this.prisma.contact.update({
        where: { id: contactId },
        data: {
          purchaseProbability: String(this.getStageScore(stage)),
        },
      }).catch(() => null);

      // Enviar primeira pergunta de qualificação
      const message = `Para te ajudar melhor, preciso entender algumas coisas:\n\n` +
        `📝 ${questions[0]}`;

      // Registrar evento
      await this.prisma.autopilotEvent.create({
        data: {
          workspaceId,
          contactId,
          intent: 'QUALIFICATION',
          action: 'QUALIFY_STARTED',
          status: 'executed',
          meta: { stage, questionsCount: questions.length },
        },
      });

      await this.actionSendMessage(workspaceId, phone, { message });

      return {
        success: true,
        stage,
        questionsAsked: 1,
        totalQuestions: questions.length,
        messageSent: true,
      };
    } catch (error: any) {
      this.logger.error(`Erro ao qualificar lead: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  private getStageScore(stage: string): number {
    const scores: Record<string, number> = {
      awareness: 10,
      interest: 30,
      decision: 60,
      action: 90,
    };
    return scores[stage] || 20;
  }

  /**
   * Agenda uma reunião ou demonstração
   */
  private async actionScheduleMeeting(
    workspaceId: string,
    contactId: string,
    phone: string,
    args: any,
  ) {
    try {
      const meetingType = args?.type || 'demo';
      const suggestedTimes = args?.suggestedTimes || [
        'Amanhã às 10h',
        'Amanhã às 15h',
        'Sexta às 14h',
      ];

      const typeLabels: Record<string, string> = {
        demo: '🎯 Demonstração do Produto',
        consultation: '💼 Consultoria Gratuita',
        followup: '📞 Conversa de Acompanhamento',
        support: '🛠️ Suporte Técnico',
      };

      const message = `${typeLabels[meetingType] || '📅 Agendamento'}\n\n` +
        `Qual horário funciona melhor para você?\n\n` +
        suggestedTimes.map((t: string, i: number) => `${i + 1}️⃣ ${t}`).join('\n') +
        `\n\nOu me diga um horário de sua preferência!`;

      // Registrar evento
      await this.prisma.autopilotEvent.create({
        data: {
          workspaceId,
          contactId,
          intent: 'SCHEDULING',
          action: 'MEETING_PROPOSED',
          status: 'executed',
          meta: { meetingType, suggestedTimes },
        },
      });

      await this.actionSendMessage(workspaceId, phone, { message });

      return {
        success: true,
        meetingType,
        suggestedTimes,
        messageSent: true,
      };
    } catch (error: any) {
      this.logger.error(`Erro ao agendar reunião: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Executa ação de retenção para evitar cancelamento
   */
  private async actionAntiChurn(
    workspaceId: string,
    contactId: string,
    phone: string,
    args: any,
  ) {
    try {
      const strategy = args?.strategy || 'discount';
      const offer = args?.offer;

      const strategyMessages: Record<string, string> = {
        discount: `🎁 Ei, antes de ir embora, tenho uma oferta especial para você!\n\n` +
          `Que tal um desconto exclusivo de 30% para continuar conosco? ` +
          `${offer || 'Você é um cliente valioso e queremos mantê-lo!'}`,
        
        upgrade: `⬆️ Que tal um upgrade gratuito?\n\n` +
          `Posso liberar recursos premium para você experimentar por 30 dias, sem custo adicional!`,
        
        downgrade: `💡 Entendo que às vezes precisamos ajustar.\n\n` +
          `Temos um plano mais acessível que pode atender suas necessidades. Quer conhecer?`,
        
        pause: `⏸️ Sem problemas! Que tal pausar sua assinatura por um mês?\n\n` +
          `Assim você pode voltar quando for mais conveniente, sem perder nada.`,
        
        feedback: `📝 Sua opinião é muito importante para nós!\n\n` +
          `O que podemos melhorar? Estou aqui para ouvir e resolver qualquer problema.`,
        
        vip_support: `⭐ Você é um cliente VIP!\n\n` +
          `Vou te conectar com nosso time de suporte prioritário para resolver qualquer questão.`,
      };

      const message = strategyMessages[strategy] || strategyMessages.feedback;

      // Registrar evento de retenção
      await this.prisma.autopilotEvent.create({
        data: {
          workspaceId,
          contactId,
          intent: 'RETENTION',
          action: 'ANTI_CHURN_TRIGGERED',
          status: 'executed',
          meta: { strategy, offer },
        },
      });

      await this.actionSendMessage(workspaceId, phone, { message });

      return {
        success: true,
        strategy,
        messageSent: true,
      };
    } catch (error: any) {
      this.logger.error(`Erro em anti-churn: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Tenta reativar um lead que parou de responder
   */
  private async actionReactivateGhost(
    workspaceId: string,
    contactId: string,
    phone: string,
    args: any,
  ) {
    try {
      const strategy = args?.strategy || 'curiosity';
      const daysSilent = args?.daysSilent || 7;

      const reactivationMessages: Record<string, string> = {
        curiosity: `👋 Oi! Percebi que você sumiu...\n\n` +
          `Aconteceu algo? Tenho novidades que acho que vão te interessar! 🔥`,
        
        urgency: `⏰ Última chance!\n\n` +
          `Aquela oferta que conversamos está acabando. ` +
          `Não quero que você perca essa oportunidade!`,
        
        value: `💡 Lembrei de você hoje!\n\n` +
          `Vi um caso de sucesso de um cliente parecido com você e pensei: ` +
          `isso pode te ajudar muito!`,
        
        question: `❓ Posso te fazer uma pergunta rápida?\n\n` +
          `O que te fez não seguir em frente naquele momento? ` +
          `Sua opinião me ajuda a melhorar!`,
        
        social_proof: `🌟 Sabia que mais de 500 pessoas já estão usando?\n\n` +
          `Os resultados têm sido incríveis. Dá uma olhada no que estão falando!`,
      };

      const message = reactivationMessages[strategy] || reactivationMessages.curiosity;

      // Registrar evento
      await this.prisma.autopilotEvent.create({
        data: {
          workspaceId,
          contactId,
          intent: 'REACTIVATION',
          action: 'GHOST_CONTACTED',
          status: 'executed',
          meta: { strategy, daysSilent },
        },
      });

      // Atualizar último contato (updatedAt é atualizado automaticamente)
      await this.prisma.contact.update({
        where: { id: contactId },
        data: { updatedAt: new Date() },
      }).catch(() => null);

      await this.actionSendMessage(workspaceId, phone, { message });

      return {
        success: true,
        strategy,
        daysSilent,
        messageSent: true,
      };
    } catch (error: any) {
      this.logger.error(`Erro ao reativar ghost: ${error.message}`);
      return { success: false, error: error.message };
    }
  }
}
