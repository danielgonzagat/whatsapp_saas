import { Module } from '@nestjs/common';
import { AffiliateController } from './affiliate.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [AffiliateController],
})
export class AffiliateModule {}
