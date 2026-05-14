import { Module } from '@nestjs/common';
import { GoalFieldModule } from '../goal-field/goal-field.module';
import { LineageModule } from '../lineage/lineage.module';
import { MindModule } from '../mind/mind.module';
import { SpineModule } from '../spine/spine.module';
import { VtierCertifierService } from './v-tier-certifier.service';

@Module({
  imports: [SpineModule, LineageModule, MindModule, GoalFieldModule],
  providers: [VtierCertifierService],
  exports: [VtierCertifierService],
})
export class VtierModule {}
