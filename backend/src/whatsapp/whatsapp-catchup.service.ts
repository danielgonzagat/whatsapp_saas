import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { WhatsappCatchupOrchestratorService } from './whatsapp-catchup-orchestrator.service';

type CatchupRunSummary = {
  importedMessages: number;
  touchedChats: number;
  processedChats: number;
  overflow: boolean;
};

@Injectable()
export class WhatsAppCatchupService {
  private readonly logger = new Logger(WhatsAppCatchupService.name);

  constructor(
    @Inject(forwardRef(() => WhatsappCatchupOrchestratorService))
    private readonly orchestrator: WhatsappCatchupOrchestratorService,
  ) {}

  async triggerCatchup(ws: string, reason = 'unknown') {
    this.logger.log(`Catchup triggered for ws=${ws} reason=${reason}`);
    return this.orchestrator.triggerCatchup(ws, reason);
  }

  async runCatchupNow(
    ws: string,
    reason = 'manual_sync',
  ): Promise<({ scheduled: true } & CatchupRunSummary) | { scheduled: false; reason?: string }> {
    this.logger.log(`Catchup sync requested for ws=${ws} reason=${reason}`);
    return this.orchestrator.runCatchupNow(ws, reason);
  }
}
