import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { KloelModule } from '../../kloel/kloel.module';
import { AdminPermissionsModule } from '../permissions/admin-permissions.module';
import { PipelineController } from './pipeline.controller';
import { PipelineService } from './pipeline.service';

@Module({
  imports: [PrismaModule, AdminPermissionsModule, KloelModule],
  controllers: [PipelineController],
  providers: [PipelineService],
  exports: [PipelineService],
})
export class AdminPipelineModule {}
