import { Module } from '@nestjs/common';
import { DelegationStateTracker } from './delegation-state.tracker';
import { AutonomyRollbackPolicy } from './autonomy-rollback.policy';
import { AreaByAreaGraduationService } from './area-by-area-graduation.service';

/**
 * DelegationModule — Camada XIII (UTP-DELEG-001..006).
 *
 * Delegation confidence tracking: per-workspace per-area state,
 * graduation detection, autonomy suggestion building, rollback
 * policy enforcement, area-by-area graduation evaluation, and
 * evidence packaging.
 *
 * Implements B0.2 (R17 metrics) — the highest form of intelligence:
 * confident delegation of operational areas.
 *
 * Stateful services (tracker, rollback policy, graduation orchestrator)
 * are NestJS providers. Pure functions (detector, suggestion builder,
 * evidence builder) are exported as pure functions from their respective
 * modules.
 */
@Module({
  providers: [DelegationStateTracker, AutonomyRollbackPolicy, AreaByAreaGraduationService],
  exports: [DelegationStateTracker, AutonomyRollbackPolicy, AreaByAreaGraduationService],
})
export class DelegationModule {}
