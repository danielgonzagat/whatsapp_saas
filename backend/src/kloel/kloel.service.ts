import { Injectable, Logger, forwardRef, Inject } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import OpenAI from 'openai';
import { ChatCompletionTool, ChatCompletionMessageParam } from 'openai/resources/chat';
import { KLOEL_SYSTEM_PROMPT, KLOEL_ONBOARDING_PROMPT, KLOEL_SALES_PROMPT } from './kloel.prompts';
import { Response } from 'express';
import { SmartPaymentService } from './smart-payment.service';
import { chatCompletionWithFallback, callOpenAIWithRetry } from './openai-wrapper';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ThinkRequest {
  message: string;
  workspaceId?: string;
  conversationId?: string;
  mode?: 'chat' | 'onboarding' | 'sales';
  companyContext?: string;
}

// Ferramentas disponíveis no chat principal da KLOEL
const KLOEL_CHAT_TOOLS: ChatCompletionTool[] = [
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
];

@Injectable()
export class KloelService {
  private readonly logger = new Logger(KloelService.name);
  private openai: OpenAI;
  private prismaAny: any;

  constructor(
    private readonly prisma: PrismaService,
    private readonly smartPaymentService: SmartPaymentService,
  ) {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    // Cast para any para acessar novos modelos enquanto tipos não são regenerados
    this.prismaAny = prisma as any;
  }

  /**
   * 🧠 KLOEL THINKER - Processa mensagens com streaming
   * Retorna resposta em tempo real via SSE
   */
  async think(request: ThinkRequest, res: Response): Promise<void> {
    const { message, workspaceId, mode = 'chat', companyContext } = request;

    // Configurar headers para SSE (Server-Sent Events)
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');

    try {
      // Buscar contexto da empresa se tiver workspaceId
      let context = companyContext || '';
      let companyName = 'sua empresa';

      if (workspaceId) {
        const workspace = await this.prisma.workspace.findUnique({
          where: { id: workspaceId },
        });
        if (workspace) {
          companyName = workspace.name;
          // Buscar memória/contexto salvo
          context = await this.getWorkspaceContext(workspaceId);
        }
      }

      // Selecionar o system prompt baseado no modo
      let systemPrompt: string;
      switch (mode) {
        case 'onboarding':
          systemPrompt = KLOEL_ONBOARDING_PROMPT;
          break;
        case 'sales':
          systemPrompt = KLOEL_SALES_PROMPT(companyName, context);
          break;
        default:
          systemPrompt = KLOEL_SYSTEM_PROMPT;
      }

      // Buscar histórico da conversa (últimas 10 mensagens)
      const history = await this.getConversationHistory(workspaceId);

      // Montar mensagens para a API
      const messages: ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPrompt },
        ...history.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        { role: 'user', content: message },
      ];

      // No modo 'chat', habilitar tool-calling para executar ações
      if (mode === 'chat' && workspaceId) {
        // Primeira chamada para detectar tool_calls (sem stream)
        const initialResponse = await this.openai.chat.completions.create({
          model: 'gpt-4o',
          messages,
          tools: KLOEL_CHAT_TOOLS,
          tool_choice: 'auto',
          temperature: 0.7,
          max_tokens: 2000,
        });

        const assistantMessage = initialResponse.choices[0]?.message;

        // Se houver tool_calls, executá-las
        if (assistantMessage?.tool_calls && assistantMessage.tool_calls.length > 0) {
          const toolResults: Array<{ name: string; result: any }> = [];
          
          for (const toolCall of assistantMessage.tool_calls) {
            const tc = toolCall as any;
            const toolName = tc.function?.name || '';
            let toolArgs = {};
            
            try {
              toolArgs = JSON.parse(tc.function?.arguments || '{}');
            } catch {
              this.logger.warn(`Failed to parse tool args for ${toolName}`);
            }

            // Executar a ferramenta
            const result = await this.executeTool(workspaceId, toolName, toolArgs);
            toolResults.push({ name: toolName, result });

            // Notificar o frontend via SSE
            res.write(`data: ${JSON.stringify({ 
              type: 'tool_call',
              tool: toolName, 
              args: toolArgs,
              result,
              done: false 
            })}\n\n`);
          }

          // Agora fazer uma segunda chamada para gerar a resposta de texto
          // incluindo os resultados das ferramentas
          const toolResultsContext = toolResults.map(tr => 
            `[Ferramenta ${tr.name} executada: ${JSON.stringify(tr.result)}]`
          ).join('\n');

          messages.push({ 
            role: 'assistant', 
            content: `${assistantMessage.content || ''}\n${toolResultsContext}` 
          });
          messages.push({ 
            role: 'user', 
            content: 'Continue a conversa naturalmente, confirmando o que foi feito.' 
          });
        }
      }

      // Chamar OpenAI com streaming para a resposta final
      const stream = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages,
        stream: true,
        temperature: 0.7,
        max_tokens: 2000,
      });

      let fullResponse = '';

      // Processar stream e enviar para o cliente
      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
        if (content) {
          fullResponse += content;
          // Enviar chunk via SSE
          res.write(`data: ${JSON.stringify({ content, done: false })}\n\n`);
        }
      }

      // Salvar a mensagem e resposta no histórico
      if (workspaceId) {
        await this.saveMessage(workspaceId, 'user', message);
        await this.saveMessage(workspaceId, 'assistant', fullResponse);
      }

      // Sinalizar fim do stream
      res.write(`data: ${JSON.stringify({ content: '', done: true })}\n\n`);
      res.end();

    } catch (error) {
      this.logger.error('Erro no KLOEL Thinker:', error);
      res.write(`data: ${JSON.stringify({ error: 'Erro ao processar mensagem', done: true })}\n\n`);
      res.end();
    }
  }

  /**
   * 🔧 Executa uma ferramenta do chat
   */
  private async executeTool(workspaceId: string, toolName: string, args: any): Promise<any> {
    this.logger.log(`🔧 Executando ferramenta: ${toolName}`, args);
    
    try {
      switch (toolName) {
        case 'save_product':
          return await this.toolSaveProduct(workspaceId, args);
        
        case 'toggle_autopilot':
          return await this.toolToggleAutopilot(workspaceId, args);
        
        case 'set_brand_voice':
          return await this.toolSetBrandVoice(workspaceId, args);
        
        case 'create_flow':
          return await this.toolCreateFlow(workspaceId, args);
        
        case 'get_dashboard_summary':
          return await this.toolGetDashboardSummary(workspaceId, args);
        
        case 'create_payment_link':
          return await this.smartPaymentService.createSmartPayment({
            workspaceId,
            amount: args.amount,
            productName: args.description,
            customerName: args.customerName || 'Cliente',
            phone: '',
          });
        
        default:
          return { success: false, error: `Ferramenta desconhecida: ${toolName}` };
      }
    } catch (error: any) {
      this.logger.error(`Erro ao executar ferramenta ${toolName}:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 📦 Cadastrar produto
   */
  private async toolSaveProduct(workspaceId: string, args: any): Promise<any> {
    const product = await this.prisma.product.create({
      data: {
        workspaceId,
        name: args.name,
        price: args.price,
        description: args.description || '',
        active: true,
      },
    });
    return { success: true, product, message: `Produto "${args.name}" cadastrado com sucesso!` };
  }

  /**
   * 🤖 Toggle Autopilot
   */
  private async toolToggleAutopilot(workspaceId: string, args: any): Promise<any> {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
    });
    
    const currentSettings = (workspace?.providerSettings as any) || {};
    const newSettings = {
      ...currentSettings,
      autopilotEnabled: args.enabled,
    };
    
    await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: { providerSettings: newSettings },
    });
    
    return { 
      success: true, 
      enabled: args.enabled,
      message: args.enabled ? 'Autopilot ativado! 🤖' : 'Autopilot desativado.',
    };
  }

  /**
   * 🎭 Definir tom de voz
   */
  private async toolSetBrandVoice(workspaceId: string, args: any): Promise<any> {
    await this.prismaAny.kloelMemory.create({
      data: {
        workspaceId,
        type: 'persona',
        content: `Tom: ${args.tone}. ${args.personality || ''}`,
        metadata: { tone: args.tone, personality: args.personality },
      },
    });
    return { success: true, message: `Tom de voz definido como "${args.tone}"` };
  }

  /**
   * ⚡ Criar fluxo simples
   */
  private async toolCreateFlow(workspaceId: string, args: any): Promise<any> {
    // Criar um fluxo básico com nó de mensagem
    const nodes = [
      {
        id: 'start',
        type: 'trigger',
        position: { x: 100, y: 100 },
        data: { trigger: args.trigger },
      },
      {
        id: 'msg1',
        type: 'message',
        position: { x: 100, y: 200 },
        data: { message: args.actions?.[0] || 'Olá!' },
      },
    ];
    
    const edges = [{ id: 'e1', source: 'start', target: 'msg1' }];
    
    const flow = await this.prisma.flow.create({
      data: {
        workspaceId,
        name: args.name,
        description: `Fluxo criado via chat: ${args.trigger}`,
        nodes,
        edges,
        isActive: true,
      },
    });
    
    return { success: true, flow, message: `Fluxo "${args.name}" criado com sucesso!` };
  }

  /**
   * 📊 Resumo do dashboard
   */
  private async toolGetDashboardSummary(workspaceId: string, args: any): Promise<any> {
    const period = args.period || 'today';
    let dateFilter: Date;
    
    switch (period) {
      case 'week':
        dateFilter = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        dateFilter = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        dateFilter = new Date();
        dateFilter.setHours(0, 0, 0, 0);
    }
    
    const [contacts, messages, flows] = await Promise.all([
      this.prisma.contact.count({ where: { workspaceId, createdAt: { gte: dateFilter } } }),
      this.prisma.message.count({ where: { workspaceId, createdAt: { gte: dateFilter } } }),
      this.prisma.flow.count({ where: { workspaceId, isActive: true } }),
    ]);
    
    return {
      success: true,
      period,
      stats: {
        newContacts: contacts,
        messages,
        activeFlows: flows,
      },
    };
  }

  /**
   * 🧠 KLOEL THINKER (versão sem streaming para APIs internas)
   */
  async thinkSync(request: ThinkRequest): Promise<string> {
    const { message, workspaceId, mode = 'chat', companyContext } = request;

    try {
      let context = companyContext || '';
      let companyName = 'sua empresa';

      if (workspaceId) {
        const workspace = await this.prisma.workspace.findUnique({
          where: { id: workspaceId },
        });
        if (workspace) {
          companyName = workspace.name;
          context = await this.getWorkspaceContext(workspaceId);
        }
      }

      let systemPrompt: string;
      switch (mode) {
        case 'onboarding':
          systemPrompt = KLOEL_ONBOARDING_PROMPT;
          break;
        case 'sales':
          systemPrompt = KLOEL_SALES_PROMPT(companyName, context);
          break;
        default:
          systemPrompt = KLOEL_SYSTEM_PROMPT;
      }

      const history = await this.getConversationHistory(workspaceId);

      const messages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        ...history,
        { role: 'user', content: message },
      ];

      const response = await chatCompletionWithFallback(this.openai, {
        model: 'gpt-4o',
        messages,
        temperature: 0.7,
        max_tokens: 2000,
      });

      const assistantMessage = response.choices[0]?.message?.content || '';

      if (workspaceId) {
        await this.saveMessage(workspaceId, 'user', message);
        await this.saveMessage(workspaceId, 'assistant', assistantMessage);
      }

      return assistantMessage;

    } catch (error) {
      this.logger.error('Erro no KLOEL Thinker Sync:', error);
      throw error;
    }
  }

  /**
   * 📚 Buscar contexto do workspace (produtos, memória, etc)
   */
  private async getWorkspaceContext(workspaceId: string): Promise<string> {
    try {
      // Buscar memórias salvas
      const memories = await this.prismaAny.kloelMemory.findMany({
        where: { workspaceId },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });

      if (memories.length === 0) {
        return '';
      }

      // Formatar contexto
      const contextParts: string[] = [];

      for (const memory of memories) {
        switch (memory.type) {
          case 'product':
            contextParts.push(`PRODUTO: ${memory.content}`);
            break;
          case 'company_info':
            contextParts.push(`INFO DA EMPRESA: ${memory.content}`);
            break;
          case 'persona':
            contextParts.push(`PERSONA/TOM DE VOZ: ${memory.content}`);
            break;
          case 'objection':
            contextParts.push(`OBJEÇÃO COMUM: ${memory.content}`);
            break;
          case 'script':
            contextParts.push(`SCRIPT DE VENDA: ${memory.content}`);
            break;
          default:
            contextParts.push(memory.content);
        }
      }

      return contextParts.join('\n\n');
    } catch (error) {
      this.logger.warn('Erro ao buscar contexto:', error);
      return '';
    }
  }

  /**
   * 💬 Buscar histórico de conversa
   */
  private async getConversationHistory(workspaceId?: string): Promise<ChatMessage[]> {
    if (!workspaceId) return [];

    try {
      const messages = await this.prismaAny.kloelMessage.findMany({
        where: { workspaceId },
        orderBy: { createdAt: 'asc' },
        take: 20, // Últimas 20 mensagens
      });

      return messages.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));
    } catch (error) {
      // Tabela pode não existir ainda
      return [];
    }
  }

  /**
   * 💾 Salvar mensagem no histórico
   */
  private async saveMessage(workspaceId: string, role: string, content: string): Promise<void> {
    try {
      await this.prismaAny.kloelMessage.create({
        data: {
          workspaceId,
          role,
          content,
        },
      });
    } catch (error) {
      // Tabela pode não existir ainda
      this.logger.warn('Erro ao salvar mensagem:', error);
    }
  }

  /**
   * 🧠 Salvar memória/aprendizado
   */
  async saveMemory(workspaceId: string, type: string, content: string, metadata?: any): Promise<void> {
    try {
      await this.prismaAny.kloelMemory.create({
        data: {
          workspaceId,
          type,
          content,
          metadata: metadata || {},
        },
      });
    } catch (error) {
      this.logger.error('Erro ao salvar memória:', error);
    }
  }

  /**
   * 📄 Processar PDF e extrair informações
   */
  async processPdf(workspaceId: string, pdfContent: string): Promise<string> {
    try {
      const extractionPrompt = `Analise o seguinte conteúdo de um PDF e extraia:
1. Lista de produtos com preços
2. Benefícios principais
3. Diferenciais da empresa
4. Políticas importantes (troca, garantia, frete)
5. Tom de voz/estilo de comunicação

Retorne em formato estruturado.

CONTEÚDO:
${pdfContent}`;

      const response = await chatCompletionWithFallback(this.openai, {
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: 'Você é um assistente de análise de documentos comerciais.' },
          { role: 'user', content: extractionPrompt },
        ],
        temperature: 0.3,
      });

      const analysis = response.choices[0]?.message?.content || '';

      // Salvar na memória
      await this.saveMemory(workspaceId, 'pdf_analysis', analysis, { source: 'pdf' });

      return analysis;
    } catch (error) {
      this.logger.error('Erro ao processar PDF:', error);
      throw error;
    }
  }

  /**
   * 📱 Processar mensagem WhatsApp recebida e responder autonomamente
   * Este é o core da KLOEL - vendedor autônomo
   */
  async processWhatsAppMessage(
    workspaceId: string,
    senderPhone: string,
    message: string
  ): Promise<string> {
    this.logger.log(`🧠 KLOEL processando mensagem de ${senderPhone}`);

    try {
      // 1. Buscar ou criar lead
      const lead = await this.getOrCreateLead(workspaceId, senderPhone);

      // 2. Buscar histórico da conversa com este lead
      const conversationHistory = await this.getLeadConversationHistory(lead.id);

      // 3. Buscar contexto do workspace (produtos, scripts, etc)
      const context = await this.getWorkspaceContext(workspaceId);
      const workspace = await this.prisma.workspace.findUnique({
        where: { id: workspaceId },
      });

      // 4. Montar prompt de vendas
      const salesSystemPrompt = KLOEL_SALES_PROMPT(
        workspace?.name || 'nossa empresa',
        context
      );

      // 5. Chamar OpenAI
      const messages: ChatMessage[] = [
        { role: 'system', content: salesSystemPrompt },
        ...conversationHistory,
        { role: 'user', content: message },
      ];

      const response = await chatCompletionWithFallback(this.openai, {
        model: 'gpt-4o',
        messages,
        temperature: 0.7,
        max_tokens: 1000,
      });

      const kloelResponse = response.choices[0]?.message?.content || 
        'Olá! Como posso ajudá-lo hoje?';

      // 6. Salvar conversa no histórico do lead
      await this.saveLeadMessage(lead.id, 'user', message);
      await this.saveLeadMessage(lead.id, 'assistant', kloelResponse);

      // 7. Atualizar lead score e stage baseado na conversa
      await this.updateLeadFromConversation(lead.id, message, kloelResponse);

      return kloelResponse;

    } catch (error) {
      this.logger.error(`Erro processando mensagem WhatsApp: ${error.message}`);
      return 'Olá! Tive um pequeno problema técnico. Pode repetir sua mensagem?';
    }
  }

  /**
   * 📋 Buscar ou criar lead pelo telefone
   */
  private async getOrCreateLead(workspaceId: string, phone: string): Promise<any> {
    let lead = await this.prismaAny.kloelLead.findFirst({
      where: { workspaceId, phone },
    });

    if (!lead) {
      lead = await this.prismaAny.kloelLead.create({
        data: {
          workspaceId,
          phone,
          name: 'Lead ' + phone.slice(-4),
          stage: 'new',
          score: 0,
        },
      });
      this.logger.log(`Novo lead criado: ${lead.id}`);
    }

    return lead;
  }

  /**
   * 💬 Buscar histórico de conversa do lead
   */
  private async getLeadConversationHistory(leadId: string): Promise<ChatMessage[]> {
    try {
      const messages = await this.prismaAny.kloelConversation.findMany({
        where: { leadId },
        orderBy: { createdAt: 'asc' },
        take: 30, // Últimas 30 mensagens
      });

      return messages.map((m: any) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));
    } catch (error) {
      return [];
    }
  }

  /**
   * 💾 Salvar mensagem do lead
   */
  private async saveLeadMessage(leadId: string, role: string, content: string): Promise<void> {
    try {
      await this.prismaAny.kloelConversation.create({
        data: {
          leadId,
          role,
          content,
        },
      });
    } catch (error) {
      this.logger.warn('Erro ao salvar mensagem do lead:', error);
    }
  }

  /**
   * 📊 Atualizar lead baseado na conversa (score, stage)
   */
  private async updateLeadFromConversation(
    leadId: string,
    userMessage: string,
    assistantResponse: string
  ): Promise<void> {
    try {
      // Detectar intenção de compra
      const buyIntent = this.detectBuyIntent(userMessage);
      
      // Atualizar score e stage
      const updateData: any = {
        lastMessage: userMessage,
        lastIntent: buyIntent,
        updatedAt: new Date(),
      };

      if (buyIntent === 'high') {
        updateData.score = { increment: 20 };
        updateData.stage = 'negotiation';
      } else if (buyIntent === 'medium') {
        updateData.score = { increment: 10 };
        updateData.stage = 'interested';
      } else if (buyIntent === 'objection') {
        updateData.stage = 'objection';
      }

      await this.prismaAny.kloelLead.update({
        where: { id: leadId },
        data: updateData,
      });
    } catch (error) {
      this.logger.warn('Erro ao atualizar lead:', error);
    }
  }

  /**
   * 💳 Gerar link de pagamento automaticamente quando detectar intenção de compra
   * Integração direta com SmartPaymentService
   */
  async generatePaymentForLead(
    workspaceId: string,
    leadId: string,
    phone: string,
    productName: string,
    amount: number,
    conversation: string,
  ): Promise<{ paymentUrl: string; pixQrCode?: string; message: string } | null> {
    try {
      const lead = await this.prismaAny.kloelLead.findUnique({
        where: { id: leadId },
      });

      const result = await this.smartPaymentService.createSmartPayment({
        workspaceId,
        contactId: leadId,
        phone,
        customerName: lead?.name || 'Cliente',
        productName,
        amount,
        conversation,
      });

      this.logger.log(`💳 Pagamento gerado para lead ${leadId}: ${result.paymentUrl}`);

      return {
        paymentUrl: result.paymentUrl,
        pixQrCode: result.pixQrCode,
        message: result.suggestedMessage,
      };
    } catch (error) {
      this.logger.error(`Erro ao gerar pagamento para lead: ${error.message}`);
      return null;
    }
  }

  /**
   * 🤖 Processar mensagem WhatsApp com suporte automático a pagamentos
   * Versão aprimorada que detecta intenção de compra e gera link de pagamento
   */
  async processWhatsAppMessageWithPayment(
    workspaceId: string,
    senderPhone: string,
    message: string,
  ): Promise<{ response: string; paymentLink?: string; pixQrCode?: string }> {
    const baseResponse = await this.processWhatsAppMessage(workspaceId, senderPhone, message);
    
    // Verificar se há intenção de compra alta
    const buyIntent = this.detectBuyIntent(message);
    
    if (buyIntent === 'high') {
      // Tentar buscar produto mencionado e gerar pagamento
      const productMention = await this.extractProductFromMessage(workspaceId, message);
      
      if (productMention) {
        const lead = await this.prismaAny.kloelLead.findFirst({
          where: { workspaceId, phone: senderPhone },
        });

        if (lead) {
          const paymentResult = await this.generatePaymentForLead(
            workspaceId,
            lead.id,
            senderPhone,
            productMention.name,
            productMention.price,
            message,
          );

          if (paymentResult) {
            return {
              response: `${baseResponse}\n\n💳 Aqui está o link para finalizar sua compra:\n${paymentResult.paymentUrl}`,
              paymentLink: paymentResult.paymentUrl,
              pixQrCode: paymentResult.pixQrCode,
            };
          }
        }
      }
    }

    return { response: baseResponse };
  }

  /**
   * 🔍 Extrair produto mencionado na mensagem
   */
  private async extractProductFromMessage(
    workspaceId: string,
    message: string,
  ): Promise<{ name: string; price: number } | null> {
    try {
      // Buscar produtos do workspace
      const products = await this.prismaAny.kloelMemory.findMany({
        where: { workspaceId, type: 'product' },
      });

      const lowerMessage = message.toLowerCase();

      for (const product of products) {
        const productData = product.value as any;
        const productName = (productData.name || '').toLowerCase();
        
        if (productName && lowerMessage.includes(productName)) {
          return {
            name: productData.name,
            price: productData.price || 0,
          };
        }
      }

      // Se não encontrou, tentar buscar do modelo Product
      const dbProducts = await this.prisma.product?.findMany?.({
        where: { workspaceId, active: true },
      }).catch(() => []);

      for (const product of dbProducts || []) {
        if (lowerMessage.includes(product.name.toLowerCase())) {
          return {
            name: product.name,
            price: product.price,
          };
        }
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * 🎯 Detectar intenção de compra
   */
  private detectBuyIntent(message: string): 'high' | 'medium' | 'low' | 'objection' {
    const lowerMessage = message.toLowerCase();

    // Alta intenção de compra
    const highIntentKeywords = [
      'quero comprar', 'vou comprar', 'pode enviar', 'manda o link',
      'aceito', 'fechado', 'como pago', 'pix', 'cartão', 'boleto',
      'quero esse', 'vou levar', 'me envia', 'pode mandar'
    ];

    // Média intenção
    const mediumIntentKeywords = [
      'quanto custa', 'qual o valor', 'tem desconto', 'parcelado',
      'como funciona', 'me conta mais', 'interessado', 'gostei'
    ];

    // Objeções
    const objectionKeywords = [
      'tá caro', 'muito caro', 'não tenho', 'vou pensar', 'depois',
      'não sei', 'não posso', 'não quero', 'sem interesse'
    ];

    for (const keyword of highIntentKeywords) {
      if (lowerMessage.includes(keyword)) return 'high';
    }

    for (const keyword of mediumIntentKeywords) {
      if (lowerMessage.includes(keyword)) return 'medium';
    }

    for (const keyword of objectionKeywords) {
      if (lowerMessage.includes(keyword)) return 'objection';
    }

    return 'low';
  }
}
