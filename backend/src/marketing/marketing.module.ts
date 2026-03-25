import { Module } from '@nestjs/common';
import { MarketingController } from './marketing.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [MarketingController],
})
export class MarketingModule {}
