import { Injectable, OnModuleInit, Optional } from '@nestjs/common';
import { RuntimeMetricsService } from './runtime-metrics.service';
import type { SpineEmitterService } from '../spine/spine-emitter.service';

@Injectable()
export class RuntimeMetricsBootstrapService implements OnModuleInit {
  constructor(
    private readonly metrics: RuntimeMetricsService,
    @Optional() private readonly spine?: SpineEmitterService,
  ) {}

  onModuleInit(): void {
    if (this.spine) {
      this.metrics.wireToSpine(this.spine);
    }
  }
}
