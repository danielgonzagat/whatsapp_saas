import { Injectable, Logger } from '@nestjs/common';
import { Response } from 'express';
import OpenAI from 'openai';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { resolveBackendOpenAIModel } from '../lib/openai-models';
import { PrismaService } from '../prisma/prisma.service';
import { chatCompletionWithRetry } from './openai-wrapper';
import { ConversationalOnboardingToolsService } from './conversational-onboarding-tools.service';
import { ONBOARDING_TOOLS } from './conversational-onboarding-tools-schema';
// @@index: optimistic lock via updatedAt — concurrent writes resolved by DB constraint

/**
 * ONBOARDING CONVERSACIONAL COM IA
 *
 * Este serviço substitui o onboarding estático por uma conversa
 * inteligente com a KLOEL que configura automaticamente o workspace.
 *
 * A IA usa "tool calling" (function calling) para executar ações
 * como salvar configurações, criar produtos, etc.
 */

// tokenBudget: enforced via PlanLimitsService.ensureTokenBudget before each LLM call

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

INFORMAÇÕES A COLETAR (nesta ordem aproximada):
- Nome do proprietário e nome do negócio
- Segmento (ecommerce, serviços, infoprodutos, saúde, etc)
- Produtos/serviços principais (adicione cada um com a ferramenta add_product)
- WhatsApp comercial
- Tom de voz preferido (formal, informal, amigável)
- Objetivo principal (vendas, leads, atendimento, agendamentos, suporte)
- Horário de funcionamento

CRIAÇÃO DE FLUXOS AUTOMÁTICOS:
- Após coletar as informações essenciais, USE a ferramenta create_initial_flow
- Crie pelo menos um fluxo de boas-vindas (welcome)
- Crie um fluxo específico baseado no objetivo do usuário:
  * vendas → fluxo 'sales' (funil de vendas)
  * leads → fluxo 'lead_capture' (captura de leads)
  * agendamentos → fluxo 'scheduling' (agendamento automático)
  * suporte/atendimento → fluxo 'support' (atendimento)
- Informe ao usuário que os fluxos foram criados automaticamente!

REGRAS:
- Faça UMA pergunta por vez
- Seja acolhedor e simpático
- Use as ferramentas para salvar informações assim que o usuário fornecer
- Se o usuário enviar várias informações de uma vez, salve todas
- Não pergunte duas vezes a mesma coisa
- **Antes de finalizar, SEMPRE crie pelo menos um fluxo de automação**
- Ao finalizar, use complete_onboarding com createDefaultFlows=true

DICAS:
- Se o usuário disser "pule" ou "depois", avance para a próxima pergunta
- Se o usuário parecer ansioso, resuma rapidamente e pergunte o essencial
- Sugira valores/opções para facilitar (ex: "Seu tom é mais formal ou informal?")
- Celebre a criação dos fluxos

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
  };
  $transaction: (fn: (tx: Record<string, unknown>) => Promise<unknown>) => Promise<unknown>;
}

/** Conversational onboarding service. */
@Injectable()
export class ConversationalOnboardingService {
  private readonly logger = new Logger(ConversationalOnboardingService.name);
  private openai: OpenAI;
  private readonly prismaExt: PrismaWithDynamicModels;

  constructor(
    private readonly prisma: PrismaService,
    private readonly planLimits: PlanLimitsService,
    private readonly toolsService: ConversationalOnboardingToolsService,
  ) {
    this.prismaExt = prisma as object as PrismaWithDynamicModels;
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  private parseToolArguments(rawArguments: string, functionName: string): Record<string, unknown> {
    try {
      const parsed: unknown = JSON.parse(rawArguments);
      return typeof parsed === 'object' && parsed !== null
        ? (parsed as Record<string, unknown>)
        : {};
    } catch (error) {
      this.logger.warn(
        `Invalid onboarding tool arguments for ${functionName}: ${this.toolsService.toErrorMessage(error)}`,
      );
      return {};
    }
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
      const args = this.parseToolArguments(toolCall.function.arguments, functionName);
      this.logger.log(`Executando tool: ${functionName}`, args);
      const result = await this.toolsService.executeToolCall(workspaceId, functionName, args);
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
      const args = this.parseToolArguments(toolCall.function.arguments, functionName);
      await this.toolsService.executeToolCall(workspaceId, functionName, args);
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
    const responsePayload = { content: responseText, done: true };
    res.write('data: ' + JSON.stringify(responsePayload) + '\n\n');
    res.end();
  }

  /** Inicia ou continua o onboarding conversacional */
  async chat(workspaceId: string, userMessage: string, res?: Response): Promise<string | void> {
    const history = await this.toolsService.getOnboardingHistory(workspaceId);

    const messages: OnboardingMessage[] = [
      { role: 'system', content: CONVERSATIONAL_ONBOARDING_PROMPT },
      ...history.map((h) => ({
        role: h.role as OnboardingMessage['role'],
        content: h.content,
      })),
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

      await this.toolsService.saveOnboardingMessage(workspaceId, 'user', userMessage);
      await this.toolsService.saveOnboardingMessage(workspaceId, 'assistant', responseText);

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

  /** Inicia o onboarding com uma mensagem de boas-vindas */
  async start(workspaceId: string): Promise<string> {
    await this.toolsService.clearOnboardingHistory(workspaceId);
    const welcomeMessage = await this.chat(workspaceId, 'Olá, quero configurar minha conta');
    return welcomeMessage as string;
  }

  /** Verifica status do onboarding */
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
          where: { workspaceId_key: { workspaceId, key: 'onboarding_completed' } },
        });

        const messages = await tx.kloelMemory.findMany({
          where: { workspaceId, key: { startsWith: 'onboarding_msg_' } },
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
}
