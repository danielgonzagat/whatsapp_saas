import { Module } from '@nestjs/common';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { MassSendController } from './mass-send.controller';
import { MassSendService } from './mass-send.service';

@Module({
  imports: [WhatsappModule], // <-- ESSENCIAL
  controllers: [MassSendController],
  providers: [MassSendService],
})
export class MassSendModule {}
