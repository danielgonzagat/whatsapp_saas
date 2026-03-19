import { Injectable } from '@nestjs/common';
import { AgentEventsService } from '../whatsapp/agent-events.service';
import { CiaRuntimeService } from '../whatsapp/cia-runtime.service';

@Injectable()
export class CiaService {
  constructor(
    private readonly runtime: CiaRuntimeService,
    private readonly agentEvents: AgentEventsService,
  ) {}

  async getSurface(workspaceId: string) {
    const intelligence = await this.runtime.getOperationalIntelligence(workspaceId);
    const recent = this.agentEvents.getRecent(workspaceId).slice(-12);
    const latest = recent[recent.length - 1] || null;
    const businessState = (intelligence.businessState || {}) as Record<string, any>;

    return {
      title: 'KLOEL',
      subtitle: 'Trabalhando no seu WhatsApp',
      workspaceName: intelligence.workspaceName,
      state: intelligence.runtime?.state || 'IDLE',
      today: {
        soldAmount: Number(businessState.approvedSalesAmount || 0) || 0,
        activeConversations: Number(businessState.openBacklog || 0) || 0,
        pendingPayments: Number(businessState.pendingPaymentCount || 0) || 0,
      },
      now: latest
        ? {
            message: latest.message,
            phase: latest.phase || null,
            type: latest.type,
            ts: latest.ts,
          }
        : null,
      recent,
      businessState: intelligence.businessState,
      humanTasks: intelligence.humanTasks?.slice?.(0, 5) || [],
      marketSignals: intelligence.marketSignals?.slice?.(0, 5) || [],
      insights: intelligence.insights?.slice?.(0, 5) || [],
      runtime: intelligence.runtime,
    };
  }

  async activateAutopilotTotal(workspaceId: string, limit?: number) {
    return this.runtime.activateAutopilotTotal(workspaceId, limit);
  }
}
