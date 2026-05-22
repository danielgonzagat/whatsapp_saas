import { Module } from '@nestjs/common';
import { IdempotencyService } from './idempotency.service';
import { IdempotencyMiddleware } from './idempotency.middleware';

@Module({
  providers: [IdempotencyService, IdempotencyMiddleware],
  exports: [IdempotencyService, IdempotencyMiddleware],
})
/**
 * @cluster whatsapp_saas/backend/common
 * L11 multi-agent TaskGraph annotation (batched by tools/auto-pr/batch-job.mjs).
 */
export class IdempotencyModule {}
