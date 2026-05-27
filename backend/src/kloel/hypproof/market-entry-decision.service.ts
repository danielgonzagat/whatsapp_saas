import { Injectable } from '@nestjs/common';
import { HypothesisFormulatorService } from './hypothesis-formulator';
import { MicroExperimentDesignerService } from './micro-experiment.designer';
import type { Hypothesis, MicroExperiment, SpineSignal } from './types';

export interface MarketEntryDecision {
  readonly marketEntryId: string;
  readonly workspaceId: string;
  readonly sourceEventId: string;
  readonly hypothesis: Hypothesis;
  readonly experiment: MicroExperiment;
  readonly ownerDecision: string;
  readonly nextSafeStep: string;
  readonly shouldContactLeadNow: boolean;
  readonly uncertaintyStatement: string;
  readonly validationNeeded: string;
}

const MARKET_ENTRY_ID = 'producer-validation-infoproduct-direct-checkout';

function isMarketEntryHypothesis(hypothesis: Hypothesis): boolean {
  return hypothesis.marketEntryId === MARKET_ENTRY_ID && hypothesis.domain === 'lead_response';
}

function buildOwnerDecision(experiment: MicroExperiment): string {
  return [
    experiment.commercialWork ?? 'decide the safest next step before a lead-facing action',
    `risk=${experiment.riskClass ?? 'R1'}`,
    `autonomy=${experiment.autonomyMode ?? 'alone'}`,
    `proof_target=${experiment.proofLevelTarget ?? 'N3'}`,
  ].join(' | ');
}

@Injectable()
export class MarketEntryDecisionService {
  constructor(
    private readonly formulator: HypothesisFormulatorService,
    private readonly designer: MicroExperimentDesignerService,
  ) {}

  decideFromSignals(signals: readonly SpineSignal[]): readonly MarketEntryDecision[] {
    const hypotheses = this.formulator.formulate(signals).filter(isMarketEntryHypothesis);

    return hypotheses.flatMap((hypothesis) => {
      const experiment = this.designer.design(hypothesis);
      if (!experiment) {return [];}

      return [
        {
          marketEntryId: MARKET_ENTRY_ID,
          workspaceId: hypothesis.workspaceId,
          sourceEventId: hypothesis.sourceEventId,
          hypothesis,
          experiment,
          ownerDecision: buildOwnerDecision(experiment),
          nextSafeStep:
            experiment.noFaithProofSignal ?? 'show the owner a concrete next-step decision',
          shouldContactLeadNow: false,
          uncertaintyStatement:
            'Kloel has a code-run-ready hypothesis, but not observed user proof yet; do not claim N4+ until a real owner validates this decision.',
          validationNeeded:
            experiment.validationScene ??
            'Observe a real owner using this decision on a real lead.',
        } satisfies MarketEntryDecision,
      ];
    });
  }
}
