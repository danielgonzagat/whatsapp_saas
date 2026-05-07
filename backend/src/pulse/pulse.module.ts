import { Module } from '@nestjs/common';
import { HealthModule } from '../health/health.module';
import { PulseArtifactService } from './pulse-artifact.service';
import { PulseController } from './pulse.controller';
import { PulseService } from './pulse.service';

/** Pulse module. */
@Module({
  imports: [HealthModule],
  controllers: [PulseController],
  providers: [PulseService, PulseArtifactService],
  exports: [PulseService, PulseArtifactService],
})
export class PulseModule {}
