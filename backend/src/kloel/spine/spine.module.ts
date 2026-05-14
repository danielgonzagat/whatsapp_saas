import { Module } from '@nestjs/common';
import { MindModule } from '../mind/mind.module';
import { SpineEmitterService } from './spine-emitter.service';

/**
 * Spine module — the in-process cognitive event spine. Surface emitters
 * (B17) inject SpineEmitterService and call .emit() after the business
 * effect succeeds.
 */
@Module({
  imports: [MindModule],
  providers: [SpineEmitterService],
  exports: [SpineEmitterService],
})
export class SpineModule {}
