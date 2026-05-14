import { Module } from '@nestjs/common';
import { GoalFieldService } from './goal-field.service';

/**
 * Goal Field module — registers the orchestrator with the canonical
 * detector set. Consumers inject GoalFieldService and call runCycle().
 */
@Module({
  providers: [GoalFieldService],
  exports: [GoalFieldService],
})
export class GoalFieldModule {}
