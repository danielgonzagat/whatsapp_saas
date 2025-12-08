import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MemoryService } from './memory.service';
import { PaymentService } from './payment.service';
import { AsaasService } from './asaas.service';
import OpenAI from 'openai';

interface SkillResult {
  success: boolean;
  data?: any;
  message: string;
  action?: string;
}

@Injectable()
export class SkillEngineService {
  private readonly logger = new Logger(SkillEngineService.name);
  private openai: OpenAI;
  private prismaAny: any;

  /**
   * 🔧 Skills disponíveis para a IA
   * Cada skill é uma ferramenta que a IA pode usar autonomamente
   */
  private readonly skills = [
    // === PRODUTOS E CATÁLOGO ===
    {
      name: 'search_products',
      description: 'Busca produtos no catálogo por nome ou descrição',
      parameters: { 
        type: 'object', 
        properties: { 
          query: { type: 'string', description: 'Termo de busca' } 
        }, 
        required: ['query'] 
      },
    },
    {
      name: 'get_product_details',
      description: 'Obtém detalhes completos de um produto (preço, descrição, disponibilidade)',
      parameters: { 
        type: 'object', 
        properties: { 
          productName: { type: 'string', description: 'Nome do produto' } 
        }, 
        required: ['productName'] 
      },
    },
    {
      name: 'list_all_products',
      description: 'Lista todos os produtos disponíveis no catálogo',
      parameters: { type: 'object', properties: {} },
    },
    
    // === PAGAMENTOS ===
    {
      name: 'create_payment_link',
      description: 'Cria um link de pagamento para o cliente. Use quando o cliente demonstrar interesse em comprar.',
      parameters: {
        type: 'object',
        properties: {
          productName: { type: 'string', description: 'Nome do produto/serviço' },
          amount: { type: 'number', description: 'Valor em reais' },
          customerPhone: { type: 'string', description: 'WhatsApp do cliente' },
          customerName: { type: 'string', description: 'Nome do cliente' },
        },
        required: ['productName', 'amount', 'customerPhone'],
      },
    },
    {
      name: 'check_payment_status',
      description: 'Verifica o status de um pagamento',
      parameters: {
        type: 'object',
        properties: {
          paymentId: { type: 'string', description: 'ID do pagamento' },
        },
        required: ['paymentId'],
      },
    },
    {
      name: 'apply_discount',
      description: 'Aplica desconto a um produto (máximo 30%). Use para fechar vendas.',
      parameters: {
        type: 'object',
        properties: { 
          originalPrice: { type: 'number', description: 'Preço original' }, 
          discountPercent: { type: 'number', description: 'Percentual de desconto (máx 30)' } 
        },
        required: ['originalPrice', 'discountPercent'],
      },
    },
    
    // === VENDAS E OBJEÇÕES ===
    {
      name: 'get_objection_response',
      description: 'Busca resposta treinada para uma objeção do cliente',
      parameters: { 
        type: 'object', 
        properties: { 
          objection: { type: 'string', description: 'A objeção do cliente' } 
        }, 
        required: ['objection'] 
      },
    },
    {
      name: 'get_sales_script',
      description: 'Obtém script de vendas para uma situação específica',
      parameters: {
        type: 'object',
        properties: {
          situation: { type: 'string', description: 'Situação (fechamento, follow-up, apresentação, etc)' },
        },
        required: ['situation'],
      },
    },
    
    // === LEADS E CRM ===
    {
      name: 'save_lead_info',
      description: 'Salva informações do lead (nome, interesse, etc)',
      parameters: {
        type: 'object',
        properties: {
          phone: { type: 'string', description: 'WhatsApp do lead' },
          name: { type: 'string', description: 'Nome do lead' },
          interest: { type: 'string', description: 'Interesse demonstrado' },
          stage: { 
            type: 'string', 
            enum: ['new', 'interested', 'negotiating', 'closed', 'lost'],
            description: 'Estágio do funil' 
          },
        },
        required: ['phone'],
      },
    },
    {
      name: 'get_lead_history',
      description: 'Obtém histórico de interações com o lead',
      parameters: {
        type: 'object',
        properties: {
          phone: { type: 'string', description: 'WhatsApp do lead' },
        },
        required: ['phone'],
      },
    },
    
    // === WHATSAPP (ações autônomas) ===
    {
      name: 'send_whatsapp_message',
      description: 'Envia mensagem de WhatsApp para o cliente. Use para follow-ups ou enviar links.',
      parameters: {
        type: 'object',
        properties: {
          phone: { type: 'string', description: 'Número de WhatsApp' },
          message: { type: 'string', description: 'Mensagem a enviar' },
        },
        required: ['phone', 'message'],
      },
    },
    {
      name: 'schedule_followup',
      description: 'Agenda um follow-up automático para o lead',
      parameters: {
        type: 'object',
        properties: {
          phone: { type: 'string', description: 'WhatsApp do lead' },
          delayMinutes: { type: 'number', description: 'Minutos até o follow-up' },
          message: { type: 'string', description: 'Mensagem do follow-up' },
        },
        required: ['phone', 'delayMinutes', 'message'],
      },
    },
    
    // === AGENDAMENTOS ===
    {
      name: 'check_availability',
      description: 'Verifica horários disponíveis para agendamento',
      parameters: {
        type: 'object',
        properties: {
          date: { type: 'string', description: 'Data no formato YYYY-MM-DD' },
        },
      },
    },
    {
      name: 'create_appointment',
      description: 'Cria um agendamento para o cliente',
      parameters: {
        type: 'object',
        properties: {
          customerPhone: { type: 'string', description: 'WhatsApp do cliente' },
          customerName: { type: 'string', description: 'Nome do cliente' },
          datetime: { type: 'string', description: 'Data e hora (ISO 8601)' },
          service: { type: 'string', description: 'Serviço agendado' },
        },
        required: ['customerPhone', 'datetime', 'service'],
      },
    },
  ];

  constructor(
    private readonly prisma: PrismaService,
    private readonly memoryService: MemoryService,
    private readonly paymentService: PaymentService,
    @Optional() private readonly asaasService?: AsaasService,
  ) {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    this.prismaAny = prisma as any;
  }

  /**
   * 🧠 Processa mensagem com function calling
   */
  async processWithSkills(
    workspaceId: string,
    customerPhone: string,
    message: string,
    conversationHistory: { role: string; content: string }[]
  ) {
    this.logger.log(`🔧 Skill Engine: "${message.substring(0, 50)}..."`);

    const salesContext = await this.memoryService.getSalesContext(workspaceId, message);

    const systemPrompt = `Você é KLOEL, vendedor IA persuasivo.

CONTEXTO:
${salesContext || 'Nenhum contexto.'}

CLIENTE: ${customerPhone}

Use as ferramentas para: buscar produtos, verificar preços, criar links de pagamento, aplicar descontos, contornar objeções.
Sempre tente FECHAR A VENDA. Responda em português brasileiro.`;

    try {
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          ...conversationHistory.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
          { role: 'user', content: message },
        ],
        tools: this.skills.map(skill => ({ type: 'function' as const, function: skill })),
        tool_choice: 'auto',
      });

      const assistantMessage = completion.choices[0].message;
      const toolCalls = assistantMessage.tool_calls || [];

      const skillsUsed: string[] = [];
      const actions: any[] = [];
      const toolResults: { tool_call_id: string; role: 'tool'; content: string }[] = [];

      for (const toolCall of toolCalls) {
        const tc = toolCall as any;
        const skillName = tc.function.name;
        let args: any = {};
        
        try {
          args = JSON.parse(tc.function.arguments);
        } catch (parseError) {
          this.logger.warn(`⚠️ Erro ao parsear argumentos de ${skillName}: ${tc.function.arguments}`);
          continue;
        }
        
        this.logger.log(`⚡ Skill: ${skillName}`);
        skillsUsed.push(skillName);

        const result = await this.safeExecuteSkill(workspaceId, customerPhone, skillName, args);
        actions.push({ skill: skillName, args, result });
        toolResults.push({ tool_call_id: toolCall.id, role: 'tool', content: JSON.stringify(result) });
      }

      let finalResponse: string;
      if (toolResults.length > 0) {
        const finalCompletion = await this.openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: systemPrompt },
            ...conversationHistory.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
            { role: 'user', content: message },
            assistantMessage,
            ...toolResults,
          ],
        });
        finalResponse = finalCompletion.choices[0].message.content || '';
      } else {
        finalResponse = assistantMessage.content || '';
      }

      return { response: finalResponse, skillsUsed, actions };
    } catch (error: any) {
      this.logger.error(`❌ Erro Skill Engine: ${error.message}`, error.stack);
      return { 
        response: 'Desculpe, tive um problema técnico. Pode repetir sua solicitação?', 
        skillsUsed: [], 
        actions: [],
        error: process.env.NODE_ENV !== 'production' ? error.message : undefined,
      };
    }
  }

  /**
   * Wrapper com tratamento de erro para execução de skills
   */
  private async safeExecuteSkill(
    workspaceId: string, 
    customerPhone: string, 
    skillName: string, 
    args: any
  ): Promise<SkillResult> {
    try {
      return await this.executeSkill(workspaceId, customerPhone, skillName, args);
    } catch (error: any) {
      this.logger.error(`❌ Erro ao executar skill ${skillName}: ${error.message}`);
      return {
        success: false,
        message: `Erro ao executar ${skillName}: ${error.message}`,
        data: null,
      };
    }
  }

  private async executeSkill(workspaceId: string, customerPhone: string, skillName: string, args: any): Promise<SkillResult> {
    this.logger.log(`🔧 Executando skill: ${skillName}`, JSON.stringify(args).substring(0, 200));

    switch (skillName) {
      // === PRODUTOS ===
      case 'search_products':
        const products = await this.memoryService.searchMemory(workspaceId, args.query, 5, 'product');
        return { success: true, data: products.memories, message: `Encontrados ${products.memories.length} produtos` };

      case 'get_product_details':
        const productSearch = await this.memoryService.searchMemory(workspaceId, args.productName, 1, 'product');
        if (productSearch.memories.length === 0) return { success: false, message: 'Produto não encontrado' };
        const productDetails = productSearch.memories[0].value as any;
        return { 
          success: true, 
          data: productDetails, 
          message: `${productDetails?.name || args.productName}: R$ ${(productDetails?.price || 0).toFixed(2)}` 
        };

      case 'list_all_products':
        const allProducts = await this.prismaAny.kloelMemory.findMany({
          where: { workspaceId, category: 'products' },
          take: 20,
        });
        return { 
          success: true, 
          data: allProducts.map((p: any) => p.value), 
          message: `${allProducts.length} produtos no catálogo` 
        };

      // === PAGAMENTOS ===
      case 'create_payment_link':
        try {
          const payment = await this.paymentService.createPayment({
            workspaceId,
            leadId: '',
            customerName: args.customerName || '',
            customerPhone: args.customerPhone || customerPhone,
            amount: args.amount,
            description: args.productName,
          });
          return { 
            success: true, 
            data: payment, 
            message: `Link de pagamento criado: ${payment.invoiceUrl}`, 
            action: 'SEND_PAYMENT_LINK' 
          };
        } catch (error: any) {
          return { success: false, message: `Erro ao criar link: ${error.message}` };
        }

      case 'check_payment_status':
        try {
          if (!this.asaasService) {
            return { success: false, message: 'Serviço de pagamento não configurado' };
          }
          const paymentStatus = await this.asaasService.getPaymentStatus(workspaceId, args.paymentId);
          const statusMessages: Record<string, string> = {
            'PENDING': 'Aguardando pagamento',
            'RECEIVED': 'Pagamento confirmado!',
            'CONFIRMED': 'Pagamento confirmado!',
            'OVERDUE': 'Pagamento vencido',
            'REFUNDED': 'Pagamento reembolsado',
            'RECEIVED_IN_CASH': 'Recebido em dinheiro',
            'REFUND_REQUESTED': 'Reembolso solicitado',
            'CHARGEBACK_REQUESTED': 'Disputa aberta',
            'CHARGEBACK_DISPUTE': 'Disputa em andamento',
            'AWAITING_CHARGEBACK_REVERSAL': 'Aguardando reversão',
            'DUNNING_REQUESTED': 'Cobrança em andamento',
            'DUNNING_RECEIVED': 'Cobrança recebida',
          };
          const statusMessage = statusMessages[paymentStatus.status] || paymentStatus.status;
          return { 
            success: true, 
            data: paymentStatus, 
            message: statusMessage,
            action: paymentStatus.status === 'RECEIVED' || paymentStatus.status === 'CONFIRMED' 
              ? 'PAYMENT_CONFIRMED' 
              : 'PAYMENT_PENDING'
          };
        } catch (error: any) {
          this.logger.warn(`check_payment_status error: ${error.message}`);
          return { success: false, message: `Erro ao verificar pagamento: ${error.message}` };
        }

      case 'apply_discount':
        const discountPercent = Math.min(args.discountPercent, 30);
        const finalPrice = args.originalPrice * (1 - discountPercent / 100);
        return {
          success: true,
          data: { originalPrice: args.originalPrice, discount: discountPercent, finalPrice },
          message: `Desconto de ${discountPercent}% aplicado! Novo valor: R$ ${finalPrice.toFixed(2)}`,
        };

      // === VENDAS ===
      case 'get_objection_response':
        const objections = await this.memoryService.searchMemory(workspaceId, args.objection, 3, 'objection');
        if (objections.memories.length === 0) {
          return { success: true, data: [], message: 'Nenhuma resposta treinada. Use persuasão natural.' };
        }
        return { 
          success: true, 
          data: objections.memories, 
          message: `${objections.memories.length} respostas encontradas` 
        };

      case 'get_sales_script':
        const scripts = await this.memoryService.searchMemory(workspaceId, args.situation, 2, 'script');
        return { 
          success: true, 
          data: scripts.memories, 
          message: scripts.memories.length > 0 ? 'Script encontrado' : 'Nenhum script treinado' 
        };

      // === LEADS ===
      case 'save_lead_info':
        await this.saveLeadInfo(workspaceId, args);
        return { success: true, message: `Lead ${args.phone} salvo com sucesso` };

      case 'get_lead_history':
        const leadHistory = await this.getLeadHistory(workspaceId, args.phone);
        return { success: true, data: leadHistory, message: `${leadHistory.length} interações encontradas` };

      // === WHATSAPP ===
      case 'send_whatsapp_message':
        // Esta ação será processada pelo caller - não enviamos diretamente
        return { 
          success: true, 
          data: { phone: args.phone, message: args.message },
          message: `Mensagem preparada para ${args.phone}`,
          action: 'SEND_WHATSAPP_MESSAGE'
        };

      case 'schedule_followup':
        await this.scheduleFollowup(workspaceId, args);
        return { 
          success: true, 
          message: `Follow-up agendado para ${args.delayMinutes} minutos`,
          action: 'FOLLOWUP_SCHEDULED'
        };

      // === AGENDAMENTOS ===
      case 'check_availability':
        // TODO: Integrar com sistema de agenda
        const mockSlots = ['09:00', '10:00', '14:00', '15:00', '16:00'];
        return { 
          success: true, 
          data: { date: args.date, availableSlots: mockSlots },
          message: `Horários disponíveis para ${args.date}: ${mockSlots.join(', ')}`
        };

      case 'create_appointment':
        await this.createAppointment(workspaceId, args);
        return { 
          success: true, 
          message: `Agendamento confirmado para ${args.datetime}`,
          action: 'APPOINTMENT_CREATED'
        };

      default:
        this.logger.warn(`Skill desconhecida: ${skillName}`);
        return { success: false, message: `Skill "${skillName}" não implementada` };
    }
  }

  /**
   * Helpers para as skills
   */
  private async saveLeadInfo(workspaceId: string, args: any) {
    const leadKey = `lead_${args.phone}`;
    await this.prismaAny.kloelMemory.upsert({
      where: { workspaceId_key: { workspaceId, key: leadKey } },
      create: { 
        workspaceId, 
        key: leadKey, 
        value: { ...args, updatedAt: new Date().toISOString() }, 
        category: 'leads' 
      },
      update: { 
        value: { ...args, updatedAt: new Date().toISOString() } 
      },
    });
  }

  private async getLeadHistory(workspaceId: string, phone: string) {
    const conversations = await this.prismaAny.kloelConversation?.findMany({
      where: { workspaceId, participantPhone: phone },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }).catch(() => []);
    return conversations || [];
  }

  private async scheduleFollowup(workspaceId: string, args: any) {
    const followupKey = `followup_${args.phone}_${Date.now()}`;
    await this.prismaAny.kloelMemory.create({
      data: {
        workspaceId,
        key: followupKey,
        value: {
          phone: args.phone,
          message: args.message,
          scheduledFor: new Date(Date.now() + args.delayMinutes * 60 * 1000).toISOString(),
          status: 'pending',
        },
        category: 'followups',
      },
    });
    // TODO: Integrar com BullMQ para executar o follow-up no horário agendado
  }

  private async createAppointment(workspaceId: string, args: any) {
    const appointmentKey = `appointment_${Date.now()}`;
    await this.prismaAny.kloelMemory.create({
      data: {
        workspaceId,
        key: appointmentKey,
        value: {
          customerPhone: args.customerPhone,
          customerName: args.customerName || '',
          datetime: args.datetime,
          service: args.service,
          status: 'confirmed',
          createdAt: new Date().toISOString(),
        },
        category: 'appointments',
      },
    });
  }

  getAvailableSkills() {
    return this.skills;
  }
}
