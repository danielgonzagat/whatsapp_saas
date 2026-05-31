import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SpineEmitterService } from '../kloel/spine/spine-emitter.service';
import { CrmEventEmitterService } from '../kloel/crm-emitter/crm-event-emitter.service';
import { PipelineController } from './pipeline.controller';
import { PipelineService } from './pipeline.service';

/** Pipeline module. */
@Module({
  imports: [PrismaModule],
  controllers: [PipelineController],
  providers: [PipelineService, SpineEmitterService, CrmEventEmitterService],
  exports: [PipelineService],
})
export class PipelineModule {}
