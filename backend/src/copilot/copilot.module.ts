import { Module } from '@nestjs/common';
import { CopilotService } from './copilot.service';
import { CopilotController } from './copilot.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { CopilotGateway } from './copilot.gateway';
import { BillingModule } from '../billing/billing.module';

@Module({
  imports: [PrismaModule, BillingModule],
  controllers: [CopilotController],
  providers: [CopilotService, CopilotGateway],
  exports: [CopilotService],
})
export class CopilotModule {}
