import { Module } from '@nestjs/common';
import { RiskClassService } from './risk-class.service';

/**
 * RiskClassModule — Camada XIII (UTP-DELEG-001).
 *
 * Classifies every action into R1..R4 with autonomy mode,
 * required evidence level, and rollback strategies.
 * Implements delegation-state-tracker classification contract.
 */
@Module({
  providers: [RiskClassService],
  exports: [RiskClassService],
})
export class RiskClassModule {}
