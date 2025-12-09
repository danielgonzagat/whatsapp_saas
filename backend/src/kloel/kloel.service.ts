import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import OpenAI from 'openai';
import { KLOEL_SYSTEM_PROMPT, KLOEL_ONBOARDING_PROMPT, KLOEL_SALES_PROMPT } from './kloel.prompts';
import { Response } from 'express';
import { SmartPaymentService } from './smart-payment.service';
import { chatCompletionWithFallback, callOpenAIWithRetry } from './openai-wrapper';
import { WhatsAppConnectionService } from './whatsapp-connection.service';

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

// Ferramentas de ação para KLOEL atuar como SaaS autônomo
const KLOEL_TOOLS: OpenAI.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'save_product',
      description: 'Cria ou atualiza um produto no catálogo do workspace',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          price: { type: 'number' },
          description: { type: 'string' },
          category: { type: 'string' },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_brand_voice',
      description: 'Define tom de voz e assinatura da marca',
      parameters: {
        type: 'object',
        properties: {
          tone: { type: 'string', description: 'formal, informal, amigável, profissional, divertido' },
          emoji: { type: 'boolean' },
          greeting: { type: 'string' },
          signature: { type: 'string' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_flow_template',
      description: 'Cria um fluxo de automação padrão (welcome, sales, support, scheduling, lead_capture)',
      parameters: {
        type: 'object',
        properties: {
          flowType: { type: 'string', enum: ['welcome', 'sales', 'support', 'scheduling', 'lead_capture'] },
          businessContext: { type: 'string' },
          customMessages: { type: 'array', items: { type: 'string' } },
        },
        required: ['flowType'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'connect_whatsapp',
      description: 'Inicia conexão WhatsApp e retorna QR Code base64',
      parameters: {
        type: 'object',
        properties: {
          force: { type: 'boolean', description: 'Se true, reinicia sessão existente' },
        },
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
    private readonly whatsappConnection: WhatsAppConnectionService,
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

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');

    try {
      const { systemPrompt, companyName, context } = await this.resolvePromptContext({
        workspaceId,
        mode,
        companyContext,
      });

      const messages: any[] = [
        { role: 'system', content: systemPrompt },
        ...(await this.getConversationHistory(workspaceId)),
        { role: 'user', content: message },
      ];

      const finalContent = await this.runWithToolsStreaming(messages, workspaceId, res);

      if (workspaceId) {
        await this.saveMessage(workspaceId, 'user', message);
        await this.saveMessage(workspaceId, 'assistant', finalContent);
      }

      res.write(`data: ${JSON.stringify({ content: finalContent, done: true })}\n\n`);
      res.end();
    } catch (error) {
      this.logger.error('Erro no KLOEL Thinker:', error);
      res.write(`data: ${JSON.stringify({ error: 'Erro ao processar mensagem', done: true })}\n\n`);
      res.end();
    }
  }

  /**
   * 🧠 KLOEL THINKER (versão sem streaming para APIs internas)
   */
  async thinkSync(request: ThinkRequest): Promise<string> {
    const { message, workspaceId, mode = 'chat', companyContext } = request;

    try {
      const { systemPrompt } = await this.resolvePromptContext({
        workspaceId,
        mode,
        companyContext,
      });

      const messages: any[] = [
        { role: 'system', content: systemPrompt },
        ...(await this.getConversationHistory(workspaceId)),
        { role: 'user', content: message },
      ];

      const assistantMessage = await this.runWithTools(messages, workspaceId);

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
   * Resolve prompts e contexto
   */
  private async resolvePromptContext(args: {
    workspaceId?: string;
    mode: 'chat' | 'onboarding' | 'sales';
    companyContext?: string;
  }) {
    const { workspaceId, mode, companyContext } = args;
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

    return { systemPrompt, companyName, context };
  }

  /**
   * Executa LLM com tool calling e loops até resposta final
   */
  private async runWithTools(messages: any[], workspaceId?: string): Promise<string> {
    let workingMessages = [...messages];

    // Primeira chamada com tools habilitadas
    const first = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      messages: workingMessages as any,
      tools: KLOEL_TOOLS,
      tool_choice: 'auto',
      temperature: 0.7,
      max_tokens: 1500,
    });

    const firstMsg = first.choices[0].message;
    workingMessages.push(firstMsg as any);

    if (firstMsg.tool_calls?.length) {
      for (const toolCall of firstMsg.tool_calls) {
        if (!('function' in toolCall)) continue;
        const args = JSON.parse(toolCall.function.arguments || '{}');
        const toolResult = await this.executeToolCall(workspaceId, toolCall.function.name, args);

        workingMessages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          name: toolCall.function.name,
          content: JSON.stringify(toolResult),
        } as any);
      }

      const second = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: workingMessages as any,
        tools: KLOEL_TOOLS,
        tool_choice: 'auto',
        temperature: 0.7,
        max_tokens: 1500,
      });

      const msg = second.choices[0].message;
      // Processar tool calls adicionais se houver
      if (msg.tool_calls?.length) {
        for (const toolCall of msg.tool_calls) {
          if (!('function' in toolCall)) continue;
          const args = JSON.parse(toolCall.function.arguments || '{}');
          await this.executeToolCall(workspaceId, toolCall.function.name, args);
        }
      }
      return msg.content || '';
    }

    return firstMsg.content || '';
  }

  /**
   * Variante com streaming de eventos SSE (tool calls + resposta final)
   */
  private async runWithToolsStreaming(messages: any[], workspaceId: string | undefined, res: Response): Promise<string> {
    let workingMessages = [...messages];

    const first = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      messages: workingMessages as any,
      tools: KLOEL_TOOLS,
      tool_choice: 'auto',
      temperature: 0.7,
      max_tokens: 1500,
    });

    const firstMsg = first.choices[0].message;
    workingMessages.push(firstMsg as any);

    if (firstMsg.tool_calls?.length) {
      for (const toolCall of firstMsg.tool_calls) {
        if (!('function' in toolCall)) continue;
        res.write(`data: ${JSON.stringify({ type: 'tool_call', name: toolCall.function.name })}\n\n`);
        const args = JSON.parse(toolCall.function.arguments || '{}');
        const toolResult = await this.executeToolCall(workspaceId, toolCall.function.name, args);
        res.write(`data: ${JSON.stringify({ type: 'tool_result', name: toolCall.function.name, result: toolResult })}\n\n`);

        workingMessages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          name: toolCall.function.name,
          content: JSON.stringify(toolResult),
        } as any);
      }

      // Segunda passada com streaming token a token após tools
      const stream = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: workingMessages as any,
        tools: KLOEL_TOOLS,
        tool_choice: 'auto',
        temperature: 0.7,
        max_tokens: 1500,
        stream: true,
      });

      let full = '';
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;

        // Eventos de tool_call adicionais (raros após execução)
        if (delta?.tool_calls?.length) {
          for (const tc of delta.tool_calls) {
            if (!('function' in tc)) continue;
            res.write(`data: ${JSON.stringify({ type: 'tool_call', name: tc.function?.name })}\n\n`);
          }
        }

        const contentPiece = delta?.content || '';
        if (contentPiece) {
          full += contentPiece;
          res.write(`data: ${JSON.stringify({ content: contentPiece, done: false })}\n\n`);
        }
      }

      return full;
    }

    const content = firstMsg.content || '';
    res.write(`data: ${JSON.stringify({ content, done: false })}\n\n`);
    return content;
  }

  /**
   * Executa tools que criam/atualizam dados reais do SaaS
   */
  private async executeToolCall(workspaceId: string | undefined, functionName: string, args: any): Promise<any> {
    if (!workspaceId) {
      return { success: false, message: 'workspaceId ausente' };
    }

    const prismaAny = this.prismaAny;

    switch (functionName) {
      case 'save_product': {
        // Não assumir índice composto existente; fazer findFirst + update/create
        const existing = await prismaAny.product.findFirst({
          where: { workspaceId, name: args.name },
        });

        let product;
        if (existing) {
          product = await prismaAny.product.update({
            where: { id: existing.id },
            data: {
              price: args.price ?? existing.price ?? 0,
              description: args.description ?? existing.description ?? '',
              category: args.category ?? existing.category ?? 'default',
              updatedAt: new Date(),
              active: true,
            },
          });
        } else {
          product = await prismaAny.product.create({
            data: {
              workspaceId,
              name: args.name,
              price: args.price ?? 0,
              description: args.description || '',
              category: args.category || 'default',
              active: true,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          });
        }

        await this.saveMemory(workspaceId, 'product', args.name, {
          price: args.price ?? product.price ?? 0,
          description: args.description ?? product.description,
          category: args.category ?? product.category,
        });

        return { success: true, productId: product.id, name: product.name };
      }

      case 'set_brand_voice': {
        await this.saveMemory(workspaceId, 'brand_voice', 'brand_voice', args);
        return { success: true, message: 'Tom de voz configurado' };
      }

      case 'create_flow_template': {
        const flow = await this.createTemplateFlow(workspaceId, args.flowType, args.businessContext, args.customMessages);
        return flow;
      }

      case 'connect_whatsapp': {
        const result = await this.whatsappConnection.initiateConnection(workspaceId);
        return {
          status: result.status,
          message: result.message,
          qrCode: (result as any).qrCodeImage || (result as any).qrCode || null,
        };
      }

      default:
        return { success: false, message: `Função desconhecida: ${functionName}` };
    }
  }

  /**
   * Cria fluxos simples reutilizáveis para venda/atendimento
   */
  private async createTemplateFlow(
    workspaceId: string,
    flowType: string,
    businessContext?: string,
    customMessages?: string[],
  ): Promise<{ success: boolean; flowId?: string; flowName?: string; message: string }> {
    const baseY = 100;
    const spacing = 150;

    const templates: Record<string, any> = {
      welcome: {
        name: '🎉 Boas-vindas Automático',
        description: 'Fluxo de boas-vindas para novos contatos',
        triggerType: 'NEW_CONTACT',
        keywords: ['oi', 'olá', 'ola', 'bem vindo'],
        nodes: [
          { id: 'start_1', type: 'start', position: { x: 250, y: baseY }, data: { label: 'Início', trigger: 'NEW_CONTACT' } },
          { id: 'msg_welcome', type: 'message', position: { x: 250, y: baseY + spacing }, data: { label: 'Boas-vindas', message: customMessages?.[0] || 'Olá! Sou sua IA de atendimento, pronto para ajudar.' } },
          { id: 'end_1', type: 'end', position: { x: 250, y: baseY + spacing * 2 }, data: { label: 'Fim' } },
        ],
        edges: [
          { id: 'e1', source: 'start_1', target: 'msg_welcome' },
          { id: 'e2', source: 'msg_welcome', target: 'end_1' },
        ],
      },
      sales: {
        name: '💰 Funil de Vendas',
        description: 'Fluxo para qualificação e oferta',
        triggerType: 'KEYWORD',
        keywords: ['comprar', 'preço', 'quanto custa'],
        nodes: [
          { id: 'start_1', type: 'start', position: { x: 250, y: baseY }, data: { label: 'Início', trigger: 'KEYWORD' } },
          { id: 'ai_qualify', type: 'ai', position: { x: 250, y: baseY + spacing }, data: { label: 'IA Qualifica', prompt: 'Qualifique o lead e descubra necessidade e orçamento.' } },
          { id: 'msg_offer', type: 'message', position: { x: 250, y: baseY + spacing * 2 }, data: { label: 'Oferta', message: 'Aqui está a melhor oferta para você!' } },
          { id: 'end_1', type: 'end', position: { x: 250, y: baseY + spacing * 3 }, data: { label: 'Fim' } },
        ],
        edges: [
          { id: 'e1', source: 'start_1', target: 'ai_qualify' },
          { id: 'e2', source: 'ai_qualify', target: 'msg_offer' },
          { id: 'e3', source: 'msg_offer', target: 'end_1' },
        ],
      },
      support: {
        name: '🎧 Suporte',
        description: 'Atendimento básico',
        triggerType: 'KEYWORD',
        keywords: ['ajuda', 'suporte', 'erro'],
        nodes: [
          { id: 'start_1', type: 'start', position: { x: 250, y: baseY }, data: { label: 'Início', trigger: 'KEYWORD' } },
          { id: 'ai_support', type: 'ai', position: { x: 250, y: baseY + spacing }, data: { label: 'IA Suporte', prompt: 'Ajude o cliente a resolver o problema ou encaminhe.' } },
          { id: 'end_1', type: 'end', position: { x: 250, y: baseY + spacing * 2 }, data: { label: 'Fim' } },
        ],
        edges: [
          { id: 'e1', source: 'start_1', target: 'ai_support' },
          { id: 'e2', source: 'ai_support', target: 'end_1' },
        ],
      },
      scheduling: {
        name: '📅 Agendamentos',
        description: 'Coleta de disponibilidade',
        triggerType: 'KEYWORD',
        keywords: ['agendar', 'horário', 'reunião'],
        nodes: [
          { id: 'start_1', type: 'start', position: { x: 250, y: baseY }, data: { label: 'Início', trigger: 'KEYWORD' } },
          { id: 'msg_schedule', type: 'message', position: { x: 250, y: baseY + spacing }, data: { message: 'Vamos agendar! Qual serviço, data e horário prefere?' } },
          { id: 'end_1', type: 'end', position: { x: 250, y: baseY + spacing * 2 }, data: { label: 'Fim' } },
        ],
        edges: [
          { id: 'e1', source: 'start_1', target: 'msg_schedule' },
          { id: 'e2', source: 'msg_schedule', target: 'end_1' },
        ],
      },
      lead_capture: {
        name: '🧲 Captura de Leads',
        description: 'Captura nome e email',
        triggerType: 'KEYWORD',
        keywords: ['interesse', 'contato', 'informações'],
        nodes: [
          { id: 'start_1', type: 'start', position: { x: 250, y: baseY }, data: { label: 'Início', trigger: 'KEYWORD' } },
          { id: 'input_name', type: 'input', position: { x: 250, y: baseY + spacing }, data: { label: 'Nome', variable: 'lead_name', validation: 'text' } },
          { id: 'input_email', type: 'input', position: { x: 250, y: baseY + spacing * 2 }, data: { label: 'Email', variable: 'lead_email', validation: 'email' } },
          { id: 'msg_thanks', type: 'message', position: { x: 250, y: baseY + spacing * 3 }, data: { message: 'Obrigado! Registramos seus dados e entraremos em contato.' } },
          { id: 'end_1', type: 'end', position: { x: 250, y: baseY + spacing * 4 }, data: { label: 'Fim' } },
        ],
        edges: [
          { id: 'e1', source: 'start_1', target: 'input_name' },
          { id: 'e2', source: 'input_name', target: 'input_email' },
          { id: 'e3', source: 'input_email', target: 'msg_thanks' },
          { id: 'e4', source: 'msg_thanks', target: 'end_1' },
        ],
      },
    };

    const tpl = templates[flowType] || templates['welcome'];
    const flow = await this.prismaAny.flow.create({
      data: {
        workspaceId,
        name: tpl.name,
        description: tpl.description,
        nodes: tpl.nodes,
        edges: tpl.edges,
        isActive: true,
        triggerType: tpl.triggerType,
        triggerCondition: (tpl.keywords || []).join(','),
      },
    });

    return { success: true, flowId: flow.id, flowName: flow.name, message: `Fluxo ${flow.name} criado` };
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
