import { Module } from '@nestjs/common';
import { CodeAccessService } from './code-access.service';
import { SafeQueryService } from './safe-query.service';
import { SelfHealthService } from './self-health.service';
import { SelfGapsService } from './self-gaps.service';
import { CognitiveBridgeService } from './cognitive-bridge.service';
import { PulseRuntimeService } from './pulse-runtime.service';
import { DepsCoverageService } from './deps-coverage.service';

@Module({
  providers: [
    CodeAccessService,
    SafeQueryService,
    SelfHealthService,
    SelfGapsService,
    CognitiveBridgeService,
    PulseRuntimeService,
    DepsCoverageService,
  ],
  exports: [
    CodeAccessService,
    SafeQueryService,
    SelfHealthService,
    SelfGapsService,
    CognitiveBridgeService,
    PulseRuntimeService,
    DepsCoverageService,
  ],
})
export class SelfAwarenessModule {}
