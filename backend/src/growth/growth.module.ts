import { Module } from '@nestjs/common';
import { GrowthController } from './growth.controller';
import { MoneyMachineController } from './money-machine.controller';
import { MoneyMachineService } from './money-machine.service';
import { ContactDiscoveryService } from './contact-discovery.service';
import { PrismaModule } from '../prisma/prisma.module';
import { CampaignsModule } from '../campaigns/campaigns.module';
import { AiBrainModule } from '../ai-brain/ai-brain.module';

@Module({
  imports: [PrismaModule, CampaignsModule, AiBrainModule],
  controllers: [GrowthController, MoneyMachineController],
  providers: [MoneyMachineService, ContactDiscoveryService],
})
export class GrowthModule {}
