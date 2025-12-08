import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { ChatCompletionMessageParam, ChatCompletionTool } from 'openai/resources/chat';

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
  ];

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
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

    // 4. Chamar OpenAI com tools
    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      messages,
      tools: this.tools,
      tool_choice: 'auto',
      temperature: 0.7,
    });

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
      
      default:
        this.logger.warn(`Unknown tool: ${tool}`);
        return { success: false, error: 'Unknown tool' };
    }
  }

  // ===== ACTION IMPLEMENTATIONS =====

  private async actionSendMessage(workspaceId: string, phone: string, args: any) {
    // Integração com WhatsApp seria feita aqui
    return { success: true, message: args.message, sent: true };
  }

  private async actionSendProductInfo(workspaceId: string, phone: string, args: any) {
    const product = await this.prisma.kloelMemory.findFirst({
      where: {
        workspaceId,
        type: 'product',
        key: { contains: args.productName.toLowerCase() },
      },
    });

    if (!product) {
      return { success: false, error: 'Product not found' };
    }

    const productData = product.value as any;
    return {
      success: true,
      product: productData,
      message: `${productData.name}: ${productData.description || ''} - R$ ${productData.price}`,
    };
  }

  private async actionCreatePaymentLink(workspaceId: string, phone: string, args: any) {
    // Integração com Asaas/Stripe
    return {
      success: true,
      paymentLink: `https://pay.kloel.com/${workspaceId}/${Date.now()}`,
      amount: args.amount,
    };
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
    // Integração com fila de jobs seria feita aqui
    const scheduledFor = new Date(Date.now() + args.delayHours * 60 * 60 * 1000);
    
    return {
      success: true,
      scheduledFor: scheduledFor.toISOString(),
      message: args.message,
    };
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
    // Integração com flow queue seria feita aqui
    return {
      success: true,
      flowId: args.flowId || 'auto',
      triggered: true,
    };
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
    return this.prisma.kloelMemory.findMany({
      where: { workspaceId, type: 'product' },
      take: 20,
    });
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
}
