import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FEATURE_GATE_KEY } from './feature-gate.decorator';
import { FeatureToggleService } from './feature-toggle.service';

@Injectable()
export class FeatureToggleGuard implements CanActivate {
  private readonly logger = new Logger(FeatureToggleGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly featureToggleService: FeatureToggleService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const feature = this.reflector.getAllAndOverride<string>(FEATURE_GATE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!feature) {
      return true;
    }

    const enabled = this.featureToggleService.isEnabled(feature);

    if (!enabled) {
      this.logger.warn(`Blocked: feature "${feature}" is disabled`);
    }

    return enabled;
  }
}
