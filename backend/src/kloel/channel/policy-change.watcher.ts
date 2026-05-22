import { Injectable } from '@nestjs/common';
import type {
  ChannelKind,
  DetectionInput,
  PolicyChange,
  PolicySeverity,
} from './types';
import { filterByWorkspace } from './types';

@Injectable()
export class PolicyChangeWatcher {
  public assess(
    input: DetectionInput,
    channel: ChannelKind,
    changeDescription: string,
  ): PolicyChange {
    const nowMs = input.nowMs ?? Date.now();
    const wsEvents = filterByWorkspace(input.events, input.workspaceId);

    let severity: PolicySeverity = 'informational';
    const affectedFeatures: string[] = [];
    let impactPercent = 0;
    let requiresAction = false;

    const terms = changeDescription.toLowerCase();
    if (terms.includes('ban') || terms.includes('prohibit') || terms.includes('shutdown')) {
      severity = 'existential';
      impactPercent = 100;
      requiresAction = true;
      affectedFeatures.push('entire_channel');
    } else if (
      terms.includes('restrict') || terms.includes('limit') || terms.includes('deprecate')
    ) {
      severity = 'major';
      impactPercent = 50;
      requiresAction = true;
      affectedFeatures.push('send_capacity', 'automation');
    } else if (terms.includes('change') || terms.includes('update') || terms.includes('modify')) {
      severity = 'minor';
      impactPercent = 15;
      affectedFeatures.push('api_version', 'compliance');
    }

    const hasAutomationEvents = wsEvents.some(
      (e) =>
        e.eventName.includes('autopilot') || e.eventName.includes('campaign.sent'),
    );
    if (hasAutomationEvents && severity !== 'existential' && severity !== 'informational') {
      affectedFeatures.push('autopilot_pause_recommended');
      requiresAction = true;
    }

    return {
      workspaceId: input.workspaceId,
      channel,
      changeDescription: changeDescription.slice(0, 500),
      severity,
      affectedFeatures,
      estimatedImpactPercent: Math.round(Math.min(impactPercent, 100) * 10) / 10,
      detectedAt: new Date(nowMs).toISOString(),
      requiresAction,
    };
  }
}
