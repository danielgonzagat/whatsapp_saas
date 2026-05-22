import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CookieConsentController } from './cookie-consent.controller';
import { CookieConsentService } from './cookie-consent.service';

/** Cookie consent module. */
@Module({
  imports: [PrismaModule],
  controllers: [CookieConsentController],
  providers: [CookieConsentService],
  exports: [CookieConsentService],
})
/**
 * @cluster whatsapp_saas/backend/cookie-consent
 * L11 multi-agent TaskGraph annotation (batched by tools/auto-pr/batch-job.mjs).
 */
export class CookieConsentModule {}
