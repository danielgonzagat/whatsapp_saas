import { Module } from '@nestjs/common';
import { KloelModule } from '../../kloel/kloel.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { AdminAuditModule } from '../audit/admin-audit.module';
import { AdminPermissionsModule } from '../permissions/admin-permissions.module';
import { AdminTransactionsController } from './admin-transactions.controller';
import { AdminTransactionsService } from './admin-transactions.service';

@Module({
  imports: [PrismaModule, AdminPermissionsModule, AdminAuditModule, KloelModule],
  controllers: [AdminTransactionsController],
  providers: [AdminTransactionsService],
  exports: [AdminTransactionsService],
})
export class AdminTransactionsModule {}
