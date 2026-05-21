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
/**
 * @cluster whatsapp_saas/backend/common
 * L11 multi-agent TaskGraph annotation (batched by tools/auto-pr/batch-job.mjs).
 */
export class FinancialAlertModule {}
