import { Module } from '@nestjs/common';
import { ChannelIdentifierService } from './channel-identifier.service';
import { ContactIdentityResolverService } from './contact-identity-resolver.service';
import { ContactIdentityMergeService } from './contact-identity-merge.service';

@Module({
  providers: [ChannelIdentifierService, ContactIdentityResolverService, ContactIdentityMergeService],
  exports: [ChannelIdentifierService, ContactIdentityResolverService, ContactIdentityMergeService],
})
/**
 * @cluster whatsapp_saas/backend/contacts
 * L11 multi-agent TaskGraph annotation (batched by tools/auto-pr/batch-job.mjs).
 */
export class ContactsModule {}
