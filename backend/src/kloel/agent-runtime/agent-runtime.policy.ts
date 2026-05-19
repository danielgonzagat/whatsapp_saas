import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type {
  AgentRuntimeAuthorityMode,
  AgentRuntimePolicyEnvelope,
  AgentRuntimeRiskLevel,
} from './agent-runtime.types';

const CRITICAL_TOOLS = new Set(['create_payment_link', 'change_plan', 'update_billing_info']);
const HIGH_RISK_TOOLS = new Set(['create_campaign', 'send_whatsapp_message', 'send_audio']);
const NORMAL_TOOLS = new Set([
  'save_product',
  'delete_product',
  'toggle_autopilot',
  'set_sales_policy',
  'create_flow',
  'sync_whatsapp_history',
  'create_whatsapp_contact',
]);

@Injectable()
export class AgentRuntimePolicyService {
  buildEnvelope(params: {
    workspaceId: string;
    toolName: string;
    allowedTools?: string[];
  }): AgentRuntimePolicyEnvelope {
    const riskLevel = this.riskForTool(params.toolName);
    const explicitlyAllowed =
      !params.allowedTools?.length || params.allowedTools.includes(params.toolName);
    const requiresHumanApproval = riskLevel === 'high' || riskLevel === 'critical';
    const authorityMode = this.authorityFor(riskLevel, requiresHumanApproval);
    const reasons: string[] = [];

    if (!explicitlyAllowed) {
      reasons.push('tool_not_in_allowed_scope');
    }
    if (requiresHumanApproval) {
      reasons.push('human_approval_required_for_risk_level');
    }

    return {
      id: randomUUID(),
      workspaceId: params.workspaceId,
      toolName: params.toolName,
      riskLevel,
      authorityMode,
      allowed: explicitlyAllowed && !requiresHumanApproval,
      requiresHumanApproval,
      reasons,
      createdAt: new Date().toISOString(),
    };
  }

  riskForTool(toolName: string): AgentRuntimeRiskLevel {
    if (CRITICAL_TOOLS.has(toolName)) {
      return 'critical';
    }
    if (HIGH_RISK_TOOLS.has(toolName)) {
      return 'high';
    }
    if (NORMAL_TOOLS.has(toolName)) {
      return 'normal';
    }
    return toolName.startsWith('get_') || toolName.startsWith('list_') ? 'safe' : 'normal';
  }

  private authorityFor(
    riskLevel: AgentRuntimeRiskLevel,
    requiresHumanApproval: boolean,
  ): AgentRuntimeAuthorityMode {
    if (requiresHumanApproval) {
      return 'human_required';
    }
    return riskLevel === 'safe' || riskLevel === 'normal' ? 'tool_limited' : 'advisory';
  }
}
