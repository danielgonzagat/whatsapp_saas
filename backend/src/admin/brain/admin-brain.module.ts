import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AdminPermissionsModule } from '../permissions/admin-permissions.module';
import { BrainSpineAuditService } from '../../brain/brain-spine-audit.service';
import { BrainAuditController } from './brain-audit.controller';

@Module({
  imports: [PrismaModule, AdminPermissionsModule],
  controllers: [BrainAuditController],
  providers: [BrainSpineAuditService],
  exports: [BrainSpineAuditService],
})
export class AdminBrainModule {}
