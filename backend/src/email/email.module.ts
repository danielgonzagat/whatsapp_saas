import { Module } from '@nestjs/common';
import { InboxModule } from '../inbox/inbox.module';
import { EmailInboundController } from './email-inbound.controller';
import { EmailInboundService } from './email-inbound.service';

@Module({
  imports: [InboxModule],
  controllers: [EmailInboundController],
  providers: [EmailInboundService],
  exports: [EmailInboundService],
})
/**
 * @cluster whatsapp_saas/backend/email
 * L11 multi-agent TaskGraph annotation (batched by tools/auto-pr/batch-job.mjs).
 */
export class EmailModule {}
