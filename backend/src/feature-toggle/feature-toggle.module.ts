import { Module } from '@nestjs/common';
import { FeatureToggleController } from './feature-toggle.controller';
import { FeatureToggleGuard } from './feature-toggle.guard';
import { FeatureToggleService } from './feature-toggle.service';

@Module({
  controllers: [FeatureToggleController],
  providers: [FeatureToggleGuard, FeatureToggleService],
  exports: [FeatureToggleGuard, FeatureToggleService],
})
export class FeatureToggleModule {}
