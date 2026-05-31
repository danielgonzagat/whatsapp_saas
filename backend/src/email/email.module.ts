import { Module } from '@nestjs/common';
import { InboxModule } from '../inbox/inbox.module';
import { EmailInboundService } from './email-inbound.service';

/**
 * Legacy email module — retained only because `EmailInboundService` still
 * physically lives here. The controller was dissolved 2026-05-27 (P0 dup #36)
 * and the canonical wiring is now in `MarketingModule` per ADR-0012 (OmniCore).
 *
 * This module is intentionally NOT registered in any other module — it's a
 * placeholder until Wave W3 of ADR-0012 physically relocates the service to
 * `backend/src/marketing/channels/email/`.
 *
 * @cluster whatsapp_saas/backend/email
 */
@Module({
  imports: [InboxModule],
  providers: [EmailInboundService],
  exports: [EmailInboundService],
})
export class EmailModule {}
