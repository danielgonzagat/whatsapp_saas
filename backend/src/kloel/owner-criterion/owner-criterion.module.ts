import { Module } from '@nestjs/common';
import { OwnerCriterionEvidenceBuilder } from './owner-criterion.evidence.builder';
import { OwnerCriterionProjector } from './owner-criterion.projector';

/**
 * UTP-OWNER-CRIT module — wires Camada XVI services into Nest DI.
 */
@Module({
  providers: [OwnerCriterionProjector, OwnerCriterionEvidenceBuilder],
  exports: [OwnerCriterionProjector, OwnerCriterionEvidenceBuilder],
})
export class OwnerCriterionModule {}
