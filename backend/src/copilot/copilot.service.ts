import { Injectable, Logger, Optional } from '@nestjs/common';
import OpenAI from 'openai';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { chatCompletionWithRetry } from '../kloel/openai-wrapper';
import { StructuredLogger } from '../logging/structured-logger';
import {
  openCopilotLoop,
  closeCopilotLoopSuccess,
  closeCopilotLoopError,
  type CopilotLoopHandle,
  type CopilotLoopServices,
} from '../kloel/kloel-copilot-loop.helpers';
import { DecisionOutcomeService } from '../kloel/decision-outcome.service';
import { MindBeliefService } from '../kloel/mind/inference/mind-belief.service';
import { MindSurpriseService } from '../kloel/mind/inference/mind-surprise.service';
import { MindGlobalPriorService } from '../kloel/mind/memory/mind-global-prior.service';
import { MindPredictorService } from '../kloel/mind/inference/mind-predictor.service';
import { resolveBackendOpenAIModel } from '../lib/openai-models';
import { PrismaService } from '../prisma/prisma.service';
import { emitCopilotChatReplyPercept } from './copilot-percept-emit.helper';

const PRE_O_VALOR_QUANTO_CUSTA_RE = /preço|valor|quanto|custa/i;
const PAGO_PAGUEI_COMPRO_QUERO_RE = /pago|paguei|compro|quero/i;
const DUVIDA_COMO_FUNCIONA_RE = /duvida|como|funciona/i;

/** Copilot service. */
@Injectable()
export class CopilotService {
  private readonly logger = new Logger(CopilotService.name);
  // One-Mind unification: a StructuredLogger for the cognition loop only (the
  // reused decision-outcome helpers require its `warn(msg, ctx)` /
  // `log(payload)` shape). The existing plain `logger` above is untouched, so
  // every current Copilot log line stays byte-identical.
  private readonly loopLogger = StructuredLogger.from(CopilotService.name);

  constructor(
    private prisma: PrismaService,
    private readonly planLimits: PlanLimitsService,
    // One-Mind unification: optional cognition services for the COPILOT learning
    // loop — the SAME ones the reply engine / think loop use, REUSED not
    // re-implemented. All @Optional() so flag-off (and DI contexts that don't
    // provide them) resolve to undefined and the reused fire-and-forget helpers
    // short-circuit. Placed AFTER the existing params so positional construction
    // (`new CopilotService(prisma, planLimits)`) stays compatible.
    @Optional() private readonly decisionOutcomeService?: DecisionOutcomeService,
    @Optional() private readonly mindBeliefService?: MindBeliefService,
    @Optional() private readonly mindSurpriseService?: MindSurpriseService,
    @Optional() private readonly mindGlobalPriorService?: MindGlobalPriorService,
    @Optional() private readonly mindPredictorService?: MindPredictorService,
  ) {}

  /** Bundle the optional cognition services for the copilot-loop helpers. */
  private get copilotLoopServices(): CopilotLoopServices {
    return {
      decisionOutcomeService: this.decisionOutcomeService,
      mindBeliefService: this.mindBeliefService,
      mindSurpriseService: this.mindSurpriseService,
      mindGlobalPriorService: this.mindGlobalPriorService,
      mindPredictorService: this.mindPredictorService,
    };
  }

  private buildPrompt(history: string, kbSnippet?: string) {
    let prompt = `Você é um copilot de vendas no WhatsApp. Gere uma resposta concisa, humana e útil. Foque em avançar a conversa com CTA claro. Nunca repita pergunta, assunto, oferta ou dado que já apareçam no histórico integral abaixo.`;
    if (kbSnippet) {
      prompt += `\nContexto da base de conhecimento:\n${kbSnippet}`;
    }
    prompt += `\nHistórico integral:\n${history}\n\nResponda em uma única mensagem.`;
    return prompt;
  }

  /** Suggest. */
  async suggest(opts: {
    workspaceId: string;
    contactId?: string;
    phone?: string;
    kbSnippet?: string;
  }) {
    const { workspaceId, contactId, phone, kbSnippet } = opts;

    const contact = contactId
      ? await this.prisma.contact.findFirst({ where: { id: contactId, workspaceId } })
      : await this.prisma.contact.findUnique({
          where: { workspaceId_phone: { workspaceId, phone: phone || '' } },
        });

    if (!contact) {
      return {
        suggestion: 'Posso ajudar com algo? Conte-me mais para eu responder melhor.',
      };
    }

    const msgs = await this.prisma.message.findMany({
      where: { workspaceId, contactId: contact.id },
      select: { direction: true, content: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    const history = msgs
      .reverse()
      .map((m) => `[${m.direction === 'INBOUND' ? 'Lead' : 'Você'}] ${m.content}`)
      .join('\n');

    // pegar API key do workspace se houver
    const ws = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
    });
    const settings = (ws?.providerSettings || {}) as Record<string, unknown>;
    const openaiSettings = (
      typeof settings?.openai === 'object' && settings.openai ? settings.openai : {}
    ) as Record<string, unknown>;
    const apiKey =
      (typeof openaiSettings.apiKey === 'string' ? openaiSettings.apiKey : '') ||
      process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return {
        suggestion:
          'Vi sua mensagem! Posso te ajudar a decidir e já te enviar os próximos passos agora.',
      };
    }

    const client = new OpenAI({ apiKey });

    // One-Mind unification: open the cognition learning loop BEFORE the LLM
    // call — mirrors the sync/think paths (recordChatReplyDecision +
    // predictChatReply ahead of the model). Returns null + does nothing when the
    // flag is OFF, so the critical path below is byte-identical to legacy then.
    const copilotLoop: CopilotLoopHandle | null = openCopilotLoop(
      this.copilotLoopServices,
      this.loopLogger,
      { workspaceId, messageLength: history.length },
    );

    try {
      const prompt = this.buildPrompt(history, kbSnippet);
      await this.planLimits.ensureTokenBudget(workspaceId);
      const completion = await chatCompletionWithRetry(client, {
        model: resolveBackendOpenAIModel('writer'),
        messages: [
          {
            role: 'system',
            content: 'Você é um assistente de vendas no WhatsApp. Responda curto e direto.',
          },
          { role: 'user', content: prompt },
        ],
        max_tokens: 400,
      });
      await this.planLimits
        .trackAiUsage(workspaceId, completion?.usage?.total_tokens ?? 500)
        .catch(() => {});
      const suggestion = completion.choices[0]?.message?.content || '';
      const tokens = completion?.usage?.total_tokens ?? 500;
      this.logger.log(
        `copilot-suggest ws=${workspaceId} model=writer baseLen=${prompt.length} outLen=${suggestion.length} tokens=${tokens}`,
      );
      if (!suggestion || suggestion.trim().length < 2) {
        this.logger.warn(`copilot-suggest short output ws=${workspaceId} len=${suggestion.length}`);
        // Short/empty model output → degraded outcome (0): we return canned
        // fallback text instead of a real reply. Mirrors the sync path's
        // `assistantMessage.length > 0 ? 1 : 0`. Fire-and-forget; null-safe.
        closeCopilotLoopSuccess(this.copilotLoopServices, this.loopLogger, copilotLoop, 0);
        // ADDITIVE, flag-gated (KLOEL_COPILOT_PERCEPT_ENABLED, DEFAULT ON),
        // fire-and-forget: after the learning loop closes, emit ONE canonical
        // `cognition.copilot.chat_reply` percept into the Mind spine outbox so the
        // cognition loop perceives this Copilot turn (degraded outcome). Never
        // blocks or breaks the suggestion — mirrors the Voice/CIA percept wiring.
        void emitCopilotChatReplyPercept(this.prisma, this.logger, {
          workspaceId,
          conversationId: contact.id,
          turn: msgs.length,
          replyLength: suggestion.length,
          replyOutcome: 0,
        });
        return {
          suggestion:
            'Vi sua mensagem! Posso te ajudar a decidir e já te enviar os próximos passos agora.',
        };
      }
      // Real (non-empty) model reply → outcome 1. Close the loop AFTER the reply
      // is produced — mirrors the sync path's success arm. Fire-and-forget;
      // no-op when the handle is null (flag OFF).
      closeCopilotLoopSuccess(this.copilotLoopServices, this.loopLogger, copilotLoop, 1);
      // ADDITIVE, flag-gated (KLOEL_COPILOT_PERCEPT_ENABLED, DEFAULT ON),
      // fire-and-forget: after the learning loop closes, emit ONE canonical
      // `cognition.copilot.chat_reply` percept into the Mind spine outbox so the
      // cognition loop perceives this Copilot turn (real reply). Never blocks or
      // breaks the suggestion — mirrors the Voice/CIA percept wiring.
      void emitCopilotChatReplyPercept(this.prisma, this.logger, {
        workspaceId,
        conversationId: contact.id,
        turn: msgs.length,
        replyLength: suggestion.length,
        replyOutcome: 1,
      });
      return { suggestion };
    } catch (error: unknown) {
      // Reply FAILED before producing an answer → close as a failed outcome
      // (mirrors the sync path's catch arm). Fire-and-forget; no-op when the
      // handle is null (flag OFF). Wrapped so a loop failure can never mask the
      // user-facing fallback below.
      closeCopilotLoopError(this.copilotLoopServices, this.loopLogger, copilotLoop);
      this.logger.warn(
        `Copilot suggest error: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      return {
        suggestion:
          'Estou aqui para ajudar! Quer que eu envie um resumo da oferta, um preço ou marque um horário rápido?',
      };
    }
  }

  /**
   * Gera múltiplas sugestões de resposta para o operador escolher
   */
  async suggestMultiple(opts: {
    workspaceId: string;
    contactId?: string;
    phone?: string;
    kbSnippet?: string;
    count?: number;
  }): Promise<{ suggestions: string[]; context?: string }> {
    const { workspaceId, contactId, phone, kbSnippet, count = 3 } = opts;

    const contact = contactId
      ? await this.prisma.contact.findFirst({ where: { id: contactId, workspaceId } })
      : await this.prisma.contact.findUnique({
          where: { workspaceId_phone: { workspaceId, phone: phone || '' } },
        });

    if (!contact) {
      return {
        suggestions: [
          'Olá! Como posso ajudar você hoje?',
          'Oi! Estou aqui para qualquer dúvida.',
          'Em que posso te ajudar agora?',
        ],
      };
    }

    const msgs = await this.prisma.message.findMany({
      where: { workspaceId, contactId: contact.id },
      select: { direction: true, content: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    const history = msgs
      .reverse()
      .map((m) => `[${m.direction === 'INBOUND' ? 'Lead' : 'Você'}] ${m.content}`)
      .join('\n');

    // Pegar API key do workspace se houver
    const ws = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
    });
    const settings = (ws?.providerSettings || {}) as Record<string, unknown>;
    const openaiSettings = (
      typeof settings?.openai === 'object' && settings.openai ? settings.openai : {}
    ) as Record<string, unknown>;
    const apiKey =
      (typeof openaiSettings.apiKey === 'string' ? openaiSettings.apiKey : '') ||
      process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return {
        suggestions: [
          'Posso te ajudar a escolher a melhor opção!',
          'Quer que eu envie mais detalhes?',
          'Que tal agendarmos uma conversa rápida?',
        ],
      };
    }

    const client = new OpenAI({ apiKey });

    try {
      const prompt = `Você é um copilot de vendas no WhatsApp.
Baseado no histórico abaixo, gere ${count} sugestões de resposta diferentes.
${kbSnippet ? `Contexto da base de conhecimento:\n${kbSnippet}\n` : ''}
Histórico integral:
${history}

Retorne APENAS um JSON com o formato: { "suggestions": ["resposta1", "resposta2", "resposta3"] }
Cada resposta deve ser curta, direta e com CTA claro. Varie o tom: 1) amigável 2) profissional 3) urgente.`;

      await this.planLimits.ensureTokenBudget(workspaceId);
      const completion = await chatCompletionWithRetry(client, {
        model: resolveBackendOpenAIModel('writer'),
        messages: [
          {
            role: 'system',
            content: 'Você gera sugestões de resposta em formato JSON.',
          },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 800,
      });

      await this.planLimits
        .trackAiUsage(workspaceId, completion?.usage?.total_tokens ?? 500)
        .catch(() => {});
      const content = completion.choices[0]?.message?.content || '{}';
      const tokens = completion?.usage?.total_tokens ?? 500;
      this.logger.log(
        `copilot-suggest-multiple ws=${workspaceId} model=writer baseLen=${prompt.length} outLen=${content.length} tokens=${tokens}`,
      );
      const parsed = JSON.parse(content) as { suggestions?: string[] };

      // Determinar contexto da conversa
      const lastMessage = msgs[0]?.content || '';
      let context = 'geral';
      if (lastMessage.match(PRE_O_VALOR_QUANTO_CUSTA_RE)) {
        context = 'preço';
      } else if (lastMessage.match(PAGO_PAGUEI_COMPRO_QUERO_RE)) {
        context = 'compra';
      } else if (lastMessage.match(DUVIDA_COMO_FUNCIONA_RE)) {
        context = 'dúvida';
      }

      return {
        suggestions: parsed.suggestions || [],
        context,
      };
    } catch (error: unknown) {
      this.logger.warn(
        `Copilot suggestMultiple error: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      return {
        suggestions: [
          'Estou aqui para ajudar! Posso tirar suas dúvidas.',
          'Quer que eu envie mais informações sobre nossos produtos?',
          'Que tal fecharmos agora? Tenho condições especiais!',
        ],
      };
    }
  }
}
