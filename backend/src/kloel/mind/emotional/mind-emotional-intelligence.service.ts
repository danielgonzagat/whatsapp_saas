import { Injectable, Logger, Optional } from '@nestjs/common';
import { SpineEmitterService } from '../../spine/spine-emitter.service';
import { MindBeliefService } from '../inference/mind-belief.service';

/**
 * MindEmotionalIntelligenceService — pillar #4 ("genuine emotional intelligence")
 * of the unprecedented-cognition stack.
 *
 * Infers user emotional state from recent conversation lines using a
 * lexical + intensity heuristic and a bayesian shift over time using the
 * variance of co-located MindBelief rows (when available). All providers
 * are @Optional so the service degrades to a neutral/low-confidence read
 * when the substrate is missing — never throws on the conversation path.
 *
 * Performance contract: every public call returns within ~100ms because
 * inference is purely lexical (no I/O on the hot path beyond a single
 * MindBelief.list lookup that itself is bounded).
 */

export type EmotionalState = 'angry' | 'frustrated' | 'neutral' | 'excited' | 'curious';

export interface EmotionalInference {
  readonly state: EmotionalState;
  readonly confidence: number;
  readonly basis: string;
}

export type RecommendedTone = 'empathetic' | 'concise' | 'enthusiastic' | 'professional';

export interface ToneRecommendation {
  readonly tone: RecommendedTone;
  readonly rationale: string;
}

const PROCESSOR = 'mind-emotional-intelligence';
const PROCESSOR_VERSION = '1.0.0';
const SCHEMA_VERSION = '1.0.0';

const ANGER_LEXICON: ReadonlyArray<string> = [
  'odeio',
  'horrivel',
  'horrível',
  'pessimo',
  'péssimo',
  'lixo',
  'cancelar',
  'absurdo',
  'palhacada',
  'palhaçada',
  'roubo',
];
const FRUSTRATION_LEXICON: ReadonlyArray<string> = [
  'nao funciona',
  'não funciona',
  'travado',
  'demorando',
  'esperando',
  'cansado',
  'cansada',
  'desisti',
  'ainda nao',
  'ainda não',
];
const EXCITEMENT_LEXICON: ReadonlyArray<string> = [
  'amei',
  'incrivel',
  'incrível',
  'perfeito',
  'maravilhoso',
  'top',
  'show',
  'vamos',
];
const CURIOSITY_LEXICON: ReadonlyArray<string> = [
  'como funciona',
  'pode explicar',
  'duvida',
  'dúvida',
  'qual a diferenca',
  'qual a diferença',
];

function countMatches(haystack: string, needles: ReadonlyArray<string>): number {
  let count = 0;
  for (const needle of needles) {
    if (haystack.includes(needle)) {
      count += 1;
    }
  }
  return count;
}

function countIntensifiers(haystack: string): number {
  const exclamations = (haystack.match(/!/g) ?? []).length;
  const upperRuns = (haystack.match(/[A-ZÁ-Ú]{3,}/g) ?? []).length;
  return exclamations + upperRuns;
}

@Injectable()
export class MindEmotionalIntelligenceService {
  private readonly logger = new Logger(MindEmotionalIntelligenceService.name);

  public constructor(
    @Optional() private readonly spine?: SpineEmitterService,
    @Optional() private readonly beliefs?: MindBeliefService,
  ) {}

  public async inferEmotionalState(
    workspaceId: string,
    conversationId: string,
    recentMessages: ReadonlyArray<string>,
  ): Promise<EmotionalInference> {
    if (!workspaceId || recentMessages.length === 0) {
      return { state: 'neutral', confidence: 0, basis: 'empty-input' };
    }

    const haystack = recentMessages.join(' \n ').toLowerCase();
    const anger = countMatches(haystack, ANGER_LEXICON);
    const frustration = countMatches(haystack, FRUSTRATION_LEXICON);
    const excitement = countMatches(haystack, EXCITEMENT_LEXICON);
    const curiosity = countMatches(haystack, CURIOSITY_LEXICON);
    const intensity = countIntensifiers(haystack);

    const varianceShift = await this.readBeliefVariance(workspaceId, conversationId);

    const scores: Record<EmotionalState, number> = {
      angry: anger * 2 + intensity * 0.5,
      frustrated: frustration * 1.5 + varianceShift,
      excited: excitement * 1.5 + intensity * 0.25,
      curious: curiosity,
      neutral: 0.5,
    };

    let chosen: EmotionalState = 'neutral';
    let topScore = scores.neutral;
    (Object.keys(scores) as EmotionalState[]).forEach((state) => {
      if (scores[state] > topScore) {
        chosen = state;
        topScore = scores[state];
      }
    });

    const total = Object.values(scores).reduce((acc, n) => acc + n, 0) || 1;
    const confidence = Math.min(0.99, Math.max(0.05, topScore / total));

    const basis = `lexical{anger:${anger},frustration:${frustration},excitement:${excitement},curiosity:${curiosity}};intensity:${intensity};variance:${varianceShift.toFixed(3)}`;

    const result: EmotionalInference = { state: chosen, confidence, basis };
    await this.emitInferred(workspaceId, conversationId, result);
    return result;
  }

  public recommendTone(
    state: EmotionalState,
    _context: Readonly<Record<string, unknown>> = {},
  ): ToneRecommendation {
    switch (state) {
      case 'angry':
        return {
          tone: 'empathetic',
          rationale: 'angry state requires de-escalation via empathy',
        };
      case 'frustrated':
        return {
          tone: 'concise',
          rationale: 'frustrated state requires concise, action-oriented reply',
        };
      case 'excited':
        return {
          tone: 'enthusiastic',
          rationale: 'excited state mirrors enthusiasm to sustain momentum',
        };
      case 'curious':
        return {
          tone: 'professional',
          rationale: 'curious state expects clear, professional explanation',
        };
      case 'neutral':
      default:
        return {
          tone: 'professional',
          rationale: 'neutral state defaults to professional baseline',
        };
    }
  }

  private async readBeliefVariance(workspaceId: string, conversationId: string): Promise<number> {
    if (!this.beliefs) {
      return 0;
    }
    try {
      const rows = await this.beliefs.list(workspaceId, 'conversation.sentiment', conversationId);
      if (!rows || rows.length === 0) {
        return 0;
      }
      const avg = rows.reduce((acc, b) => acc + (b.variance ?? 0), 0) / rows.length;
      return Math.min(2, Math.max(0, avg));
    } catch (err: unknown) {
      this.logger.warn(
        `belief variance read failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return 0;
    }
  }

  private async emitInferred(
    workspaceId: string,
    conversationId: string,
    inference: EmotionalInference,
  ): Promise<void> {
    if (!this.spine) {
      return;
    }
    try {
      await this.spine.emit({
        eventName: 'cognition.emotional.inferred',
        workspaceId,
        entityRef: { entityType: 'conversation', entityId: conversationId },
        truthMode: 'inferred',
        provenance: {
          source: 'production',
          processor: PROCESSOR,
          processorVersion: PROCESSOR_VERSION,
          schemaVersion: SCHEMA_VERSION,
        },
        payload: {
          state: inference.state,
          confidence: inference.confidence,
          basis: inference.basis,
        },
      });
    } catch (err: unknown) {
      this.logger.warn(
        `cognition.emotional.inferred emission failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
