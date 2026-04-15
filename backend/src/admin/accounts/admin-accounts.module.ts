import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AdminAuditModule } from '../audit/admin-audit.module';
import { AdminPermissionsModule } from '../permissions/admin-permissions.module';
import { AdminAccountsController } from './admin-accounts.controller';
import { AdminAccountsService } from './admin-accounts.service';
import { AdminKycService } from './kyc/admin-kyc.service';

@Module({
  imports: [PrismaModule, AdminPermissionsModule, AdminAuditModule],
  controllers: [AdminAccountsController],
  providers: [AdminAccountsService, AdminKycService],
  exports: [AdminAccountsService],
})
export class AdminAccountsModule {}
