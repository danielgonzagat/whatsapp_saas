import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { MarketingController } from './marketing.controller';

/** Marketing module. */
@Module({
  imports: [PrismaModule, WhatsappModule],
  controllers: [MarketingController],
})
export class MarketingModule {}
