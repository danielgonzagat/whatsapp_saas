import { Module } from '@nestjs/common';
import { MindModule } from '../mind/mind.module';
import { SpineCoverageAuditorService } from './spine-coverage-auditor.service';
import { SpineEmitterService } from './spine-emitter.service';

/**
 * Spine module — the in-process cognitive event spine. Surface emitters
 * (B17) inject SpineEmitterService and call .emit() after the business
 * effect succeeds. The SpineCoverageAuditorService scans the ring
 * buffer and reports per-surface coverage (PCI.6).
 */
@Module({
  imports: [MindModule],
  providers: [SpineEmitterService, SpineCoverageAuditorService],
  exports: [SpineEmitterService, SpineCoverageAuditorService],
})
export class SpineModule {}
