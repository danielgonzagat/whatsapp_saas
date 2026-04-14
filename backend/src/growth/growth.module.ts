import { Module } from '@nestjs/common';
import { AiBrainModule } from '../ai-brain/ai-brain.module';
import { CampaignsModule } from '../campaigns/campaigns.module';
import { PrismaModule } from '../prisma/prisma.module';
import { GrowthController } from './growth.controller';
import { MoneyMachineController } from './money-machine.controller';
import { MoneyMachineService } from './money-machine.service';

@Module({
  imports: [PrismaModule, CampaignsModule, AiBrainModule],
  controllers: [GrowthController, MoneyMachineController],
  providers: [MoneyMachineService],
})
export class GrowthModule {}
