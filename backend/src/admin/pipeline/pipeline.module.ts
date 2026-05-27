import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { KloelModule } from '../../kloel/kloel.module';
import { AdminPermissionsModule } from '../permissions/admin-permissions.module';
import { AdminPipelineController } from './admin-pipeline.controller';
import { AdminPipelineService } from './admin-pipeline.service';

@Module({
  imports: [PrismaModule, AdminPermissionsModule, KloelModule],
  controllers: [AdminPipelineController],
  providers: [AdminPipelineService],
  exports: [AdminPipelineService],
})
export class AdminPipelineModule {}
