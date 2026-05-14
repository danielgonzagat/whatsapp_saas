import { Module } from '@nestjs/common';
import { CapabilityRegistryService } from './capability-registry.service';

@Module({
  providers: [CapabilityRegistryService],
  exports: [CapabilityRegistryService],
})
export class CapabilityRegistryModule {}
