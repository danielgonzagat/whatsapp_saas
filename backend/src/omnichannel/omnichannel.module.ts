import { Module, forwardRef } from '@nestjs/common';
import { ContactsModule } from '../contacts/contacts.module';
import { KloelModule } from '../kloel/kloel.module';
import { ChannelInboundHookService } from './channel-inbound-hook.service';
import { OmnichannelContactResolutionService } from './contact-resolution.service';

@Module({
  imports: [ContactsModule, forwardRef(() => KloelModule)],
  providers: [OmnichannelContactResolutionService, ChannelInboundHookService],
  exports: [OmnichannelContactResolutionService, ChannelInboundHookService],
})
export class OmnichannelModule {}
