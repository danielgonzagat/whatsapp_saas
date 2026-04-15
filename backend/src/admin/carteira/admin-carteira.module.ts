import { Module } from '@nestjs/common';
import { PlatformWalletModule } from '../../platform-wallet/platform-wallet.module';
import { AdminAuditModule } from '../audit/admin-audit.module';
import { AdminPermissionsModule } from '../permissions/admin-permissions.module';
import { AdminCarteiraController } from './admin-carteira.controller';

/**
 * SP-9 admin-side wrapper. The actual PlatformWalletService lives in
 * src/platform-wallet/ so non-admin consumers (checkout split engine)
 * can import it without pulling the admin module tree.
 */
@Module({
  imports: [PlatformWalletModule, AdminPermissionsModule, AdminAuditModule],
  controllers: [AdminCarteiraController],
  exports: [PlatformWalletModule],
})
export class AdminCarteiraModule {}
