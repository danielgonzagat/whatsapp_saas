import { Module } from '@nestjs/common';
import { ToolPlannerService } from './toolplanner.service';
import { CapabilityRegistryV2Module } from '../capability-registry-v2/capability-registry-v2.module';

@Module({
  imports: [CapabilityRegistryV2Module],
  providers: [ToolPlannerService],
  exports: [ToolPlannerService],
})
export class ToolPlannerModule {}
