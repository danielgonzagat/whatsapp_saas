import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PipelineController } from './pipeline.controller';
import { PipelineService } from './pipeline.service';

/** Pipeline module. */
@Module({
  imports: [PrismaModule],
  controllers: [PipelineController],
  providers: [PipelineService],
  exports: [PipelineService],
})
export class PipelineModule {}
