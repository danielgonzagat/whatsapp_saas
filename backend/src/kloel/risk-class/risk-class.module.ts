import { Module } from '@nestjs/common';
import { RiskClassService } from './risk-class.service';
import { RiskGateService } from './risk-gate.service';

/**
 * RiskClassModule — Camada XIII (UTP-DELEG-001).
 *
 * Classifies every action into R1..R4 with autonomy mode,
 * required evidence level, and rollback strategies.
 * RiskGateService closes OC-ORPHAN-14: wires classification into
 * execution-gate decisions before R2/R3/R4 actions.
 */
@Module({
  providers: [RiskClassService, RiskGateService],
  exports: [RiskClassService, RiskGateService],
})
export class RiskClassModule {}
