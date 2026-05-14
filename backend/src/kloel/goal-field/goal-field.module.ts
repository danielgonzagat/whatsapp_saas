import { Module } from '@nestjs/common';
import { GoalFieldService } from './goal-field.service';
import { GoalFieldShadowAccumulatorService } from './goal-field.shadow-accumulator.service';

/**
 * Goal Field module — registers the orchestrator with the canonical
 * detector set. Consumers inject GoalFieldService and call runCycle().
 */
@Module({
  providers: [GoalFieldService, GoalFieldShadowAccumulatorService],
  exports: [GoalFieldService, GoalFieldShadowAccumulatorService],
})
export class GoalFieldModule {}
