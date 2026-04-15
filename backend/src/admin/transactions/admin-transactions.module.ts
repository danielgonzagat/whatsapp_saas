import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AdminPermissionsModule } from '../permissions/admin-permissions.module';
import { AdminTransactionsController } from './admin-transactions.controller';
import { AdminTransactionsService } from './admin-transactions.service';

@Module({
  imports: [PrismaModule, AdminPermissionsModule],
  controllers: [AdminTransactionsController],
  providers: [AdminTransactionsService],
  exports: [AdminTransactionsService],
})
export class AdminTransactionsModule {}
