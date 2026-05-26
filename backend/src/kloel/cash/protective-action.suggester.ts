import { Injectable } from '@nestjs/common';
import type { ProtectiveAction, ProtectiveActionKind, RiskDetection } from './types';

/**
 * CASH-007 — ProtectiveActionSuggester.
 *
 * Given a risk detection result, suggests specific protective actions.
 * Maps risk triggers to concrete actions with urgency levels.
 * Prioritizes actions by urgency and impact.
 */
@Injectable()
export class ProtectiveActionSuggester {
  private counter = 0;

  public suggest(risk: RiskDetection): readonly ProtectiveAction[] {
    const actions: ProtectiveAction[] = [];

    for (const trigger of risk.triggers) {
      const mapped = this.mapTrigger(trigger, risk.workspaceId);
      if (mapped) {
        actions.push(mapped);
      }
    }

    return actions;
  }

  public prioritize(actions: readonly ProtectiveAction[]): readonly ProtectiveAction[] {
    const ranked = [...actions].map((a) => ({
      ...a,
      priority: this.urgencyWeight(a.urgency) * a.impact,
    }));
    return ranked.sort((a, b) => b.priority - a.priority).map(({ priority: _, ...a }) => a);
  }

  private mapTrigger(trigger: string, workspaceId: string): ProtectiveAction | null {
    if (trigger.startsWith('runway_critical')) {
      return this.makeAction(workspaceId, 'emergency_fund', 'Emergency fund activation needed — runway is critically low', 'now', 5.0);
    }
    if (trigger.startsWith('runway_high')) {
      return this.makeAction(workspaceId, 'reduce_burn', 'Reduce burn rate immediately — runway is below safe threshold', 'now', 4.0);
    }
    if (trigger.startsWith('runway_medium')) {
      return this.makeAction(workspaceId, 'reduce_burn', 'Review and plan burn rate reductions', 'soon', 3.0);
    }
    if (trigger.startsWith('trend_30d_critical') || trigger === 'negative_balance_and_projection') {
      return this.makeAction(workspaceId, 'freeze_spending', 'Freeze all non-essential spending', 'now', 5.0);
    }
    if (trigger.startsWith('trend_14d_high')) {
      return this.makeAction(workspaceId, 'reduce_burn', 'Identify and cut discretionary spending', 'now', 3.5);
    }
    if (trigger.startsWith('trend_7d_medium')) {
      return this.makeAction(workspaceId, 'accelerate_collections', 'Accelerate receivables collection', 'soon', 2.5);
    }
    if (trigger.startsWith('margin_of_safety')) {
      return this.makeAction(workspaceId, 'reduce_burn', 'Build safety margin — reduce monthly commitments', 'soon', 2.0);
    }
    if (trigger.startsWith('volatility_extreme')) {
      return this.makeAction(workspaceId, 'freeze_spending', 'Freeze spending until volatility stabilizes', 'now', 3.0);
    }
    if (trigger.startsWith('volatility_elevated')) {
      return this.makeAction(workspaceId, 'reduce_burn', 'Build cash buffer to absorb volatility shocks', 'soon', 2.0);
    }
    if (trigger.startsWith('coverage_30d_negative')) {
      return this.makeAction(workspaceId, 'emergency_fund', 'Coverage gap threatens solvency — activate emergency protocol', 'now', 5.0);
    }
    if (trigger.startsWith('no_receivables')) {
      return this.makeAction(workspaceId, 'accelerate_collections', 'No receivables expected — push for immediate collections', 'now', 3.5);
    }
    return null;
  }

  private makeAction(
    workspaceId: string,
    kind: ProtectiveActionKind,
    description: string,
    urgency: ProtectiveAction['urgency'],
    impact: number,
  ): ProtectiveAction {
    this.counter += 1;
    return {
      actionId: `pa_${this.counter}_${Date.now()}`,
      workspaceId,
      kind,
      description,
      urgency,
      impact,
    };
  }

  private urgencyWeight(urgency: ProtectiveAction['urgency']): number {
    if (urgency === 'now') {return 3;}
    if (urgency === 'soon') {return 2;}
    return 1;
  }
}
