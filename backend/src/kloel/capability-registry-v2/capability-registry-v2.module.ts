import { Module } from '@nestjs/common';
import { CapabilityRegistryV2Service } from './capability-registry-v2.service';

@Module({
  providers: [CapabilityRegistryV2Service],
  exports: [CapabilityRegistryV2Service],
})
export class CapabilityRegistryV2Module {}