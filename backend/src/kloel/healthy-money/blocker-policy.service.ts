/**
 * UTP-HEALTHYMONEY-007 — Blocker Policy Service.
 *
 * Owner-revisable policy for unhealthy sale blocking. Maintains
 * active policies per workspace and allows rule configuration
 * by the owner. Emits revisions as observable state.
 *
 * Implements B0.7: bloqueador de venda ruim com politica
 * revisitavel pelo dono.
 */
import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { BlockerPolicy, BlockerPolicyRule } from './healthy-money.types';

const DEFAULT_RULES: readonly BlockerPolicyRule[] = [
  {
    ruleId: 'rule_quality_toxic',
    label: 'Bloquear vendas com qualidade toxica',
    condition: 'quality_tier_toxic' as const,
    action: 'block' as const,
    priority: 1,
  },
  {
    ruleId: 'rule_refund_risk',
    label: 'Bloquear vendas com risco de refund >= 50%',
    condition: 'refund_risk_gte_50pct' as const,
    action: 'block' as const,
    priority: 2,
  },
  {
    ruleId: 'rule_brand_wear',
    label: 'Alertar sobre desgaste de marca critico',
    condition: 'brand_wear_gte_70pct' as const,
    action: 'warn' as const,
    priority: 3,
  },
  {
    ruleId: 'rule_support_cost',
    label: 'Alertar sobre custo de suporte elevado',
    condition: 'support_cost_gte_2000_cents' as const,
    action: 'warn' as const,
    priority: 4,
  },
  {
    ruleId: 'rule_margin',
    label: 'Alertar sobre margem abaixo de 20%',
    condition: 'margin_lt_20pct' as const,
    action: 'warn' as const,
    priority: 5,
  },
];

@Injectable()
export class BlockerPolicyService {
  private readonly policies = new Map<string, BlockerPolicy>();

  public getPolicy(workspaceId: string): BlockerPolicy {
    const existing = this.policies.get(workspaceId);
    if (existing) {
      return existing;
    }
    return this.createDefaultPolicy(workspaceId);
  }

  public setActive(workspaceId: string, active: boolean): BlockerPolicy {
    const current = this.getPolicy(workspaceId);
    const updated: BlockerPolicy = {
      ...current,
      active,
      lastRevisedAt: new Date().toISOString(),
      revisedBy: 'owner',
    };
    this.policies.set(workspaceId, updated);
    return updated;
  }

  public replaceRules(workspaceId: string, rules: readonly BlockerPolicyRule[]): BlockerPolicy {
    const current = this.getPolicy(workspaceId);
    const updated: BlockerPolicy = {
      ...current,
      rules,
      lastRevisedAt: new Date().toISOString(),
      revisedBy: 'owner',
    };
    this.policies.set(workspaceId, updated);
    return updated;
  }

  public addRule(workspaceId: string, rule: Omit<BlockerPolicyRule, 'ruleId'>): BlockerPolicy {
    const current = this.getPolicy(workspaceId);
    const newRule: BlockerPolicyRule = {
      ...rule,
      ruleId: `rule_${randomUUID()}`,
    };
    const updated: BlockerPolicy = {
      ...current,
      rules: [...current.rules, newRule],
      lastRevisedAt: new Date().toISOString(),
      revisedBy: 'owner',
    };
    this.policies.set(workspaceId, updated);
    return updated;
  }

  public removeRule(workspaceId: string, ruleId: string): BlockerPolicy {
    const current = this.getPolicy(workspaceId);
    const updated: BlockerPolicy = {
      ...current,
      rules: current.rules.filter((r) => r.ruleId !== ruleId),
      lastRevisedAt: new Date().toISOString(),
      revisedBy: 'owner',
    };
    this.policies.set(workspaceId, updated);
    return updated;
  }

  public resetToDefaults(workspaceId: string): BlockerPolicy {
    const policy = this.createDefaultPolicy(workspaceId);
    this.policies.set(workspaceId, policy);
    return policy;
  }

  public isActive(workspaceId: string): boolean {
    return this.getPolicy(workspaceId).active;
  }

  public activeWorkspacesCount(): number {
    let count = 0;
    for (const [, policy] of this.policies) {
      if (policy.active) {
        count++;
      }
    }
    return count + 1;
  }

  private createDefaultPolicy(workspaceId: string): BlockerPolicy {
    return {
      policyId: `policy_${randomUUID()}`,
      workspaceId,
      active: true,
      rules: DEFAULT_RULES,
      lastRevisedAt: new Date().toISOString(),
      revisedBy: 'system',
    };
  }
}
