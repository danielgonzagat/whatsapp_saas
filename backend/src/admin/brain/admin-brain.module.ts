import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AdminPermissionsModule } from '../permissions/admin-permissions.module';
import { MindSpineAudit } from '../../kloel/mind/observability';
import { MindAuditController } from './mind-audit.controller';

@Module({
  imports: [PrismaModule, AdminPermissionsModule],
  controllers: [MindAuditController],
  providers: [MindSpineAudit],
  exports: [MindSpineAudit],
})
export class AdminBrainModule {}
