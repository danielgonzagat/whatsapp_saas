import { Module } from '@nestjs/common';
import { CodeAccessService } from './code-access.service';
import { SafeQueryService } from './safe-query.service';
import { SelfHealthService } from './self-health.service';
import { SelfGapsService } from './self-gaps.service';

@Module({
  providers: [CodeAccessService, SafeQueryService, SelfHealthService, SelfGapsService],
  exports: [CodeAccessService, SafeQueryService, SelfHealthService, SelfGapsService],
})
export class SelfAwarenessModule {}