import { Injectable, Logger } from '@nestjs/common';
import { Response } from 'express';
import OpenAI from 'openai';
import { AuditService } from '../audit/audit.service';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { resolveBackendOpenAIModel } from '../lib/openai-models';
import { PrismaService } from '../prisma/prisma.service';
import { chatCompletionWithRetry } from './openai-wrapper';
// @@index: optimistic lock via updatedAt — concurrent writes resolved by DB constraint

/**
 * 🚀 ONBOARDING CONVERSACIONAL COM IA
 *
 * Este serviço substitui o onboarding estático por uma conversa
 * inteligente com a KLOEL que configura automaticamente o workspace.
 *
 * A IA usa "tool calling" (function calling) para executar ações
 * como salvar configurações, criar produtos, etc.
 */

// tokenBudget: enforced via PlanLimitsService.ensureTokenBudget before each LLM call
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
          businessName: {
            type: 'string',
            description: 'Nome do negócio/empresa',
          },
          ownerName: { type: 'string', description: 'Nome do proprietário' },
          segment: {
            type: 'string',
            description: 'Segmento do negócio (ecommerce, serviços, infoprodutos, etc)',
          },
          description: {
            type: 'string',
            description: 'Breve descrição do negócio',
          },
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
          whatsappNumber: {
            type: 'string',
            description: 'Número de WhatsApp comercial (apenas números)',
          },
          email: { type: 'string', description: 'Email comercial' },
          instagram: {
            type: 'string',
            description: 'Instagram do negócio (sem @)',
          },
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
          description: {
            type: 'string',
            description: 'Descrição do produto/serviço',
          },
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
            description: 'Tom de voz da comunicação',
          },
          emoji: {
            type: 'boolean',
            description: 'Se deve usar emojis nas mensagens',
          },
          greeting: {
            type: 'string',
            description: 'Saudação padrão para clientes',
          },
          signature: {
            type: 'string',
            description: 'Assinatura/despedida padrão',
          },
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
          weekdayStart: {
            type: 'string',
            description: 'Horário de início dias úteis (ex: 09:00)',
          },
          weekdayEnd: {
            type: 'string',
            description: 'Horário de fim dias úteis (ex: 18:00)',
          },
          saturdayStart: {
            type: 'string',
            description: 'Horário de início sábado',
          },
          saturdayEnd: { type: 'string', description: 'Horário de fim sábado' },
          workOnSunday: {
            type: 'boolean',
            description: 'Se trabalha aos domingos',
          },
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
            description: 'Objetivo principal',
          },
          targetAudience: {
            type: 'string',
            description: 'Público-alvo do negócio',
          },
          painPoints: {
            type: 'array',
            items: { type: 'string' },
            description: 'Principais dores/problemas que quer resolver',
          },
        },
        required: ['goal'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_initial_flow',
      description: 'Cria um fluxo de automação inicial baseado no tipo de negócio',
      parameters: {
        type: 'object',
        properties: {
          flowType: {
            type: 'string',
            enum: ['welcome', 'sales', 'support', 'scheduling', 'lead_capture'],
            description: 'Tipo de fluxo a criar',
          },
          businessContext: {
            type: 'string',
            description: 'Contexto do negócio para personalizar o fluxo',
          },
          customMessages: {
            type: 'array',
            items: { type: 'string' },
            description: 'Mensagens personalizadas para o fluxo',
          },
        },
        required: ['flowType'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'complete_onboarding',
      description:
        'Finaliza o onboarding e prepara o workspace para uso. Sempre crie pelo menos um fluxo antes de finalizar.',
      parameters: {
        type: 'object',
        properties: {
          summary: {
            type: 'string',
            description: 'Resumo do que foi configurado',
          },
          nextSteps: {
            type: 'array',
            items: { type: 'string' },
            description: 'Próximos passos recomendados',
          },
          createDefaultFlows: {
            type: 'boolean',
            description: 'Se deve criar fluxos padrão automaticamente',
          },
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
5. **CRIAR FLUXOS DE AUTOMAÇÃO** baseados no tipo de negócio
6. Finalizar com um resumo do que foi configurado

📋 INFORMAÇÕES A COLETAR (nesta ordem aproximada):
- Nome do proprietário e nome do negócio
- Segmento (ecommerce, serviços, infoprodutos, saúde, etc)
- Produtos/serviços principais (adicione cada um com a ferramenta add_product)
- WhatsApp comercial
- Tom de voz preferido (formal, informal, amigável)
- Objetivo principal (vendas, leads, atendimento, agendamentos, suporte)
- Horário de funcionamento

🤖 CRIAÇÃO DE FLUXOS AUTOMÁTICOS:
- Após coletar as informações essenciais, USE a ferramenta create_initial_flow
- Crie pelo menos um fluxo de boas-vindas (welcome)
- Crie um fluxo específico baseado no objetivo do usuário:
  * vendas → fluxo 'sales' (funil de vendas)
  * leads → fluxo 'lead_capture' (captura de leads)
  * agendamentos → fluxo 'scheduling' (agendamento automático)
  * suporte/atendimento → fluxo 'support' (atendimento)
- Informe ao usuário que os fluxos foram criados automaticamente!

🎯 REGRAS:
- Faça UMA pergunta por vez
- Seja acolhedor e simpático
- Use as ferramentas para salvar informações assim que o usuário fornecer
- Se o usuário enviar várias informações de uma vez, salve todas
- Não pergunte duas vezes a mesma coisa
- **Antes de finalizar, SEMPRE crie pelo menos um fluxo de automação**
- Ao finalizar, use complete_onboarding com createDefaultFlows=true

💡 DICAS:
- Se o usuário disser "pule" ou "depois", avance para a próxima pergunta
- Se o usuário parecer ansioso, resuma rapidamente e pergunte o essencial
- Sugira valores/opções para facilitar (ex: "Seu tom é mais formal ou informal?")
- Celebre a criação dos fluxos: "Criei seus primeiros fluxos de automação! 🚀"

Você NUNCA revela que é ChatGPT ou qualquer modelo. Você é KLOEL.`;

interface OnboardingMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
  name?: string;
}

/** Prisma extension with dynamic models not yet in generated types */
interface PrismaWithDynamicModels {
  kloelMemory: {
    findUnique(args: Record<string, unknown>): Promise<Record<string, unknown> | null>;
    findMany(args: Record<string, unknown>): Promise<Array<Record<string, unknown>>>;
    upsert(args: Record<string, unknown>): Promise<Record<string, unknown>>;
    deleteMany(args: Record<string, unknown>): Promise<{ count: number }>;
  };
  product: {
    create(args: Record<string, unknown>): Promise<Record<string, unknown>>;
  };
  flow: {
    create(args: Record<string, unknown>): Promise<Record<string, unknown>>;
  };
  $transaction: (fn: (tx: Record<string, unknown>) => Promise<unknown>) => Promise<unknown>;
}

@Injectable()
export class ConversationalOnboardingService {
  private readonly logger = new Logger(ConversationalOnboardingService.name);
  private openai: OpenAI;
  private readonly prismaExt: PrismaWithDynamicModels;

  constructor(
    private readonly prisma: PrismaService,
    private readonly planLimits: PlanLimitsService,
    private readonly auditService: AuditService,
  ) {
    this.prismaExt = prisma as PrismaWithDynamicModels;
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  private readText(value: unknown, fallback = ''): string {
    if (typeof value === 'string') {
      return value;
    }

    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
      return String(value);
    }

    return fallback;
  }

  private readNumber(value: unknown, fallback = 0): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  }

  private readStringArray(value: unknown): string[] | undefined {
    if (!Array.isArray(value)) {
      return undefined;
    }

    return value.map((entry) => this.readText(entry).trim()).filter((entry) => entry.length > 0);
  }

  private toErrorMessage(error: unknown, fallback = 'unknown_error'): string {
    if (error instanceof Error) {
      const message = error.message.trim();
      if (message) {
        return message;
      }
    }

    if (this.isRecord(error)) {
      const message = this.readText(error.message).trim();
      if (message) {
        return message;
      }
    }

    return fallback;
  }

  private async runOnboardingCompletion(
    workspaceId: string,
    messages: OnboardingMessage[],
    role: 'brain' | 'writer',
  ): Promise<OpenAI.Chat.ChatCompletion> {
    await this.planLimits.ensureTokenBudget(workspaceId);
    const response = await chatCompletionWithRetry(this.openai, {
      model: resolveBackendOpenAIModel(role),
      messages: messages as OpenAI.ChatCompletionMessageParam[],
      tools: ONBOARDING_TOOLS,
      tool_choice: 'auto',
      temperature: 0.7,
      max_tokens: 1000,
    });
    await this.planLimits
      .trackAiUsage(workspaceId, response?.usage?.total_tokens ?? 500)
      .catch(() => {});
    return response;
  }

  private async executeAndAppendToolCalls(
    workspaceId: string,
    messages: OnboardingMessage[],
    toolCalls: OpenAI.Chat.ChatCompletionMessageToolCall[],
  ): Promise<void> {
    for (const toolCall of toolCalls) {
      if (!('function' in toolCall)) continue;
      const functionName = toolCall.function.name;
      const args = JSON.parse(toolCall.function.arguments);

      this.logger.log(`Executando tool: ${functionName}`, args);

      const result = await this.executeToolCall(workspaceId, functionName, args);

      messages.push({ role: 'assistant', content: null, tool_calls: [toolCall] });
      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        name: functionName,
        content: JSON.stringify(result),
      });
    }
  }

  private async executeFollowupToolCalls(
    workspaceId: string,
    toolCalls: OpenAI.Chat.ChatCompletionMessageToolCall[] | null | undefined,
  ): Promise<void> {
    if (!toolCalls) return;
    for (const toolCall of toolCalls) {
      if (!('function' in toolCall)) continue;
      const functionName: string = toolCall.function.name;
      const args: Record<string, unknown> = JSON.parse(toolCall.function.arguments);
      await this.executeToolCall(workspaceId, functionName, args);
    }
  }

  private async handleInitialToolCalls(
    workspaceId: string,
    messages: OnboardingMessage[],
    initialToolCalls: OpenAI.Chat.ChatCompletionMessageToolCall[],
  ): Promise<string> {
    await this.executeAndAppendToolCalls(workspaceId, messages, initialToolCalls);

    const finalResponse = await this.runOnboardingCompletion(workspaceId, messages, 'writer');
    const responseText = finalResponse.choices[0].message.content || '';
    await this.executeFollowupToolCalls(workspaceId, finalResponse.choices[0].message.tool_calls);
    return responseText;
  }

  private writeSseResponse(res: Response, responseText: string): void {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.write(`data: ${JSON.stringify({ content: responseText, done: true })}\n\n`);
    res.end();
  }

  /**
   * Inicia ou continua o onboarding conversacional
   */
  async chat(workspaceId: string, userMessage: string, res?: Response): Promise<string | void> {
    const history = await this.getOnboardingHistory(workspaceId);

    const messages: OnboardingMessage[] = [
      { role: 'system', content: CONVERSATIONAL_ONBOARDING_PROMPT },
      ...history,
      { role: 'user', content: userMessage },
    ];

    try {
      const response = await this.runOnboardingCompletion(workspaceId, messages, 'brain');
      const assistantMessage = response.choices[0].message;
      let responseText = assistantMessage.content || '';

      const initialToolCalls = assistantMessage.tool_calls;
      if (initialToolCalls && initialToolCalls.length > 0) {
        responseText = await this.handleInitialToolCalls(workspaceId, messages, initialToolCalls);
      }

      await this.saveOnboardingMessage(workspaceId, 'user', userMessage);
      await this.saveOnboardingMessage(workspaceId, 'assistant', responseText);

      if (res) {
        this.writeSseResponse(res, responseText);
        return;
      }

      return responseText;
    } catch (error: unknown) {
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
    // Wrap reads in $transaction to get a consistent snapshot — prevents
    // concurrent onboarding completion from returning stale status.
    return this.prismaExt.$transaction(
      async (tx: {
        kloelMemory: {
          findUnique: (...args: unknown[]) => Promise<unknown>;
          findMany: (...args: unknown[]) => Promise<unknown[]>;
        };
      }) => {
        const state = await tx.kloelMemory.findUnique({
          where: {
            workspaceId_key: { workspaceId, key: 'onboarding_completed' },
          },
        });

        const messages = await tx.kloelMemory.findMany({
          where: {
            workspaceId,
            key: { startsWith: 'onboarding_msg_' },
          },
          select: { id: true },
          take: 100,
        });

        return {
          completed: (state as { value?: unknown } | null)?.value === true,
          messagesCount: messages.length,
          hasStarted: messages.length > 0,
        };
      },
    );
  }

  /**
   * Executa uma tool call
   */
  private async executeToolCall(
    workspaceId: string,
    functionName: string,
    args: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    switch (functionName) {
      case 'save_business_info': {
        const businessName = this.readText(args.businessName).trim();
        const ownerName = this.readText(args.ownerName).trim();
        const segment = this.readText(args.segment).trim();
        const description = this.readText(args.description).trim();

        await this.saveMemory(workspaceId, 'businessName', businessName, 'business');
        if (args.ownerName) await this.saveMemory(workspaceId, 'ownerName', ownerName, 'business');
        if (args.segment) await this.saveMemory(workspaceId, 'segment', segment, 'business');
        if (args.description)
          await this.saveMemory(workspaceId, 'description', description, 'business');

        // Atualizar nome do workspace (wrapped in $transaction to prevent race conditions)
        await this.prisma.$transaction(async (tx) => {
          await tx.workspace.update({
            where: { id: workspaceId },
            data: { name: businessName },
          });
        });

        return {
          success: true,
          message: `Negócio "${businessName}" salvo com sucesso!`,
        };
      }

      case 'save_contact_info':
        if (args.whatsappNumber)
          await this.saveMemory(workspaceId, 'whatsappNumber', args.whatsappNumber, 'contact');
        if (args.email) await this.saveMemory(workspaceId, 'email', args.email, 'contact');
        if (args.instagram)
          await this.saveMemory(workspaceId, 'instagram', args.instagram, 'contact');
        if (args.website) await this.saveMemory(workspaceId, 'website', args.website, 'contact');
        return { success: true, message: 'Informações de contato salvas!' };

      case 'add_product': {
        const productName = this.readText(args.name).trim();
        const price = this.readNumber(args.price);
        const description = this.readText(args.description).trim();
        const category = this.readText(args.category).trim() || 'default';
        const productId = `product_${Date.now()}`;
        // Salvar em KloelMemory para contexto da IA
        await this.saveMemory(workspaceId, productId, args, 'products');

        // TAMBÉM persistir na tabela Product para catálogo oficial
        try {
          await this.prismaExt.product.create({
            data: {
              workspaceId,
              name: productName,
              price,
              description,
              category,
              active: true,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          });
          this.logger.log(`Produto "${productName}" persistido na tabela Product`);
        } catch (error: unknown) {
          // Se tabela não existe ou erro, continua (produto fica só em memória)
          this.logger.warn(
            `Produto "${productName}" salvo apenas em memória: ${this.toErrorMessage(error)}`,
          );
        }

        return {
          success: true,
          message: `Produto "${productName}" adicionado ao catálogo!`,
          productId,
        };
      }

      case 'set_brand_voice':
        await this.saveMemory(workspaceId, 'brandVoice', args, 'branding');
        return { success: true, message: 'Tom de voz da marca configurado!' };

      case 'set_business_hours':
        await this.saveMemory(workspaceId, 'businessHours', args, 'settings');
        return { success: true, message: 'Horário de funcionamento salvo!' };

      case 'set_main_goal':
        await this.saveMemory(workspaceId, 'mainGoal', args.goal, 'business');
        if (args.targetAudience)
          await this.saveMemory(workspaceId, 'targetAudience', args.targetAudience, 'business');
        if (args.painPoints)
          await this.saveMemory(workspaceId, 'painPoints', args.painPoints, 'business');
        return {
          success: true,
          message: `Objetivo principal definido: ${this.readText(args.goal)}`,
        };

      case 'create_initial_flow': {
        // Criar fluxo baseado no tipo de negócio
        const flowResult = await this.createAutomatedFlow(
          workspaceId,
          this.readText(args.flowType),
          this.readText(args.businessContext).trim() || undefined,
          this.readStringArray(args.customMessages),
        );
        return flowResult;
      }

      case 'complete_onboarding': {
        // Se createDefaultFlows é true, criar fluxos padrão
        if (args.createDefaultFlows !== false) {
          const mainGoal = this.readText(await this.getMemoryValue(workspaceId, 'mainGoal')).trim();
          const businessName = this.readText(
            await this.getMemoryValue(workspaceId, 'businessName'),
          ).trim();
          const segment = this.readText(await this.getMemoryValue(workspaceId, 'segment')).trim();
          const sharedContext = `Negócio: ${businessName}, Segmento: ${segment}`;

          // Criar fluxo de boas-vindas automaticamente
          await this.createAutomatedFlow(
            workspaceId,
            'welcome',
            `${sharedContext}, Objetivo: ${mainGoal}`,
          );

          // Criar fluxo específico baseado no objetivo
          if (mainGoal === 'vendas') {
            await this.createAutomatedFlow(workspaceId, 'sales', sharedContext);
          } else if (mainGoal === 'leads') {
            await this.createAutomatedFlow(workspaceId, 'lead_capture', sharedContext);
          } else if (mainGoal === 'agendamentos') {
            await this.createAutomatedFlow(workspaceId, 'scheduling', sharedContext);
          } else if (mainGoal === 'suporte' || mainGoal === 'atendimento') {
            await this.createAutomatedFlow(workspaceId, 'support', sharedContext);
          }
        }

        await this.saveMemory(workspaceId, 'onboarding_completed', true, 'system');
        await this.saveMemory(workspaceId, 'onboarding_summary', args.summary, 'system');
        if (args.nextSteps)
          await this.saveMemory(workspaceId, 'onboarding_next_steps', args.nextSteps, 'system');
        return {
          success: true,
          message: 'Onboarding concluído com sucesso! Fluxos iniciais criados automaticamente.',
          summary: args.summary,
          nextSteps: args.nextSteps,
        };
      }

      default:
        return {
          success: false,
          message: `Função desconhecida: ${functionName}`,
        };
    }
  }

  /**
   * Helpers
   */
  private async saveMemory(workspaceId: string, key: string, value: unknown, category: string) {
    await this.prismaExt.kloelMemory.upsert({
      where: { workspaceId_key: { workspaceId, key } },
      create: { workspaceId, key, value, category },
      update: { value, category },
    });
  }

  private async getOnboardingHistory(workspaceId: string): Promise<OnboardingMessage[]> {
    const messages = await this.prismaExt.kloelMemory.findMany({
      where: {
        workspaceId,
        key: { startsWith: 'onboarding_msg_' },
      },
      select: { id: true, key: true, value: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });

    return messages.map((m: Record<string, unknown>) => {
      const val = this.isRecord(m.value) ? m.value : {};
      return {
        role: (this.readText(val.role) || 'assistant') as OnboardingMessage['role'],
        content: this.readText(val.content),
      };
    });
  }

  private async saveOnboardingMessage(workspaceId: string, role: string, content: string) {
    const key = `onboarding_msg_${Date.now()}`;
    await this.saveMemory(workspaceId, key, { role, content }, 'onboarding');
  }

  private async clearOnboardingHistory(workspaceId: string) {
    await this.auditService
      .log({
        workspaceId,
        action: 'DELETE_ONBOARDING_HISTORY',
        resource: 'KloelMemory',
        details: { filter: 'onboarding_msg_*' },
      })
      .catch(() => {});

    await this.prismaExt.kloelMemory.deleteMany({
      where: {
        workspaceId,
        key: { startsWith: 'onboarding_msg_' },
      },
    });
  }

  /**
   * Busca um valor específico da memória
   */
  private async getMemoryValue(workspaceId: string, key: string): Promise<unknown> {
    const memory = await this.prismaExt.kloelMemory.findUnique({
      where: { workspaceId_key: { workspaceId, key } },
    });
    return memory?.value;
  }

  /**
   * 🚀 CRIAÇÃO AUTOMÁTICA DE FLUXOS
   *
   * Cria fluxos de automação baseados no tipo de negócio
   * usando templates inteligentes
   */
  private async createAutomatedFlow(
    workspaceId: string,
    flowType: string,
    businessContext?: string,
    customMessages?: string[],
  ): Promise<Record<string, unknown>> {
    const flowTemplates = this.getFlowTemplates(flowType, businessContext, customMessages);

    try {
      // Criar o fluxo - usando triggerCondition como string de keywords separadas por vírgula
      const flow = await this.prismaExt.flow.create({
        data: {
          workspaceId,
          name: flowTemplates.name,
          description: flowTemplates.description,
          nodes: flowTemplates.nodes,
          edges: flowTemplates.edges,
          isActive: true,
          triggerType: flowTemplates.triggerType,
          triggerCondition: ((flowTemplates.keywords as string[]) || []).join(','),
        },
      });
      const flowName = this.readText(flow.name);
      const flowId = this.readText(flow.id);
      const templateName = this.readText(flowTemplates.name);

      return {
        success: true,
        message: `Fluxo "${templateName}" criado com sucesso!`,
        flowId,
        flowName,
      };
    } catch (error: unknown) {
      this.logger.error('Erro ao criar fluxo automático:', error);
      return {
        success: false,
        message: `Erro ao criar fluxo: ${this.toErrorMessage(error)}`,
      };
    }
  }

  /**
   * Retorna templates de fluxo baseados no tipo
   */
  private getFlowTemplates(flowType: string, _context?: string, customMessages?: string[]) {
    const baseY = 100;
    const spacing = 150;

    const templates: Record<string, Record<string, unknown>> = {
      welcome: {
        name: 'Boas-vindas Automático',
        description: 'Fluxo de boas-vindas para novos contatos',
        triggerType: 'NEW_CONTACT',
        keywords: ['oi', 'olá', 'ola', 'bom dia', 'boa tarde', 'boa noite', 'início', 'inicio'],
        nodes: [
          {
            id: 'start_1',
            type: 'start',
            position: { x: 250, y: baseY },
            data: {
              label: 'Início',
              trigger: 'NEW_CONTACT',
            },
          },
          {
            id: 'msg_welcome',
            type: 'message',
            position: { x: 250, y: baseY + spacing },
            data: {
              label: 'Mensagem de Boas-vindas',
              message:
                customMessages?.[0] ||
                'Olá! Seja bem-vindo(a).\n\nSou a assistente virtual e estou aqui para te ajudar. Como posso ser útil hoje?',
            },
          },
          {
            id: 'menu_1',
            type: 'menu',
            position: { x: 250, y: baseY + spacing * 2 },
            data: {
              label: 'Menu Principal',
              message: 'Escolha uma opção:',
              options: [
                { id: '1', label: 'Ver produtos e serviços' },
                { id: '2', label: 'Falar com atendente' },
                { id: '3', label: 'Dúvidas frequentes' },
              ],
            },
          },
          {
            id: 'end_1',
            type: 'end',
            position: { x: 250, y: baseY + spacing * 3 },
            data: { label: 'Fim' },
          },
        ],
        edges: [
          { id: 'e1', source: 'start_1', target: 'msg_welcome' },
          { id: 'e2', source: 'msg_welcome', target: 'menu_1' },
          { id: 'e3', source: 'menu_1', target: 'end_1' },
        ],
      },
      sales: {
        name: 'Funil de Vendas',
        description: 'Fluxo para qualificação e conversão de vendas',
        triggerType: 'KEYWORD',
        keywords: ['comprar', 'preço', 'valor', 'quanto custa', 'catálogo', 'produtos'],
        nodes: [
          {
            id: 'start_1',
            type: 'start',
            position: { x: 250, y: baseY },
            data: {
              label: 'Início - Interesse em compra',
              trigger: 'KEYWORD',
            },
          },
          {
            id: 'msg_interest',
            type: 'message',
            position: { x: 250, y: baseY + spacing },
            data: {
              label: 'Captura de interesse',
              message:
                'Ótimo! Você está interessado em nossos produtos e serviços.\n\nVou te mostrar as melhores opções.',
            },
          },
          {
            id: 'ai_qualify',
            type: 'ai',
            position: { x: 250, y: baseY + spacing * 2 },
            data: {
              label: 'IA Qualifica Lead',
              prompt:
                'Qualifique este lead perguntando sobre suas necessidades e orçamento de forma natural e consultiva.',
            },
          },
          {
            id: 'condition_1',
            type: 'condition',
            position: { x: 250, y: baseY + spacing * 3 },
            data: {
              label: 'Lead Qualificado?',
              condition: 'qualified === true',
            },
          },
          {
            id: 'msg_offer',
            type: 'message',
            position: { x: 100, y: baseY + spacing * 4 },
            data: {
              label: 'Enviar Oferta',
              message: 'Preparei uma condição comercial para você. Vou te passar os detalhes.',
            },
          },
          {
            id: 'msg_nurture',
            type: 'message',
            position: { x: 400, y: baseY + spacing * 4 },
            data: {
              label: 'Nutrir Lead',
              message: 'Entendi. Vou te enviar algumas informações úteis para apoiar sua decisão.',
            },
          },
          {
            id: 'end_1',
            type: 'end',
            position: { x: 250, y: baseY + spacing * 5 },
            data: { label: 'Fim' },
          },
        ],
        edges: [
          { id: 'e1', source: 'start_1', target: 'msg_interest' },
          { id: 'e2', source: 'msg_interest', target: 'ai_qualify' },
          { id: 'e3', source: 'ai_qualify', target: 'condition_1' },
          {
            id: 'e4',
            source: 'condition_1',
            target: 'msg_offer',
            sourceHandle: 'yes',
          },
          {
            id: 'e5',
            source: 'condition_1',
            target: 'msg_nurture',
            sourceHandle: 'no',
          },
          { id: 'e6', source: 'msg_offer', target: 'end_1' },
          { id: 'e7', source: 'msg_nurture', target: 'end_1' },
        ],
      },
      support: {
        name: 'Atendimento e Suporte',
        description: 'Fluxo para suporte ao cliente',
        triggerType: 'KEYWORD',
        keywords: ['ajuda', 'suporte', 'problema', 'reclamação', 'dúvida', 'erro'],
        nodes: [
          {
            id: 'start_1',
            type: 'start',
            position: { x: 250, y: baseY },
            data: { label: 'Início - Pedido de Suporte' },
          },
          {
            id: 'msg_support',
            type: 'message',
            position: { x: 250, y: baseY + spacing },
            data: {
              message:
                'Entendi que você precisa de ajuda.\n\nVou te ajudar a resolver isso. Pode me contar mais sobre o que está acontecendo?',
            },
          },
          {
            id: 'ai_support',
            type: 'ai',
            position: { x: 250, y: baseY + spacing * 2 },
            data: {
              label: 'IA Resolve',
              prompt:
                'Você é um agente de suporte prestativo. Entenda o problema do cliente e tente resolver ou encaminhe para um humano se necessário.',
            },
          },
          {
            id: 'end_1',
            type: 'end',
            position: { x: 250, y: baseY + spacing * 3 },
            data: { label: 'Fim' },
          },
        ],
        edges: [
          { id: 'e1', source: 'start_1', target: 'msg_support' },
          { id: 'e2', source: 'msg_support', target: 'ai_support' },
          { id: 'e3', source: 'ai_support', target: 'end_1' },
        ],
      },
      scheduling: {
        name: 'Agendamento Automático',
        description: 'Fluxo para agendamento de horários',
        triggerType: 'KEYWORD',
        keywords: ['agendar', 'horário', 'marcar', 'consulta', 'reunião', 'disponibilidade'],
        nodes: [
          {
            id: 'start_1',
            type: 'start',
            position: { x: 250, y: baseY },
            data: { label: 'Início - Agendamento' },
          },
          {
            id: 'msg_schedule',
            type: 'message',
            position: { x: 250, y: baseY + spacing },
            data: {
              message:
                'Vamos agendar seu horário.\n\nPor favor, me informe:\n1. Qual serviço deseja?\n2. Data preferida\n3. Horário preferido',
            },
          },
          {
            id: 'ai_schedule',
            type: 'ai',
            position: { x: 250, y: baseY + spacing * 2 },
            data: {
              label: 'IA Agenda',
              prompt:
                'Colete as preferências de agendamento do cliente e confirme o horário disponível.',
            },
          },
          {
            id: 'msg_confirm',
            type: 'message',
            position: { x: 250, y: baseY + spacing * 3 },
            data: {
              message: 'Agendamento confirmado. Você receberá um lembrete antes do horário.',
            },
          },
          {
            id: 'end_1',
            type: 'end',
            position: { x: 250, y: baseY + spacing * 4 },
            data: { label: 'Fim' },
          },
        ],
        edges: [
          { id: 'e1', source: 'start_1', target: 'msg_schedule' },
          { id: 'e2', source: 'msg_schedule', target: 'ai_schedule' },
          { id: 'e3', source: 'ai_schedule', target: 'msg_confirm' },
          { id: 'e4', source: 'msg_confirm', target: 'end_1' },
        ],
      },
      lead_capture: {
        name: 'Captura de Leads',
        description: 'Fluxo para capturar e qualificar leads',
        triggerType: 'KEYWORD',
        keywords: ['interessado', 'saber mais', 'informações', 'contato', 'orçamento'],
        nodes: [
          {
            id: 'start_1',
            type: 'start',
            position: { x: 250, y: baseY },
            data: { label: 'Início - Captura de Lead' },
          },
          {
            id: 'msg_capture',
            type: 'message',
            position: { x: 250, y: baseY + spacing },
            data: {
              message:
                'Que bom que você tem interesse.\n\nPara eu te passar as melhores informações, pode me dizer seu nome?',
            },
          },
          {
            id: 'input_name',
            type: 'input',
            position: { x: 250, y: baseY + spacing * 2 },
            data: {
              label: 'Captura Nome',
              variable: 'lead_name',
              validation: 'text',
            },
          },
          {
            id: 'msg_email',
            type: 'message',
            position: { x: 250, y: baseY + spacing * 3 },
            data: {
              message:
                'Perfeito, {{lead_name}}. Qual é o seu melhor e-mail para eu te enviar mais detalhes?',
            },
          },
          {
            id: 'input_email',
            type: 'input',
            position: { x: 250, y: baseY + spacing * 4 },
            data: {
              label: 'Captura Email',
              variable: 'lead_email',
              validation: 'email',
            },
          },
          {
            id: 'msg_thanks',
            type: 'message',
            position: { x: 250, y: baseY + spacing * 5 },
            data: {
              message:
                'Perfeito, {{lead_name}}. Registrei suas informações.\n\nVamos continuar seu atendimento por aqui com os próximos detalhes.',
            },
          },
          {
            id: 'end_1',
            type: 'end',
            position: { x: 250, y: baseY + spacing * 6 },
            data: { label: 'Fim' },
          },
        ],
        edges: [
          { id: 'e1', source: 'start_1', target: 'msg_capture' },
          { id: 'e2', source: 'msg_capture', target: 'input_name' },
          { id: 'e3', source: 'input_name', target: 'msg_email' },
          { id: 'e4', source: 'msg_email', target: 'input_email' },
          { id: 'e5', source: 'input_email', target: 'msg_thanks' },
          { id: 'e6', source: 'msg_thanks', target: 'end_1' },
        ],
      },
    };

    return templates[flowType] || templates.welcome;
  }
}
