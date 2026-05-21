import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { SpineSignal, Hypothesis } from './types';

const MIN_CONFIDENCE_FOR_HYPOTHESIS = 0.4;
const MARKET_ENTRY = {
  id: 'producer-validation-infoproduct-direct-checkout',
  stage: 'validacao',
  businessModel: 'infoproduto + checkout_direto + B2C + self-serve',
  journey:
    'lead inseguro -> objecao real -> silencio -> retomada honesta -> checkout -> pos-venda sem arrependimento',
} as const;

const SIGNAL_PATTERNS: Array<{
  readonly eventPrefix: string;
  readonly domain: string;
  readonly template: (signal: SpineSignal) => Hypothesis | null;
}> = [
  {
    eventPrefix: 'commerce.lead.',
    domain: 'lead_response',
    template: (signal: SpineSignal) => {
      if (signal.eventName === 'commerce.lead.replied') {
        return null; // fact, not signal for hypothesis
      }
      if (signal.eventName === 'commerce.lead.went_silent') {
        const confidence = signal.truthMode === 'observed' ? 0.85 : 0.55;
        if (confidence < MIN_CONFIDENCE_FOR_HYPOTHESIS) return null;
        return makeHypothesis(
          signal,
          'lead_response',
          'If we identify the real silence reason before sending, the owner can choose a safer next step and avoid pressure.',
          signal.eventName,
          confidence,
          'perder lead quente por silencio sem saber se deve esperar, explicar melhor ou parar',
        );
      }
      if (signal.eventName === 'commerce.lead.objection_raised') {
        const confidence = signal.truthMode === 'observed' ? 0.7 : 0.45;
        if (confidence < MIN_CONFIDENCE_FOR_HYPOTHESIS) return null;
        return makeHypothesis(
          signal,
          'lead_response',
          'If we classify the objection before answering, the owner can reduce regret risk and respond without forcing the lead.',
          signal.eventName,
          confidence,
          'responder objecao com argumento generico que pode vender mal ou queimar confianca',
        );
      }
      return null;
    },
  },
  {
    eventPrefix: 'commerce.post_sale.',
    domain: 'churn_prevention',
    template: (signal: SpineSignal) => {
      if (signal.eventName === 'commerce.post_sale.churn_risk_detected') {
        return makeHypothesis(
          signal,
          'churn_prevention',
          'If we send a personalized value reminder within 2h of churn risk detection, the customer will engage.',
          signal.eventName,
          0.65,
        );
      }
      if (signal.eventName === 'commerce.post_sale.win_back_window_opened') {
        return makeHypothesis(
          signal,
          'churn_prevention',
          'If we offer a time-limited incentive during the win-back window, the customer will return.',
          signal.eventName,
          0.6,
        );
      }
      return null;
    },
  },
  {
    eventPrefix: 'commerce.crm.',
    domain: 'deal_progression',
    template: (signal: SpineSignal) => {
      if (signal.eventName === 'commerce.crm.stage_changed') {
        return makeHypothesis(
          signal,
          'deal_progression',
          'If the next step is clearly defined with a deadline, the deal will close faster.',
          signal.eventName,
          0.5,
        );
      }
      return null;
    },
  },
  {
    eventPrefix: 'commerce.whatsapp.',
    domain: 'whatsapp_engagement',
    template: (signal: SpineSignal) => {
      if (signal.eventName === 'commerce.whatsapp.handoff_to_human') {
        return makeHypothesis(
          signal,
          'whatsapp_engagement',
          'If we reduce handoff triggers by clarifying the bot role upfront, customer satisfaction will improve.',
          signal.eventName,
          0.45,
        );
      }
      return null;
    },
  },
];

function makeHypothesis(
  signal: SpineSignal,
  domain: string,
  statement: string,
  sourceEventName: string,
  confidence: number,
  payablePain?: string,
): Hypothesis {
  const isMarketEntryLeadSignal =
    sourceEventName === 'commerce.lead.went_silent' ||
    sourceEventName === 'commerce.lead.objection_raised';

  return {
    id: `hyp_${randomUUID()}`,
    workspaceId: signal.workspaceId ?? 'global',
    statement,
    domain,
    sourceEventId: sourceEventName,
    confidence,
    truthMode: signal.truthMode,
    generatedAt: new Date().toISOString(),
    status: 'pending',
    ...(isMarketEntryLeadSignal
      ? {
          marketEntryId: MARKET_ENTRY.id,
          commercialStage: MARKET_ENTRY.stage,
          businessModel: MARKET_ENTRY.businessModel,
          flagshipJourney: MARKET_ENTRY.journey,
          ...(payablePain !== undefined ? { payablePain } : {}),
        }
      : {}),
  };
}

@Injectable()
export class HypothesisFormulatorService {
  private readonly logger = new Logger(HypothesisFormulatorService.name);

  formulate(signals: readonly SpineSignal[]): Hypothesis[] {
    const hypotheses: Hypothesis[] = [];
    for (const signal of signals) {
      for (const pattern of SIGNAL_PATTERNS) {
        if (signal.eventName.startsWith(pattern.eventPrefix)) {
          const hypothesis = pattern.template(signal);
          if (hypothesis) {
            hypotheses.push(hypothesis);
            this.logger.debug(
              `Hypothesis generated: ${hypothesis.id} domain=${hypothesis.domain} confidence=${hypothesis.confidence}`,
            );
          }
        }
      }
    }
    this.logger.debug(`Formulated ${hypotheses.length} hypotheses from ${signals.length} signals`);
    return hypotheses;
  }
}
