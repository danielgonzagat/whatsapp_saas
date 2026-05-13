import { Module } from '@nestjs/common';
import { ChannelIdentifierService } from './channel-identifier.service';
import { ContactIdentityResolverService } from './contact-identity-resolver.service';
import { ContactIdentityMergeService } from './contact-identity-merge.service';

@Module({
  providers: [ChannelIdentifierService, ContactIdentityResolverService, ContactIdentityMergeService],
  exports: [ChannelIdentifierService, ContactIdentityResolverService, ContactIdentityMergeService],
})
export class ContactsModule {}
