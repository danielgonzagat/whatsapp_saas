import { Module } from '@nestjs/common';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { CiaController } from './cia.controller';
import { CiaService } from './cia.service';

@Module({
  imports: [WhatsappModule],
  controllers: [CiaController],
  providers: [CiaService],
  exports: [CiaService],
})
export class CiaModule {}
