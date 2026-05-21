import { Module } from '@nestjs/common';
import { GoalFieldModule } from '../goal-field/goal-field.module';
import { MindModule } from '../mind/mind.module';
import { SpineModule } from '../spine/spine.module';
import { DailyDashboardService } from './daily-dashboard.service';

@Module({
  imports: [SpineModule, GoalFieldModule, MindModule],
  providers: [DailyDashboardService],
  exports: [DailyDashboardService],
})
export class DailyDashboardModule {}
