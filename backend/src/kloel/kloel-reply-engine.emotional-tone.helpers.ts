import type { StructuredLogger } from '../logging/structured-logger';
import type {
  EmotionalInference,
  MindEmotionalIntelligenceService,
  RecommendedTone,
  ToneRecommendation,
} from './mind/emotional/mind-emotional-intelligence.service';
import type { ReplyMessage } from './kloel-reply-engine.types';

/**
 * Y-8 frontier capability #4 — emotional-intelligence wiring for the reply
 * engine. The {@link MindEmotionalIntelligenceService} already computes a
 * situational emotional state + a recommended tone but those signals were
 * never applied to generation. These helpers bridge that gap:
 *
 *  - {@link buildToneDirective} infers the contact's situational emotional
 *    state (from the inbound message + recent history), maps it to a tone,
 *    applies a guardrail that blocks an aggressive/high-energy tone for a
 *    negative-history contact, and returns a directive string to inject into
 *    the generation prompt.
 *  - {@link logPostReplySentiment} feeds the assistant reply back through the
 *    same inference path so the post-reply sentiment signal is emitted and
 *    feeds future belief variance.
 *
 * Both helpers are strictly additive and fail-open: when the EI service is
 * unavailable or throws, they return null / no-op and the reply path proceeds
 * exactly as before.
 */

/** Tones that mirror or amplify the contact's energy. Unsafe for a contact
 * whose situational read is already negative — they read as aggressive. */
const AGGRESSIVE_TONES: ReadonlySet<RecommendedTone> = new Set<RecommendedTone>([
  'enthusiastic',
]);

/** Situational states that mark the contact as having a negative read right
 * now — the guardrail trigger. */
const NEGATIVE_STATES: ReadonlySet<EmotionalInference['state']> = new Set<
  EmotionalInference['state']
>(['angry', 'frustrated']);

export interface ToneDirective {
  readonly state: EmotionalInference['state'];
  readonly tone: RecommendedTone;
  readonly confidence: number;
  /** True when the guardrail downgraded an aggressive tone to a safe one. */
  readonly guardrailApplied: boolean;
  /** Ready-to-inject natural-language directive for the generation prompt. */
  readonly directive: string;
}

const TONE_INSTRUCTIONS: Readonly<Record<RecommendedTone, string>> = {
  empathetic:
    'Responda com empatia e acolhimento, reconhecendo o incômodo antes de propor a solução.',
  concise: 'Responda de forma objetiva e direta ao ponto, sem rodeios, priorizando a próxima ação.',
  enthusiastic: 'Responda com entusiasmo e energia, celebrando o momento positivo do contato.',
  professional: 'Responda com clareza profissional e neutra, explicando o necessário com precisão.',
};

/**
 * Applies the negative-history guardrail: if the contact's situational read is
 * negative and the recommended tone is aggressive/high-energy, downgrade it to
 * empathetic. Returns the (possibly adjusted) tone and whether it changed.
 */
export function applyToneGuardrail(
  state: EmotionalInference['state'],
  recommendation: ToneRecommendation,
): { tone: RecommendedTone; guardrailApplied: boolean } {
  if (NEGATIVE_STATES.has(state) && AGGRESSIVE_TONES.has(recommendation.tone)) {
    return { tone: 'empathetic', guardrailApplied: true };
  }
  return { tone: recommendation.tone, guardrailApplied: false };
}

/**
 * Infers the situational tone for the contact and produces a tone directive to
 * inject into the generation prompt. Fail-open: returns null when the EI
 * service is missing or any inference step throws.
 */
export async function buildToneDirective(
  ei: MindEmotionalIntelligenceService | undefined,
  params: {
    workspaceId?: string | null;
    conversationId?: string | null;
    message: string;
    recentMessages?: ReadonlyArray<ReplyMessage>;
    logger?: Pick<StructuredLogger, 'warn'>;
  },
): Promise<ToneDirective | null> {
  if (!ei || !params.workspaceId) {
    return null;
  }
  try {
    const historyLines = (params.recentMessages ?? [])
      .filter((m) => m.role === 'user')
      .map((m) => m.content);
    const recent = [...historyLines, params.message].filter(
      (line): line is string => typeof line === 'string' && line.trim().length > 0,
    );
    if (recent.length === 0) {
      return null;
    }
    const inference = await ei.inferEmotionalState(
      params.workspaceId,
      params.conversationId ?? params.workspaceId,
      recent,
    );
    const recommendation = ei.recommendTone(inference.state, {
      confidence: inference.confidence,
    });
    const { tone, guardrailApplied } = applyToneGuardrail(inference.state, recommendation);
    const instruction = TONE_INSTRUCTIONS[tone];
    const directive = [
      'DIRETRIZ DE TOM (inteligência emocional):',
      `- Estado situacional do contato: ${inference.state} (confiança ${inference.confidence.toFixed(2)}).`,
      `- Tom recomendado: ${tone}. ${instruction}`,
      guardrailApplied
        ? '- Guardrail: histórico negativo detectado — tom agressivo/eufórico bloqueado, use empatia.'
        : null,
    ]
      .filter((line): line is string => line !== null)
      .join('\n');
    return {
      state: inference.state,
      tone,
      confidence: inference.confidence,
      guardrailApplied,
      directive,
    };
  } catch (err: unknown) {
    params.logger?.warn('kloel_emotional_tone_directive_failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Feeds the assistant reply back through the EI inference path so the
 * post-reply sentiment signal is emitted (and persisted into belief variance)
 * for the next turn. Fail-open and fire-and-forget safe.
 */
export async function logPostReplySentiment(
  ei: MindEmotionalIntelligenceService | undefined,
  params: {
    workspaceId?: string | null;
    conversationId?: string | null;
    assistantMessage: string;
    logger?: Pick<StructuredLogger, 'warn'>;
  },
): Promise<EmotionalInference | null> {
  if (!ei || !params.workspaceId || !params.assistantMessage.trim()) {
    return null;
  }
  try {
    return await ei.inferEmotionalState(
      params.workspaceId,
      params.conversationId ?? params.workspaceId,
      [params.assistantMessage],
    );
  } catch (err: unknown) {
    params.logger?.warn('kloel_emotional_post_reply_log_failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
