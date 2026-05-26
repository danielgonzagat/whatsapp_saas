import { Module } from '@nestjs/common';
import { CodeAccessService } from './code-access.service';
import { SafeQueryService } from './safe-query.service';

@Module({
  providers: [CodeAccessService, SafeQueryService],
  exports: [CodeAccessService, SafeQueryService],
})
export class SelfAwarenessModule {}