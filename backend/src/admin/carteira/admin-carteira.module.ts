import { Module } from '@nestjs/common';
import { PaymentsModule } from '../../payments/payments.module';
import { MarketplaceTreasuryModule } from '../../marketplace-treasury/marketplace-treasury.module';
import { AdminAuditModule } from '../audit/admin-audit.module';
import { AdminPermissionsModule } from '../permissions/admin-permissions.module';
import { AdminCarteiraController } from './admin-carteira.controller';

/**
 * SP-9 admin-side wrapper. The actual MarketplaceTreasuryService lives in
 * src/marketplace-treasury/ so non-admin consumers (checkout split engine)
 * can import it without pulling the admin module tree.
 */
@Module({
  imports: [MarketplaceTreasuryModule, PaymentsModule, AdminPermissionsModule, AdminAuditModule],
  controllers: [AdminCarteiraController],
  exports: [MarketplaceTreasuryModule],
})
export class AdminCarteiraModule {}
