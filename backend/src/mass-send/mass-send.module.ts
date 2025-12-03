import { Module } from '@nestjs/common';
import { MassSendService } from './mass-send.service';
import { MassSendController } from './mass-send.controller';
import { WhatsappModule } from '../whatsapp/whatsapp.module';

@Module({
  imports: [WhatsappModule], // <-- ESSENCIAL
  controllers: [MassSendController],
  providers: [MassSendService],
})
export class MassSendModule {}
