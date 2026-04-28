import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { Prisma } from '@prisma/client';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { renderTemplate } from '../common/sales-templates';
import { chatCompletionWithRetry } from '../kloel/openai-wrapper';
import { resolveBackendOpenAIModel } from '../lib/openai-models';
import { PrismaService } from '../prisma/prisma.service';
import { flowQueue } from '../queue/queue';

/** Lightweight shape used by autopilot cycle executor. */
export interface AutopilotConversation {
  id: string;
  workspaceId: string;
  contact: {
    id: string;
    phone: string;
    name?: string | null;
    tags?: Array<{ name: string }>;
    customFields?: Prisma.JsonValue;
    workspace?: Record<string, unknown>;
  };
  contactId?: string;
  messages: Array<{ direction: string; content: string | null; createdAt: Date }>;
  workspace?: Record<string, unknown>;
}

/** Analysis result from the OpenAI conversation analysis */
export interface ConversationAnalysis {
  intent?: string;
  sentiment?: string;
  buyingSignal?: boolean;
  stage?: string;
}

/**
 * Handles AI response generation, action execution, and compliance for autopilot cycles.
 * Extracted from AutopilotCycleService to keep each file under 400 lines.
 */
@Injectable()
export class AutopilotCycleExecutorService {
  private readonly logger = new Logger(AutopilotCycleExecutorService.name);
  private readonly openai: OpenAI | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly planLimits: PlanLimitsService,
  ) {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    this.openai = apiKey ? new OpenAI({ apiKey }) : null;
  }

  private readRecord(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  }

  async analyzeContext(messages: AutopilotConversation['messages']): Promise<ConversationAnalysis> {
    if (!this.openai) {
      return { intent: 'unknown', sentiment: 'neutral', buyingSignal: false };
    }

    const history = messages
      .map((m) => `${m.direction}: ${m.content}`)
      .reverse()
      .join('\n');
    const prompt = `
    Analyze this WhatsApp conversation.
    History:
    ${history}

    Return JSON:
    - intent: (question_price, question_product, complaint, greeting, scheduling, buying, objection)
    - sentiment: (positive, neutral, negative)
    - buyingSignal: (boolean) - Is the user ready to buy?
    - stage: (new, negotiation, closing, support)
    `;

    const completion = await chatCompletionWithRetry(this.openai, {
      model: resolveBackendOpenAIModel('brain', this.config),
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    });

    let analysisResult: ConversationAnalysis = {
      intent: 'unknown',
      sentiment: 'neutral',
      buyingSignal: false,
    };
    try {
      analysisResult = JSON.parse(completion.choices[0]?.message?.content || '{}');
    } catch {
      /* invalid JSON from model */
    }
    return analysisResult;
  }

  decideAction(
    analysis: { intent?: string; sentiment?: string; buyingSignal?: boolean; stage?: string },
    _conv: AutopilotConversation,
    isOptimalTime: boolean,
  ): string {
    const { intent, sentiment, buyingSignal, stage } = analysis;
    const hour = new Date().getHours();
    const isNight = hour > 22 || hour < 7;

    if (isNight) {
      if (buyingSignal) {
        return 'soft_close_night';
      }
      return 'auto_reply_night';
    }

    if (buyingSignal) {
      if (isOptimalTime) {
        return 'send_offer';
      }
      return 'send_offer_soft';
    }

    if (intent === 'question_price') {
      return 'send_price';
    }
    if (intent === 'scheduling') {
      return 'send_calendar';
    }
    if (intent === 'complaint') {
      return 'handover_human';
    }
    if (intent === 'objection') {
      return 'handle_objection';
    }

    if (stage === 'new') {
      return 'qualify';
    }
    if (stage === 'closing') {
      if (sentiment === 'positive' && !buyingSignal) {
        return 'try_upsell';
      }
      return 'send_cta';
    }

    return 'ai_chat';
  }

  async executeAction(
    action: string,
    conv: AutopilotConversation,
    compliance: { allowed: boolean; reason?: string },
    analysis?: ConversationAnalysis,
  ) {
    this.logger.log(`[Autopilot] Executing ${action} for ${conv.id}`);

    if (!compliance.allowed) {
      this.logger.warn(
        `[Autopilot] Skip compliance for ${conv.contact?.id || conv.contactId || 'unknown'}: ${compliance.reason}`,
      );
      try {
        await this.prisma.autopilotEvent.create({
          data: {
            workspaceId: conv.workspaceId,
            contactId: conv.contact?.id,
            intent: analysis?.intent || 'UNKNOWN',
            action,
            status: 'skipped',
            reason: compliance.reason,
            meta: { compliance: true },
          },
        });
      } catch {
        // optional table
      }
      return;
    }

    let responseText = '';

    switch (action) {
      case 'send_offer':
        responseText = await this.generateResponse('offer', conv, analysis);
        break;
      case 'send_offer_soft':
        responseText = await this.generateResponse('offer_soft', conv, analysis);
        break;
      case 'send_price':
        responseText = await this.generateResponse('price', conv, analysis);
        break;
      case 'follow_up':
        responseText = await this.generateResponse('follow_up', conv, analysis);
        break;
      case 'lead_unlocker':
        responseText = await this.generateResponse('lead_unlocker', conv, analysis);
        break;
      case 'handle_objection':
        responseText = await this.generateResponse('objection', conv, analysis);
        break;
      case 'qualify':
        responseText = await this.generateResponse('qualify', conv, analysis);
        break;
      case 'try_upsell':
        responseText = await this.generateResponse('upsell', conv, analysis);
        break;
      case 'send_calendar':
        responseText = renderTemplate('SEND_CALENDAR', {
          calendarLink:
            (this.readRecord(this.readRecord(conv?.workspace).providerSettings)
              .calendarLink as string) || undefined,
        });
        break;
      case 'soft_close_night':
        responseText =
          'Oi! Vi seu interesse. Já deixei tudo preparado para você. Amanhã cedo eu retomo para concluirmos, tudo bem?';
        break;
      case 'auto_reply_night':
        responseText =
          'Opa! Agora estou offline, mas já anotei sua dúvida. Amanhã 8h te respondo sem falta!';
        break;
      case 'ai_chat':
        responseText = await this.generateResponse('chat', conv, analysis);
        break;
      case 'handover_human':
        return;
      default:
        return;
    }

    if (responseText) {
      this.logger.log(`[Autopilot] Sent: "${responseText}"`);
      try {
        await this.planLimits.ensureMessageRate(conv.workspaceId);
        await flowQueue.add('send-message', {
          workspaceId: conv.workspaceId,
          to: conv.contact.phone,
          user: conv.contact.phone,
          message: responseText,
        });
      } catch (err: unknown) {
        this.logger.warn(
          `[Autopilot] Falha ao enfileirar envio: ${err instanceof Error ? err.message : 'unknown_error'}`,
        );
      }
    }
  }

  private async generateResponse(
    type: string,
    conv: AutopilotConversation,
    analysis?: ConversationAnalysis,
  ) {
    if (!this.openai) {
      return 'Olá, como posso ajudar?';
    }

    const templates: Record<string, string> = {
      offer:
        'Generate an irresistible offer closing for this context. Create Urgency. Keep it short.',
      offer_soft: 'Generate a gentle offer closing. Focus on value, no pressure.',
      price: 'Explain the price/value proposition. Be direct but persuasive.',
      follow_up: 'Re-engage this lead who went silent. Be polite but intriguing.',
      lead_unlocker:
        "The lead disappeared. Send a 'mental trigger' question to unlock them (e.g., 'Did you give up on X?'). Short and punchy.",
      objection: "Overcome the user's objection with empathy and authority.",
      qualify: 'Ask a qualifying question to understand their needs better.',
      upsell: 'Suggest a complementary product or upgrade (Upsell) naturally.',
      chat: "Reply naturally to the user's last message. Be helpful and concise.",
    };

    const prompt = `
    You are a top-tier sales assistant on WhatsApp.
    Context: User is ${analysis?.intent || 'interested'}.
    Task: ${templates[type] || templates.chat}
    Last Message: ${conv.messages[0]?.content}

    Write the WhatsApp message response (Portuguese Brazil). No quotes.
    `;

    if (conv?.workspaceId) {
      await this.planLimits.ensureTokenBudget(conv.workspaceId);
    }
    const completion = await chatCompletionWithRetry(this.openai, {
      model: resolveBackendOpenAIModel('writer', this.config),
      messages: [{ role: 'user', content: prompt }],
    });
    if (conv?.workspaceId) {
      await this.planLimits
        .trackAiUsage(conv.workspaceId, completion?.usage?.total_tokens ?? 500)
        .catch(() => {});
    }

    return completion.choices[0]?.message?.content;
  }
}
