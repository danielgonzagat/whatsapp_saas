import { forwardRef, Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { KloelModule } from '../kloel/kloel.module';
import { PrismaModule } from '../prisma/prisma.module';
import { CopilotController } from './copilot.controller';
import { CopilotGateway } from './copilot.gateway';
import { CopilotService } from './copilot.service';

/** Copilot module. */
@Module({
  // One-Mind unification: import KloelModule (forwardRef-guarded against any
  // transitive cycle) so CopilotService can resolve the @Optional() cognition
  // services (DecisionOutcomeService / MindBeliefService / MindSurpriseService /
  // MindGlobalPriorService / MindPredictorService) the KLOEL_COPILOT_LOOP_ENABLED
  // learning loop reuses. With the flag OFF those injections are harmless; with
  // it ON they let the Copilot surface feed the same one-Mind cognition tables.
  imports: [PrismaModule, BillingModule, forwardRef(() => KloelModule)],
  controllers: [CopilotController],
  providers: [CopilotService, CopilotGateway],
  exports: [CopilotService],
})
/**
 * @cluster whatsapp_saas/backend/copilot
 * L11 multi-agent TaskGraph annotation (batched by tools/auto-pr/batch-job.mjs).
 */
export class CopilotModule {}
