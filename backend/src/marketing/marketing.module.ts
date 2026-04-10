import { Module } from '@nestjs/common';
import { MarketingController } from './marketing.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';

@Module({
  imports: [PrismaModule, WhatsappModule],
  controllers: [MarketingController],
})
export class MarketingModule {}
