import { Module } from '@nestjs/common';
import { MindKnowledgeModule } from '../kloel/mind/knowledge/knowledge.module';
import { CampaignsModule } from '../campaigns/campaigns.module';
import { PrismaModule } from '../prisma/prisma.module';
import { GrowthController } from './growth.controller';
import { MoneyMachineController } from './money-machine.controller';
import { MoneyMachineService } from './money-machine.service';

/** Growth module. */
@Module({
  imports: [PrismaModule, CampaignsModule, MindKnowledgeModule],
  controllers: [GrowthController, MoneyMachineController],
  providers: [MoneyMachineService],
})
export class GrowthModule {}
