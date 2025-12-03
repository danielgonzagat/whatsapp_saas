import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MemoryService } from './memory.service';
import { PaymentService } from './payment.service';
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

  private readonly skills = [
    {
      name: 'search_products',
      description: 'Busca produtos relevantes',
      parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
    },
    {
      name: 'get_product_price',
      description: 'Obtém preço de um produto',
      parameters: { type: 'object', properties: { productName: { type: 'string' } }, required: ['productName'] },
    },
    {
      name: 'create_payment_link',
      description: 'Cria link de pagamento',
      parameters: {
        type: 'object',
        properties: {
          productName: { type: 'string' },
          amount: { type: 'number' },
          customerPhone: { type: 'string' },
        },
        required: ['productName', 'amount', 'customerPhone'],
      },
    },
    {
      name: 'apply_discount',
      description: 'Aplica desconto (máx 30%)',
      parameters: {
        type: 'object',
        properties: { originalPrice: { type: 'number' }, discountPercent: { type: 'number' } },
        required: ['originalPrice', 'discountPercent'],
      },
    },
    {
      name: 'get_objection_response',
      description: 'Busca resposta para objeção',
      parameters: { type: 'object', properties: { objection: { type: 'string' } }, required: ['objection'] },
    },
  ];

  constructor(
    private readonly prisma: PrismaService,
    private readonly memoryService: MemoryService,
    private readonly paymentService: PaymentService,
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
        const args = JSON.parse(tc.function.arguments);
        
        this.logger.log(`⚡ Skill: ${skillName}`);
        skillsUsed.push(skillName);

        const result = await this.executeSkill(workspaceId, customerPhone, skillName, args);
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
    } catch (error) {
      this.logger.error(`Erro Skill Engine: ${error.message}`);
      return { response: 'Desculpe, tive um problema. Pode repetir?', skillsUsed: [], actions: [] };
    }
  }

  private async executeSkill(workspaceId: string, customerPhone: string, skillName: string, args: any): Promise<SkillResult> {
    switch (skillName) {
      case 'search_products':
        const products = await this.memoryService.searchMemory(workspaceId, args.query, 5, 'product');
        return { success: true, data: products.memories, message: `Encontrados ${products.memories.length} produtos` };

      case 'get_product_price':
        const priceSearch = await this.memoryService.searchMemory(workspaceId, args.productName, 1, 'product');
        if (priceSearch.memories.length === 0) return { success: false, message: 'Produto não encontrado' };
        const product = priceSearch.memories[0].value as any;
        return { success: true, data: product, message: `Preço: R$ ${(product?.price || 0).toFixed(2)}` };

      case 'create_payment_link':
        const payment = await this.paymentService.createPayment({
          workspaceId,
          leadId: '',
          customerName: '',
          customerPhone,
          amount: args.amount,
          description: args.productName,
        });
        return { success: true, data: payment, message: 'Link criado', action: 'SEND_PAYMENT_LINK' };

      case 'apply_discount':
        const discount = Math.min(args.discountPercent, 30);
        const finalPrice = args.originalPrice * (1 - discount / 100);
        return {
          success: true,
          data: { originalPrice: args.originalPrice, discount, finalPrice },
          message: `Desconto ${discount}%: R$ ${finalPrice.toFixed(2)}`,
        };

      case 'get_objection_response':
        const objections = await this.memoryService.searchMemory(workspaceId, args.objection, 3, 'objection');
        return { success: true, data: objections.memories, message: `${objections.memories.length} respostas encontradas` };

      default:
        return { success: false, message: `Skill desconhecida: ${skillName}` };
    }
  }

  getAvailableSkills() {
    return this.skills;
  }
}
