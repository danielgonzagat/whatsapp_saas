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
export class EmailModule {}
