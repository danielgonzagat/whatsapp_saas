import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AdminAuditModule } from '../audit/admin-audit.module';
import { AdminPermissionsModule } from '../permissions/admin-permissions.module';
import { AdminCarteiraController } from './admin-carteira.controller';
import { PlatformWalletService } from './platform-wallet.service';

/**
 * SP-9 platform wallet module. Exports PlatformWalletService so that
 * the checkout confirmation flow (follow-up PR) can inject it and
 * append credits inside the same Prisma $transaction that creates
 * the CheckoutOrder.
 */
@Module({
  imports: [PrismaModule, AdminPermissionsModule, AdminAuditModule],
  controllers: [AdminCarteiraController],
  providers: [PlatformWalletService],
  exports: [PlatformWalletService],
})
export class AdminCarteiraModule {}
