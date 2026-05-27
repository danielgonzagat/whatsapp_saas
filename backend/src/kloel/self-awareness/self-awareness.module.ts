import { Module } from '@nestjs/common';
import { CodeAccessService } from './code-access.service';
import { SafeQueryService } from './safe-query.service';
import { SelfHealthService } from './self-health.service';
import { SelfGapsService } from './self-gaps.service';
import { CognitiveBridgeService } from './cognitive-bridge.service';
import { PulseRuntimeService } from './pulse-runtime.service';

@Module({
  providers: [
    CodeAccessService,
    SafeQueryService,
    SelfHealthService,
    SelfGapsService,
    CognitiveBridgeService,
    PulseRuntimeService,
  ],
  exports: [
    CodeAccessService,
    SafeQueryService,
    SelfHealthService,
    SelfGapsService,
    CognitiveBridgeService,
    PulseRuntimeService,
  ],
})
export class SelfAwarenessModule {}
