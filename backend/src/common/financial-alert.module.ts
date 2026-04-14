import { Global, Module } from '@nestjs/common';
import { FinancialAlertService } from './financial-alert.service';

/**
 * Global module that exposes FinancialAlertService to all modules
 * without requiring explicit imports.
 */
@Global()
@Module({
  providers: [FinancialAlertService],
  exports: [FinancialAlertService],
})
export class FinancialAlertModule {}
