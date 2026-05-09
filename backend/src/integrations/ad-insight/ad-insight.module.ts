import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AdInsightController } from './ad-insight.controller';
import { AdInsightService } from './ad-insight.service';

/** Ad insight module. */
@Module({
  imports: [PrismaModule],
  controllers: [AdInsightController],
  providers: [AdInsightService],
  exports: [AdInsightService],
})
export class AdInsightModule {}
