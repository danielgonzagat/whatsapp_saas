import { Module } from '@nestjs/common';
import { IntentRouterService } from './intent-router.service';
import { CapabilityRegistryV2Module } from '../capability-registry-v2/capability-registry-v2.module';

@Module({
  imports: [CapabilityRegistryV2Module],
  providers: [IntentRouterService],
  exports: [IntentRouterService],
})
export class IntentRouterModule {}
