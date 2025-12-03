import { Module } from '@nestjs/common';
import { OpsController } from './ops.controller';
import { MetricsModule } from '../metrics/metrics.module';

@Module({
  imports: [MetricsModule],
  controllers: [OpsController],
})
export class OpsModule {}
