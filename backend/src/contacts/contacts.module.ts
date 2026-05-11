import { Module } from '@nestjs/common';
import { ChannelIdentifierService } from './channel-identifier.service';

@Module({
  providers: [ChannelIdentifierService],
  exports: [ChannelIdentifierService],
})
export class ContactsModule {}
