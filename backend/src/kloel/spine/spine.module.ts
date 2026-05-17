import { Module } from '@nestjs/common';
import { SpineCoverageAuditorService } from './spine-coverage-auditor.service';
import { SpineEmitterService } from './spine-emitter.service';

/**
 * Spine module — the in-process cognitive event spine. Surface emitters
 * (B17) inject SpineEmitterService and call .emit() after the business
 * effect succeeds. The SpineCoverageAuditorService scans the ring
 * buffer and reports per-surface coverage (PCI.6). Valence tagging stays
 * optional inside SpineEmitterService so the spine does not import MIND back.
 */
@Module({
  providers: [SpineEmitterService, SpineCoverageAuditorService],
  exports: [SpineEmitterService, SpineCoverageAuditorService],
})
export class SpineModule {}
