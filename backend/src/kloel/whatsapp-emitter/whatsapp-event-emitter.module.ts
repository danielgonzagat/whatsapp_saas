import { Module } from '@nestjs/common';
import { SpineModule } from '../spine/spine.module';
import { WhatsAppEventEmitterService } from './whatsapp-event-emitter.service';

@Module({
  imports: [SpineModule],
  providers: [WhatsAppEventEmitterService],
  exports: [WhatsAppEventEmitterService],
})
export class WhatsAppEventEmitterModule {}
