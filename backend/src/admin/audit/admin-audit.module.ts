import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AdminPermissionsModule } from '../permissions/admin-permissions.module';
import { AdminAuditController } from './admin-audit.controller';
import { AdminAuditService } from './admin-audit.service';

/**
 * Audit module no longer imports AdminAuthModule. The admin auth guard
 * reaches this module via AdminPermissionsModule (which re-exports
 * AdminGuardsModule). That eliminates the cycle that madge caught:
 *
 *   AdminAuthModule  ──▶ AdminAuditModule  (needs AdminAuditService)
 *   AdminAuditModule ──▶ AdminAuthModule   (needed AdminAuthGuard)  ← removed
 */
@Module({
  imports: [PrismaModule, AdminPermissionsModule],
  controllers: [AdminAuditController],
  providers: [AdminAuditService],
  exports: [AdminAuditService],
})
export class AdminAuditModule {}
