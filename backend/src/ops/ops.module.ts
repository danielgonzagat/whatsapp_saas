import { Module } from '@nestjs/common';
import { MetricsModule } from '../metrics/metrics.module';
import { OpsController } from './ops.controller';

@Module({
  imports: [MetricsModule],
  controllers: [OpsController],
})
export class OpsModule {}
