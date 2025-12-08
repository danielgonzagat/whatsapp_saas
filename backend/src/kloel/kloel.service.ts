import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import OpenAI from 'openai';
import { KLOEL_SYSTEM_PROMPT, KLOEL_ONBOARDING_PROMPT, KLOEL_SALES_PROMPT } from './kloel.prompts';
import { Response } from 'express';
import { SmartPaymentService } from './smart-payment.service';

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
      const messages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        ...history,
        { role: 'user', content: message },
      ];

      // Chamar OpenAI com streaming
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

      const response = await this.openai.chat.completions.create({
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

      const response = await this.openai.chat.completions.create({
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

      const response = await this.openai.chat.completions.create({
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
