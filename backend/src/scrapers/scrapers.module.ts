import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ScrapersController } from './scrapers.controller';
import { ScrapersService } from './scrapers.service';

import { OmniScraperService } from './omni-scraper.service';

@Module({
  imports: [PrismaModule],
  controllers: [ScrapersController],
  providers: [ScrapersService, OmniScraperService],
  exports: [ScrapersService, OmniScraperService],
})
export class ScrapersModule {}
