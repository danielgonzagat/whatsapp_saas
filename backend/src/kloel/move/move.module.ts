import { Module } from '@nestjs/common';
import { FrictionDetectorService } from './friction.detector';
import { StepDecomposerService } from './step-decomposer.service';

@Module({
  providers: [FrictionDetectorService, StepDecomposerService],
  exports: [FrictionDetectorService, StepDecomposerService],
})
export class MoveModule {}
