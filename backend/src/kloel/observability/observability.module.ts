import { forwardRef, Module } from '@nestjs/common';
import { SpineModule } from '../spine/spine.module';
import { RuntimeMetricsService } from './runtime-metrics.service';

@Module({
  imports: [forwardRef(() => SpineModule)],
  providers: [RuntimeMetricsService],
  exports: [RuntimeMetricsService],
})
export class ObservabilityModule {}
