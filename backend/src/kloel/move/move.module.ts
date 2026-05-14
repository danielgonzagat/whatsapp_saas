import { Module } from '@nestjs/common';
import { FrictionDetectorService } from './friction.detector';
import { StepDecomposerService } from './step.decomposer';
import { TinyActionSuggesterService } from './tiny-action.suggester';
import { PartialExecutionOfferService } from './partial-execution.offer';
import { AlternativeRouteBuilderService } from './alternative-route.builder';
import { PatternLearnerService } from './pattern.learner';
import { NoBlameToneGuardService } from './no-blame-tone.guard';

@Module({
  providers: [
    FrictionDetectorService,
    StepDecomposerService,
    TinyActionSuggesterService,
    PartialExecutionOfferService,
    AlternativeRouteBuilderService,
    PatternLearnerService,
    NoBlameToneGuardService,
  ],
  exports: [
    FrictionDetectorService,
    StepDecomposerService,
    TinyActionSuggesterService,
    PartialExecutionOfferService,
    AlternativeRouteBuilderService,
    PatternLearnerService,
    NoBlameToneGuardService,
  ],
})
export class MoveModule {}
