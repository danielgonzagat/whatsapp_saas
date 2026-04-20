import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { PrismaModule } from '../prisma/prisma.module';
import { CopilotController } from './copilot.controller';
import { CopilotGateway } from './copilot.gateway';
import { CopilotService } from './copilot.service';

/** Copilot module. */
@Module({
  imports: [PrismaModule, BillingModule],
  controllers: [CopilotController],
  providers: [CopilotService, CopilotGateway],
  exports: [CopilotService],
})
export class CopilotModule {}
