import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AdminPermissionsModule } from '../permissions/admin-permissions.module';
import { MindSpineAudit } from '../../kloel/mind/observability';
import { BrainAuditController } from './brain-audit.controller';

@Module({
  imports: [PrismaModule, AdminPermissionsModule],
  controllers: [BrainAuditController],
  providers: [MindSpineAudit],
  exports: [MindSpineAudit],
})
export class AdminBrainModule {}
