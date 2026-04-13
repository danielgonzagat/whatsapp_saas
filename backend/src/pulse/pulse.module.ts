import { Module } from '@nestjs/common';
import { HealthModule } from '../health/health.module';
import { PulseController } from './pulse.controller';
import { PulseService } from './pulse.service';

@Module({
  imports: [HealthModule],
  controllers: [PulseController],
  providers: [PulseService],
  exports: [PulseService],
})
export class PulseModule {}
