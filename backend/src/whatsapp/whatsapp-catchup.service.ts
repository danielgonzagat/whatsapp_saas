import { Inject, Injectable, forwardRef } from '@nestjs/common';
import { WhatsappCatchupOrchestratorService } from './whatsapp-catchup-orchestrator.service';

type CatchupRunSummary = {
  importedMessages: number;
  touchedChats: number;
  processedChats: number;
  overflow: boolean;
};

@Injectable()
export class WhatsAppCatchupService {
  constructor(
    @Inject(forwardRef(() => WhatsappCatchupOrchestratorService))
    private readonly orchestrator: WhatsappCatchupOrchestratorService,
  ) {}

  async triggerCatchup(ws: string, reason = 'unknown') {
    return this.orchestrator.triggerCatchup(ws, reason);
  }

  async runCatchupNow(
    ws: string,
    reason = 'manual_sync',
  ): Promise<({ scheduled: true } & CatchupRunSummary) | { scheduled: false; reason?: string }> {
    return this.orchestrator.runCatchupNow(ws, reason);
  }
}
