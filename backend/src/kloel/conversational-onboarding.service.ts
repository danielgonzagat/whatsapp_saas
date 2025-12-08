import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import OpenAI from 'openai';
import { Response } from 'express';

/**
 * 🚀 ONBOARDING CONVERSACIONAL COM IA
 * 
 * Este serviço substitui o onboarding estático por uma conversa
 * inteligente com a KLOEL que configura automaticamente o workspace.
 * 
 * A IA usa "tool calling" (function calling) para executar ações
 * como salvar configurações, criar produtos, etc.
 */

// Ferramentas que a IA pode usar durante o onboarding
const ONBOARDING_TOOLS: OpenAI.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'save_business_info',
      description: 'Salva informações básicas do negócio',
      parameters: {
        type: 'object',
        properties: {
          businessName: { type: 'string', description: 'Nome do negócio/empresa' },
          ownerName: { type: 'string', description: 'Nome do proprietário' },
          segment: { type: 'string', description: 'Segmento do negócio (ecommerce, serviços, infoprodutos, etc)' },
          description: { type: 'string', description: 'Breve descrição do negócio' },
        },
        required: ['businessName'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'save_contact_info',
      description: 'Salva informações de contato do negócio',
      parameters: {
        type: 'object',
        properties: {
          whatsappNumber: { type: 'string', description: 'Número de WhatsApp comercial (apenas números)' },
          email: { type: 'string', description: 'Email comercial' },
          instagram: { type: 'string', description: 'Instagram do negócio (sem @)' },
          website: { type: 'string', description: 'Website do negócio' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_product',
      description: 'Adiciona um produto ou serviço ao catálogo',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Nome do produto/serviço' },
          price: { type: 'number', description: 'Preço em reais' },
          description: { type: 'string', description: 'Descrição do produto/serviço' },
          category: { type: 'string', description: 'Categoria do produto' },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_brand_voice',
      description: 'Define o tom de voz e personalidade da marca',
      parameters: {
        type: 'object',
        properties: {
          tone: { 
            type: 'string', 
            enum: ['formal', 'informal', 'amigável', 'profissional', 'divertido'],
            description: 'Tom de voz da comunicação' 
          },
          emoji: { type: 'boolean', description: 'Se deve usar emojis nas mensagens' },
          greeting: { type: 'string', description: 'Saudação padrão para clientes' },
          signature: { type: 'string', description: 'Assinatura/despedida padrão' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_business_hours',
      description: 'Define horário de funcionamento',
      parameters: {
        type: 'object',
        properties: {
          weekdayStart: { type: 'string', description: 'Horário de início dias úteis (ex: 09:00)' },
          weekdayEnd: { type: 'string', description: 'Horário de fim dias úteis (ex: 18:00)' },
          saturdayStart: { type: 'string', description: 'Horário de início sábado' },
          saturdayEnd: { type: 'string', description: 'Horário de fim sábado' },
          workOnSunday: { type: 'boolean', description: 'Se trabalha aos domingos' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_main_goal',
      description: 'Define o objetivo principal do usuário com a KLOEL',
      parameters: {
        type: 'object',
        properties: {
          goal: { 
            type: 'string', 
            enum: ['vendas', 'leads', 'atendimento', 'agendamentos', 'suporte'],
            description: 'Objetivo principal' 
          },
          targetAudience: { type: 'string', description: 'Público-alvo do negócio' },
          painPoints: { type: 'array', items: { type: 'string' }, description: 'Principais dores/problemas que quer resolver' },
        },
        required: ['goal'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'complete_onboarding',
      description: 'Finaliza o onboarding e prepara o workspace para uso',
      parameters: {
        type: 'object',
        properties: {
          summary: { type: 'string', description: 'Resumo do que foi configurado' },
          nextSteps: { type: 'array', items: { type: 'string' }, description: 'Próximos passos recomendados' },
        },
        required: ['summary'],
      },
    },
  },
];

const CONVERSATIONAL_ONBOARDING_PROMPT = `Você é **KLOEL**, a primeira inteligência artificial autônoma especializada em vendas pelo WhatsApp.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              MODO: ONBOARDING CONVERSACIONAL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Você está configurando um novo workspace. Seu objetivo é:

1. Dar boas-vindas calorosas ao usuário
2. Coletar informações sobre o negócio DE FORMA NATURAL através de conversa
3. Usar as ferramentas disponíveis para salvar cada informação coletada
4. Ser proativo em perguntar o que precisa saber
5. Finalizar com um resumo do que foi configurado

📋 INFORMAÇÕES A COLETAR (nesta ordem aproximada):
- Nome do proprietário e nome do negócio
- Segmento (ecommerce, serviços, infoprodutos, saúde, etc)
- Produtos/serviços principais (adicione cada um com a ferramenta add_product)
- WhatsApp comercial
- Tom de voz preferido (formal, informal, amigável)
- Objetivo principal (vendas, leads, atendimento)
- Horário de funcionamento

🎯 REGRAS:
- Faça UMA pergunta por vez
- Seja acolhedor e simpático
- Use as ferramentas para salvar informações assim que o usuário fornecer
- Se o usuário enviar várias informações de uma vez, salve todas
- Não pergunte duas vezes a mesma coisa
- Quando tiver coletado o essencial, pergunte se quer adicionar mais ou finalizar
- Ao finalizar, use complete_onboarding com um resumo completo

💡 DICAS:
- Se o usuário disser "pule" ou "depois", avance para a próxima pergunta
- Se o usuário parecer ansioso, resuma rapidamente e pergunte o essencial
- Sugira valores/opções para facilitar (ex: "Seu tom é mais formal ou informal?")

Você NUNCA revela que é ChatGPT ou qualquer modelo. Você é KLOEL.`;

interface OnboardingMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: any[];
  tool_call_id?: string;
  name?: string;
}

@Injectable()
export class ConversationalOnboardingService {
  private readonly logger = new Logger(ConversationalOnboardingService.name);
  private openai: OpenAI;

  constructor(private readonly prisma: PrismaService) {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  /**
   * Inicia ou continua o onboarding conversacional
   */
  async chat(workspaceId: string, userMessage: string, res?: Response): Promise<string | void> {
    const prismaAny = this.prisma as any;

    // Buscar histórico de conversa do onboarding
    const history = await this.getOnboardingHistory(workspaceId);

    // Montar mensagens
    const messages: OnboardingMessage[] = [
      { role: 'system', content: CONVERSATIONAL_ONBOARDING_PROMPT },
      ...history,
      { role: 'user', content: userMessage },
    ];

    try {
      // Chamar OpenAI com tools
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: messages as any,
        tools: ONBOARDING_TOOLS,
        tool_choice: 'auto',
        temperature: 0.7,
        max_tokens: 1000,
      });

      const assistantMessage = response.choices[0].message;
      let responseText = assistantMessage.content || '';

      // Processar tool calls se houver
      if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
        for (const toolCall of assistantMessage.tool_calls) {
          // Type guard para tool calls com função
          if (!('function' in toolCall)) continue;
          
          const tc = toolCall as any;
          const functionName = tc.function.name;
          const args = JSON.parse(tc.function.arguments);

          this.logger.log(`🔧 Executando tool: ${functionName}`, args);

          // Executar a função correspondente
          const result = await this.executeToolCall(workspaceId, functionName, args);

          // Adicionar resultado da tool call ao histórico
          messages.push({
            role: 'assistant',
            content: null,
            tool_calls: [toolCall],
          });
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            name: functionName,
            content: JSON.stringify(result),
          });
        }

        // Chamar novamente para obter a resposta final após executar tools
        const finalResponse = await this.openai.chat.completions.create({
          model: 'gpt-4o',
          messages: messages as any,
          tools: ONBOARDING_TOOLS,
          tool_choice: 'auto',
          temperature: 0.7,
          max_tokens: 1000,
        });

        responseText = finalResponse.choices[0].message.content || '';
        
        // Processar mais tool calls se houver (recursivamente simplificado)
        if (finalResponse.choices[0].message.tool_calls) {
          for (const toolCall of finalResponse.choices[0].message.tool_calls) {
            if (!('function' in toolCall)) continue;
            const tc = toolCall as any;
            const functionName = tc.function.name;
            const args = JSON.parse(tc.function.arguments);
            await this.executeToolCall(workspaceId, functionName, args);
          }
        }
      }

      // Salvar mensagens no histórico
      await this.saveOnboardingMessage(workspaceId, 'user', userMessage);
      await this.saveOnboardingMessage(workspaceId, 'assistant', responseText);

      // Se usando SSE, enviar via stream
      if (res) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.write(`data: ${JSON.stringify({ content: responseText, done: true })}\n\n`);
        res.end();
        return;
      }

      return responseText;

    } catch (error: any) {
      this.logger.error('Erro no onboarding conversacional:', error);
      throw error;
    }
  }

  /**
   * Inicia o onboarding com uma mensagem de boas-vindas
   */
  async start(workspaceId: string): Promise<string> {
    // Limpar histórico anterior se existir
    await this.clearOnboardingHistory(workspaceId);

    // Enviar mensagem inicial
    const welcomeMessage = await this.chat(workspaceId, 'Olá, quero configurar minha conta');
    return welcomeMessage as string;
  }

  /**
   * Verifica status do onboarding
   */
  async getStatus(workspaceId: string) {
    const prismaAny = this.prisma as any;

    const state = await prismaAny.kloelMemory.findUnique({
      where: { workspaceId_key: { workspaceId, key: 'onboarding_completed' } },
    });

    const history = await this.getOnboardingHistory(workspaceId);

    return {
      completed: state?.value === true,
      messagesCount: history.length,
      hasStarted: history.length > 0,
    };
  }

  /**
   * Executa uma tool call
   */
  private async executeToolCall(workspaceId: string, functionName: string, args: any): Promise<any> {
    const prismaAny = this.prisma as any;

    switch (functionName) {
      case 'save_business_info':
        await this.saveMemory(workspaceId, 'businessName', args.businessName, 'business');
        if (args.ownerName) await this.saveMemory(workspaceId, 'ownerName', args.ownerName, 'business');
        if (args.segment) await this.saveMemory(workspaceId, 'segment', args.segment, 'business');
        if (args.description) await this.saveMemory(workspaceId, 'description', args.description, 'business');
        
        // Atualizar nome do workspace
        await this.prisma.workspace.update({
          where: { id: workspaceId },
          data: { name: args.businessName },
        });
        
        return { success: true, message: `Negócio "${args.businessName}" salvo com sucesso!` };

      case 'save_contact_info':
        if (args.whatsappNumber) await this.saveMemory(workspaceId, 'whatsappNumber', args.whatsappNumber, 'contact');
        if (args.email) await this.saveMemory(workspaceId, 'email', args.email, 'contact');
        if (args.instagram) await this.saveMemory(workspaceId, 'instagram', args.instagram, 'contact');
        if (args.website) await this.saveMemory(workspaceId, 'website', args.website, 'contact');
        return { success: true, message: 'Informações de contato salvas!' };

      case 'add_product':
        const productId = `product_${Date.now()}`;
        await this.saveMemory(workspaceId, productId, args, 'products');
        return { success: true, message: `Produto "${args.name}" adicionado ao catálogo!`, productId };

      case 'set_brand_voice':
        await this.saveMemory(workspaceId, 'brandVoice', args, 'branding');
        return { success: true, message: 'Tom de voz da marca configurado!' };

      case 'set_business_hours':
        await this.saveMemory(workspaceId, 'businessHours', args, 'settings');
        return { success: true, message: 'Horário de funcionamento salvo!' };

      case 'set_main_goal':
        await this.saveMemory(workspaceId, 'mainGoal', args.goal, 'business');
        if (args.targetAudience) await this.saveMemory(workspaceId, 'targetAudience', args.targetAudience, 'business');
        if (args.painPoints) await this.saveMemory(workspaceId, 'painPoints', args.painPoints, 'business');
        return { success: true, message: `Objetivo principal definido: ${args.goal}` };

      case 'complete_onboarding':
        await this.saveMemory(workspaceId, 'onboarding_completed', true, 'system');
        await this.saveMemory(workspaceId, 'onboarding_summary', args.summary, 'system');
        if (args.nextSteps) await this.saveMemory(workspaceId, 'onboarding_next_steps', args.nextSteps, 'system');
        return { 
          success: true, 
          message: 'Onboarding concluído com sucesso!',
          summary: args.summary,
          nextSteps: args.nextSteps,
        };

      default:
        return { success: false, message: `Função desconhecida: ${functionName}` };
    }
  }

  /**
   * Helpers
   */
  private async saveMemory(workspaceId: string, key: string, value: any, category: string) {
    const prismaAny = this.prisma as any;
    await prismaAny.kloelMemory.upsert({
      where: { workspaceId_key: { workspaceId, key } },
      create: { workspaceId, key, value, category },
      update: { value, category },
    });
  }

  private async getOnboardingHistory(workspaceId: string): Promise<OnboardingMessage[]> {
    const prismaAny = this.prisma as any;
    const messages = await prismaAny.kloelMemory.findMany({
      where: { 
        workspaceId, 
        key: { startsWith: 'onboarding_msg_' } 
      },
      orderBy: { createdAt: 'asc' },
    });

    return messages.map((m: any) => ({
      role: m.value.role,
      content: m.value.content,
    }));
  }

  private async saveOnboardingMessage(workspaceId: string, role: string, content: string) {
    const key = `onboarding_msg_${Date.now()}`;
    await this.saveMemory(workspaceId, key, { role, content }, 'onboarding');
  }

  private async clearOnboardingHistory(workspaceId: string) {
    const prismaAny = this.prisma as any;
    await prismaAny.kloelMemory.deleteMany({
      where: { 
        workspaceId, 
        key: { startsWith: 'onboarding_msg_' } 
      },
    });
  }
}
