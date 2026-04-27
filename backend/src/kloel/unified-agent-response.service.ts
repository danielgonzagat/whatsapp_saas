import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { extractFallbackTopic as extractFallbackTopicValue } from '../whatsapp/whatsapp-normalization.util';
import { chatCompletionWithFallback } from './openai-wrapper';
import type { ActionEntry } from './unified-agent.service';
import {
  AGENDAR_AGENDA_REUNI_A_RE,
  CANCEL_CANCELAR_REEMBOL_RE,
  JSON_RE,
  OL__A__BOM_DIA_BOA_TARD_RE,
  P_EXTENDED_PICTOGRAPHIC_G_RE,
  P_EXTENDED_PICTOGRAPHIC_RE,
  PATTERN_RE_2,
  PATTERN_RE_3,
  PRE_C__O_QUANTO_VALOR_C_RE,
  S_______S_RE,
  WHITESPACE_G_RE,
  WHITESPACE_RE,
  safeForRegex,
} from './unified-agent-response.regex';

/**
 * Handles response generation, reply style, and fallback logic
 * for the Unified Agent.
 */
@Injectable()
export class UnifiedAgentResponseService {
  private readonly logger = new Logger(UnifiedAgentResponseService.name);
  constructor(private readonly planLimits: PlanLimitsService) {}
  async composeWriterReply(
    openai: OpenAI | null,
    writerModel: string,
    fallbackWriterModel: string,
    params: {
      workspaceId?: string;
      customerMessage: string;
      assistantDraft?: string | null;
      actions: ActionEntry[];
      historyTurns: number;
    },
  ): Promise<string | undefined> {
    const { workspaceId, customerMessage, assistantDraft, actions, historyTurns } = params;
    const fallbackReply = this.finalizeReplyStyle(customerMessage, assistantDraft, historyTurns);

    if (!openai) return fallbackReply;

    const compactActions = actions.map((action) => ({
      tool: action.tool,
      args: action.args,
      result: typeof action.result === 'string' ? action.result.slice(0, 280) : action.result,
    }));

    try {
      if (workspaceId) await this.planLimits.ensureTokenBudget(workspaceId);
      const writerResponse = await chatCompletionWithFallback(
        openai,
        {
          model: writerModel,
          messages: [
            {
              role: 'system',
              content:
                'Você escreve a resposta final para o cliente no WhatsApp. Soe humano, consultivo, vivo e comercial sem parecer script. Primeiro responda o que o cliente quis dizer, depois conduza. Valide a emoção quando houver dúvida, frustração ou insegurança. Não mencione raciocínio interno, tools ou bastidores. Não finja ser humano; se isso fosse perguntado diretamente, a resposta correta seria que você é a assistente virtual da empresa.',
            },
            {
              role: 'user',
              content: [
                `Mensagem do cliente: ${customerMessage}`,
                `Rascunho do cérebro: ${assistantDraft || 'sem rascunho'}`,
                `Ações executadas: ${JSON.stringify(compactActions)}`,
                this.buildReplyStyleInstruction(customerMessage, historyTurns),
                'Escreva apenas a mensagem final pronta para enviar.',
              ].join('\n\n'),
            },
          ],
          temperature: 0.7,
          max_tokens: 500,
        },
        fallbackWriterModel,
      );
      if (workspaceId) {
        await this.planLimits
          .trackAiUsage(workspaceId, writerResponse?.usage?.total_tokens ?? 500)
          .catch(() => {});
      }
      return this.finalizeReplyStyle(
        customerMessage,
        writerResponse.choices[0]?.message?.content || assistantDraft,
        historyTurns,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : typeof err === 'string' ? err : 'unknown';
      this.logger.warn(`Writer model failed: ${msg}`);
      return fallbackReply;
    }
  }

  buildReplyStyleInstruction(message: string, historyTurns = 0): string {
    const budget = this.computeReplyStyleBudget(message, historyTurns);
    return `O cliente usou ${budget.words} palavra(s) e a conversa já tem ${historyTurns} turno(s) relevantes. Responda com no máximo ${budget.maxSentences} frase(s) e ${budget.maxWords} palavra(s). Pergunta curta pede resposta curta. Conversa longa permite resposta mais rica, mais humana e mais convincente. Termine, quando fizer sentido, com uma pergunta curta que puxe a próxima resposta do cliente.`;
  }

  finalizeReplyStyle(
    customerMessage: string,
    reply?: string | null,
    historyTurns = 0,
  ): string | undefined {
    const normalized = String(reply || '')
      .replace(WHITESPACE_G_RE, ' ')
      .replace(S_______S_RE, ' ')
      .trim();

    if (!normalized) return undefined;

    const budget = this.computeReplyStyleBudget(customerMessage, historyTurns);
    const allowEmoji = P_EXTENDED_PICTOGRAPHIC_RE.test(safeForRegex(customerMessage));
    const withoutEmoji = allowEmoji
      ? normalized
      : normalized.replace(P_EXTENDED_PICTOGRAPHIC_G_RE, '').trim();

    const sentenceMatches =
      withoutEmoji
        .match(PATTERN_RE_2)
        ?.map((part) => part.trim())
        .filter(Boolean) || [];
    const effectiveSentenceBudget =
      sentenceMatches.length > budget.maxSentences &&
      sentenceMatches.length > 1 &&
      this.countWords(sentenceMatches[0]) <= 2
        ? Math.min(budget.maxSentences + 1, sentenceMatches.length)
        : budget.maxSentences;
    const limitedSentences = (sentenceMatches.length > 0 ? sentenceMatches : [withoutEmoji]).slice(
      0,
      effectiveSentenceBudget,
    );
    const selectedSentences: string[] = [];
    let selectedWords = 0;

    for (const sentence of limitedSentences) {
      const sentenceWords = this.countWords(sentence);
      if (!selectedSentences.length) {
        selectedSentences.push(sentence);
        selectedWords = sentenceWords;
        continue;
      }
      if (selectedSentences.length >= effectiveSentenceBudget) break;
      if (selectedWords + sentenceWords > budget.maxWords) break;
      selectedSentences.push(sentence);
      selectedWords += sentenceWords;
    }

    const finalReply = selectedSentences.join(' ').trim() || withoutEmoji;
    return finalReply || undefined;
  }

  async buildQuotedReplyPlan(
    openai: OpenAI | null,
    writerModel: string,
    fallbackWriterModel: string,
    planLimits: PlanLimitsService,
    params: {
      workspaceId: string;
      draftReply: string;
      customerMessages: Array<{ content: string; quotedMessageId: string }>;
    },
  ): Promise<Array<{ quotedMessageId: string; text: string }>> {
    const normalizedMessages = (params.customerMessages || [])
      .map((message) => ({
        content: String(message.content || '').trim(),
        quotedMessageId: String(message.quotedMessageId || '').trim(),
      }))
      .filter((message) => message.content && message.quotedMessageId);

    if (!normalizedMessages.length) return [];

    if (normalizedMessages.length === 1 || !openai) {
      return this.buildMirroredReplyPlanFallback(normalizedMessages, params.draftReply);
    }

    try {
      await planLimits.ensureTokenBudget(params.workspaceId);
      const response = await chatCompletionWithFallback(
        openai,
        {
          model: writerModel,
          messages: [
            {
              role: 'system',
              content:
                'Você organiza respostas curtas para WhatsApp. Retorne JSON puro com o formato {"replies":[{"index":1,"text":"..."},...]}. Deve haver exatamente uma resposta por mensagem do cliente, na mesma ordem. Cada resposta deve ser curta, humana e diretamente responsiva.',
            },
            {
              role: 'user',
              content: `Rascunho geral da resposta:\n${params.draftReply}\n\nMensagens do cliente:\n${normalizedMessages
                .map((message, index) => `[${index + 1}] ${message.content}`)
                .join('\n')}`,
            },
          ],
          temperature: 0.4,
          top_p: 0.9,
        },
        fallbackWriterModel,
      );
      await planLimits
        .trackAiUsage(params.workspaceId, response?.usage?.total_tokens ?? 500)
        .catch(() => {});

      const raw = String(response.choices?.[0]?.message?.content || '')
        .replace(JSON_RE, '')
        .replace(PATTERN_RE_3, '')
        .trim();
      // PULSE:OK — inside try/catch; parser confused by multi-line template literal
      const parsed = JSON.parse(raw);
      const replies = Array.isArray(parsed?.replies) ? parsed.replies : [];

      if (replies.length !== normalizedMessages.length) {
        return this.buildMirroredReplyPlanFallback(normalizedMessages, params.draftReply);
      }

      return normalizedMessages.map((message, index) => ({
        quotedMessageId: message.quotedMessageId,
        text:
          this.finalizeReplyStyle(message.content, replies[index]?.text || params.draftReply, 0) ||
          params.draftReply,
      }));
    } catch {
      return this.buildMirroredReplyPlanFallback(normalizedMessages, params.draftReply);
    }
  }

  private buildMirroredReplyPlanFallback(
    customerMessages: Array<{ content: string; quotedMessageId: string }>,
    draftReply: string,
  ): Array<{ quotedMessageId: string; text: string }> {
    const normalizedDraft =
      this.finalizeReplyStyle(
        customerMessages[customerMessages.length - 1]?.content || '',
        draftReply,
        customerMessages.length,
      ) || draftReply;
    const sentences = normalizedDraft
      .match(PATTERN_RE_2)
      ?.map((item) => item.trim())
      .filter(Boolean) || [normalizedDraft];

    if (customerMessages.length === 1) {
      return [
        {
          quotedMessageId: customerMessages[0].quotedMessageId,
          text:
            this.finalizeReplyStyle(customerMessages[0].content, normalizedDraft, 0) ||
            normalizedDraft,
        },
      ];
    }

    return customerMessages.map((message, index) => {
      const sentence =
        sentences[index] ||
        (index === customerMessages.length - 1 ? normalizedDraft : `Entendi. ${normalizedDraft}`);
      return {
        quotedMessageId: message.quotedMessageId,
        text: this.finalizeReplyStyle(message.content, sentence, 0) || sentence,
      };
    });
  }

  buildFallbackResult(message: string): {
    actions: ActionEntry[];
    response?: string;
    intent: string;
    confidence: number;
  } {
    const normalized = (message || '').toLowerCase();
    const topic = extractFallbackTopicValue(message);

    if (PRE_C__O_QUANTO_VALOR_C_RE.test(normalized)) {
      return {
        actions: [],
        response: this.finalizeReplyStyle(
          message,
          topic
            ? `Boa, você foi direto ao ponto. Posso confirmar preço, pagamento e disponibilidade de ${topic}. Quer que eu siga por aí?`
            : 'Boa, sem rodeio fica melhor. Posso confirmar preço, pagamento e disponibilidade. Me diz o produto ou procedimento.',
        ),
        intent: 'BUYING_INTENT',
        confidence: 0.45,
      };
    }

    if (AGENDAR_AGENDA_REUNI_A_RE.test(normalized)) {
      return {
        actions: [],
        response: this.finalizeReplyStyle(
          message,
          'Perfeito, organização ainda existe. Me diz o dia ou horário e eu organizo isso com você.',
        ),
        intent: 'SCHEDULING',
        confidence: 0.4,
      };
    }

    if (CANCEL_CANCELAR_REEMBOL_RE.test(normalized)) {
      return {
        actions: [],
        response: this.finalizeReplyStyle(
          message,
          'Entendi. Me diz o que aconteceu para eu te ajudar nisso agora.',
        ),
        intent: 'CHURN_RISK',
        confidence: 0.4,
      };
    }

    if (OL__A__BOM_DIA_BOA_TARD_RE.test(normalized)) {
      return {
        actions: [],
        response: this.finalizeReplyStyle(message, 'Oi. Como posso te ajudar?'),
        intent: 'GREETING',
        confidence: 0.35,
      };
    }

    return {
      actions: [],
      response: this.finalizeReplyStyle(
        message,
        topic
          ? `Entendi. Você falou de ${topic}. Me diz o que quer confirmar e eu te respondo sem enrolação.`
          : 'Entendi. Me diz o produto, exame ou objetivo e eu sigo com a informação certa, sem teatro.',
      ),
      intent: 'UNKNOWN',
      confidence: 0.2,
    };
  }

  extractIntent(actions: Array<{ tool: string; args: unknown }>, _message: string): string {
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
      if (toolIntentMap[action.tool]) return toolIntentMap[action.tool];
    }
    return 'FOLLOW_UP';
  }

  // tokenBudget: ensureTokenBudget called before every chatCompletionWithFallback invocation
  calculateConfidence(
    actions: ActionEntry[],
    response: OpenAI.Chat.Completions.ChatCompletion,
  ): number {
    let confidence = 0.5;
    confidence += Math.min(actions.length * 0.1, 0.3);
    if (response.choices[0].message.tool_calls?.length) confidence += 0.15;
    return Math.min(confidence, 1);
  }

  countWords(value?: string | null): number {
    return Math.max(
      1,
      String(value || '')
        .trim()
        .split(WHITESPACE_RE)
        .filter(Boolean).length,
    );
  }

  computeReplyStyleBudget(
    message: string,
    historyTurns = 0,
  ): { words: number; maxSentences: number; maxWords: number } {
    const words = this.countWords(message);
    let maxSentences = words <= 8 ? 2 : words <= 20 ? 3 : 4;
    let maxWords = Math.min(
      140,
      words <= 4 ? 26 : words <= 12 ? Math.max(24, words + 12) : Math.ceil(words * 1.8),
    );
    if (historyTurns >= 6) {
      maxSentences += 1;
      maxWords += 24;
    }
    if (historyTurns >= 10) {
      maxSentences += 1;
      maxWords += 36;
    }
    return { words, maxSentences: Math.min(6, maxSentences), maxWords: Math.min(220, maxWords) };
  }
}
