import { Module } from '@nestjs/common';
import { KloelModule } from '../kloel/kloel.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { CiaController } from './cia.controller';
import { CiaService } from './cia.service';

/** Cia module. */
@Module({
  imports: [KloelModule, WhatsappModule],
  controllers: [CiaController],
  providers: [CiaService],
  exports: [CiaService],
})
export class CiaModule {}
