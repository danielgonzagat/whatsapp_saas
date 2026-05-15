/**
 * Evol module — Camada XXXII: Self-Evolution under absolute human governance.
 *
 * GapDetectorService: observa runtime metrics, R-tier deltas e capability
 * registry para detectar gaps de capacidade.
 *
 * ProposalBuilderService: gera propostas com hypothesisToTest,
 * requiresHumanApproval, riskClass, expectedRTierDelta e rollbackPlan.
 *
 * R3/R4 sempre requiresHumanApproval=true.
 */
import { Module } from '@nestjs/common';
import { GapDetectorService } from './gap-detector.service';
import { ProposalBuilderService } from './proposal-builder.service';

@Module({
  providers: [GapDetectorService, ProposalBuilderService],
  exports: [GapDetectorService, ProposalBuilderService],
})
export class EvolModule {}
