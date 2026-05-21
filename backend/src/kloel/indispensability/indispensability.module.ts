import { Module } from '@nestjs/common';
import { IndispensabilityTrackerService } from './indispensability.tracker.service';

/**
 * IndispensabilityModule — Camada XIII (Delegation Confidence Tracking).
 *
 * Mede sinais de habito formado: frequencia semanal, tempo entre sessoes,
 * churn risk apos pausa, perda perceptivel quando feature offline.
 *
 * UTP-DELEG-INDISP.
 * Pure-logic — sem Prisma, sem dependencias externas.
 */
@Module({
  providers: [IndispensabilityTrackerService],
  exports: [IndispensabilityTrackerService],
})
export class IndispensabilityModule {}
