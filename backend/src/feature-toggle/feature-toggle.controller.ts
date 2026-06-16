import { Controller, Get, Query } from '@nestjs/common';
import { FeatureToggleService } from './feature-toggle.service';

@Controller('api/feature-toggles')
export class FeatureToggleController {
  constructor(private readonly featureToggleService: FeatureToggleService) {}

  @Get()
  list(@Query('name') name?: string) {
    if (name) {
      return { [name]: this.featureToggleService.isEnabled(name) };
    }
    return this.featureToggleService.all();
  }
}
