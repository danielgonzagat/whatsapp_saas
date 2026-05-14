import { Module } from '@nestjs/common';
import { SpineModule } from '../spine/spine.module';
import { AuthorizationGatewayService } from './authorization.gateway';
import { BeliefUpdateService } from './belief-update';
import { DiscoveryNarrativeBuilderService } from './discovery-narrative.builder';
import { ExperimentRunnerService } from './experiment-runner';
import { HypothesisFormulatorService } from './hypothesis-formulator';
import { MicroExperimentDesignerService } from './micro-experiment.designer';
import { ObservationCollectorService } from './observation.collector';
import { ProofEvaluatorService } from './proof-evaluator';

/**
 * Hypproof module — Camada XX: hypothesis → experiment → authorization →
 * execution → observation → verdict → belief update → narrative.
 *
 * UTPs: HYPPROOF-001..008.
 */
@Module({
  imports: [SpineModule],
  providers: [
    HypothesisFormulatorService,
    MicroExperimentDesignerService,
    AuthorizationGatewayService,
    ExperimentRunnerService,
    ObservationCollectorService,
    ProofEvaluatorService,
    BeliefUpdateService,
    DiscoveryNarrativeBuilderService,
  ],
  exports: [
    HypothesisFormulatorService,
    MicroExperimentDesignerService,
    AuthorizationGatewayService,
    ExperimentRunnerService,
    ObservationCollectorService,
    ProofEvaluatorService,
    BeliefUpdateService,
    DiscoveryNarrativeBuilderService,
  ],
})
export class HypproofModule {}
