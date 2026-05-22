import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AdminAuditModule } from '../audit/admin-audit.module';
import { AdminAuthModule } from '../auth/admin-auth.module';
import { AdminPermissionsModule } from '../permissions/admin-permissions.module';
import { DlqController } from './dlq.controller';

@Module({
  imports: [PrismaModule, AdminAuthModule, AdminPermissionsModule, AdminAuditModule],
  controllers: [DlqController],
})
export class AdminOperationsModule {}
