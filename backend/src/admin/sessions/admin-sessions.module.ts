import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AdminAuditModule } from '../audit/admin-audit.module';
import { AdminAuthModule } from '../auth/admin-auth.module';
import { AdminPermissionsModule } from '../permissions/admin-permissions.module';
import { AdminSessionsController } from './admin-sessions.controller';
import { AdminSessionsService } from './admin-sessions.service';

/** Admin sessions module. */
@Module({
  imports: [PrismaModule, AdminAuthModule, AdminPermissionsModule, AdminAuditModule],
  controllers: [AdminSessionsController],
  providers: [AdminSessionsService],
  exports: [AdminSessionsService],
})
export class AdminSessionsModule {}
