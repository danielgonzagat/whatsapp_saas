import { Injectable, Logger } from '@nestjs/common';
import { SpineEmitterService } from '../spine/spine-emitter.service';
import type { ChurnRiskAssessment, WinBackPlan, WinBackTacticKind, DetectionInput } from './postsale-consumers.types';
import { daysSince, filterByWorkspace, latestEvent } from './postsale-consumers.types';

const PROCESSOR_NAME = 'winback-window-advisor';
const PROCESSOR_VERSION = '1.0.0';
const SCHEMA_VERSION = '1.0.0';

@Injectable()
export class WinBackWindowAdvisor {
  private readonly logger = new Logger(WinBackWindowAdvisor.name);

  public constructor(private readonly spine: SpineEmitterService) {}

  public async assess(
    risk: ChurnRiskAssessment,
    input: DetectionInput,
  ): Promise<WinBackPlan> {
    const nowMs = input.nowMs ?? Date.now();
    const wsEvents = filterByWorkspace(input.events, input.workspaceId);
    const entityRef = input.entityRef ?? risk.entityRef;

    let windowDays = 0;
    let tacticKind: WinBackTacticKind;
    let description: string;
    let suggestedChannel: WinBackPlan['suggestedChannel'] = 'silent';
    let windowOpen = false;

    if (risk.riskLevel === 'critical') {
      windowDays = 7;
      tacticKind = 'conditional_return_offer';
      description = 'Offer a structured return path with clear conditions and no pressure — the customer decides the terms.';
      suggestedChannel = 'email';
      windowOpen = true;
    } else if (risk.riskLevel === 'high') {
      windowDays = 14;
      tacticKind = 'departure_survey';
      description = 'Send a brief departure survey asking what could have been better. No offer attached — pure listening.';
      suggestedChannel = 'email';
      windowOpen = true;
    } else if (risk.riskLevel === 'moderate') {
      windowDays = 30;
      tacticKind = 'product_evolution_update';
      description = 'Inform the customer of relevant product improvements made since their last interaction. Informational, not promotional.';
      suggestedChannel = 'email';
      windowOpen = true;
    } else {
      windowDays = 90;
      tacticKind = 'reengagement_content';
      description = 'Share educational content aligned with the customer\'s original interest — no offer, no urgency.';
      suggestedChannel = 'silent';
      windowOpen = false;
    }

    if (windowOpen) {
      await this.emitWindow(risk.workspaceId, entityRef, tacticKind);
    }

    return {
      workspaceId: risk.workspaceId,
      entityRef,
      winBackWindowDays: windowDays,
      windowOpen,
      tacticKind,
      description,
      suggestedChannel,
      assessedAt: new Date(nowMs).toISOString(),
    };
  }

  private async emitWindow(
    workspaceId: string,
    entityRef: { readonly entityType: string; readonly entityId: string },
    tactic: WinBackTacticKind,
  ): Promise<void> {
    try {
      await this.spine.emit({
        eventName: 'commerce.post_sale.win_back_window_opened',
        workspaceId,
        entityRef,
        truthMode: 'inferred',
        provenance: {
          source: 'production',
          processor: PROCESSOR_NAME,
          processorVersion: PROCESSOR_VERSION,
          schemaVersion: SCHEMA_VERSION,
        },
        payload: { tacticKind: tactic },
      });
    } catch (err: unknown) {
      this.logger.error(
        `failed to emit win_back_window_opened for ws ${workspaceId}: ${(err as Error)?.message ?? String(err)}`,
      );
    }
  }
}
