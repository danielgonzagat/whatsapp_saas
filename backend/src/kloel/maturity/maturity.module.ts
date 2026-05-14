import { Module } from '@nestjs/common';
import { GoalFieldModule } from '../goal-field/goal-field.module';
import { MaturityGoalFilterService } from './maturity-goal-filter.service';

/**
 * Maturity module — Camada VIII (UTP-MATURITY-001..005).
 *
 * Wires the maturity recognition services. The signals collector,
 * classifier, transition detector, and guard are pure functions
 * — no DI needed. Only the goal filter is a NestJS service to
 * allow injection of future dependencies.
 */
@Module({
  imports: [GoalFieldModule],
  providers: [MaturityGoalFilterService],
  exports: [MaturityGoalFilterService],
})
export class MaturityModule {}
