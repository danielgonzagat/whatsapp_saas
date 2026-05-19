import { forEachSequential } from '../common/async-sequence';
import type { ActionEntry, PredecidedAction, ToolArgs } from './unified-agent.types';
import { getBrainCapabilityRisk } from './brain-capability-policy';
import type { BrainCapabilityRisk } from './brain-capability-policy';

type UnknownRecord = Record<string, unknown>;

type RiskClassLabel = 'R1' | 'R2' | 'R3';

interface CapabilityBlockResult {
  blocked: true;
  reason: 'capability_not_allowed';
  riskClass: RiskClassLabel;
  approvalRequired: boolean;
  escalation: string;
  safeNextStep: string;
  rollback: string;
}

function mapBrainRiskToRiskClass(risk: BrainCapabilityRisk): RiskClassLabel {
  if (risk === 'critical') return 'R3';
  if (risk === 'high') return 'R2';
  return 'R1';
}

function buildCapabilityBlockResult(tool: string): CapabilityBlockResult {
  const risk = getBrainCapabilityRisk(tool);
  const riskClass = mapBrainRiskToRiskClass(risk);

  const approvalRequired = riskClass !== 'R1';
  const escalation =
    riskClass === 'R3'
      ? 'human_operator_required'
      : riskClass === 'R2'
        ? 'workspace_owner_review'
        : 'none';
  const safeNextStep =
    tool === 'create_payment_link'
      ? 'redirect_to_manual_checkout'
      : tool === 'send_message'
        ? 'respond_without_tool'
        : 'use_allowed_alternative';

  return {
    blocked: true,
    reason: 'capability_not_allowed',
    riskClass,
    approvalRequired,
    escalation,
    safeNextStep,
    rollback: 'not_executed',
  };
}

function isCapabilityBlockResult(value: unknown): value is CapabilityBlockResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return record.blocked === true && record.reason === 'capability_not_allowed';
}

export type PredecidedToolExecutor = (
  workspaceId: string,
  contactId: string,
  phone: string,
  tool: string,
  args: ToolArgs,
  context?: UnknownRecord,
) => Promise<unknown>;

export type PredecidedActionLogger = (
  workspaceId: string,
  contactId: string,
  tool: string,
  args: ToolArgs,
  result: unknown,
) => Promise<unknown>;

export async function executePredecidedAgentActions(input: {
  allowedTools?: string[];
  contactId: string;
  context?: UnknownRecord;
  executeTool: PredecidedToolExecutor;
  logAutopilotEvent: PredecidedActionLogger;
  phone: string;
  predecidedActions: PredecidedAction[];
  workspaceId: string;
}): Promise<ActionEntry[]> {
  const allowed = typeof input.allowedTools === 'undefined' ? null : new Set(input.allowedTools);
  const actionsList: ActionEntry[] = [];

  await forEachSequential(input.predecidedActions, async (action) => {
    if (allowed && !allowed.has(action.tool)) {
      const blockedResult = buildCapabilityBlockResult(action.tool);
      actionsList.push({
        tool: action.tool,
        args: action.args,
        result: blockedResult,
      });
      await input.logAutopilotEvent(
        input.workspaceId,
        input.contactId,
        action.tool,
        action.args,
        blockedResult,
      );
      return;
    }

    const result = await input.executeTool(
      input.workspaceId,
      input.contactId,
      input.phone,
      action.tool,
      action.args,
      input.context,
    );
    actionsList.push({ tool: action.tool, args: action.args, result });
    await input.logAutopilotEvent(
      input.workspaceId,
      input.contactId,
      action.tool,
      action.args,
      result,
    );
  });

  return actionsList;
}

export function buildPredecidedActionDraft(actions: ActionEntry[]): string {
  if (actions.length === 0) {
    return 'Ação comercial validada: responder com clareza e próximo passo.';
  }

  return actions
    .map((action) => {
      if (isCapabilityBlockResult(action.result)) {
        if (action.tool === 'create_payment_link') {
          return 'Link de pagamento não enviado: ação exige aprovação humana antes de avançar.';
        }
        if (action.tool === 'send_message') {
          return 'Mensagem não enviada: ação fora da política permitida; responder sem ferramenta ou pedir aprovação.';
        }
        return `Ação não executada: ${action.tool} exige ${action.result.escalation}.`;
      }
      if (action.tool === 'send_message') {
        return `Mensagem enviada: ${String(action.args.message || action.args.text || '').trim()}`;
      }
      if (action.tool === 'schedule_followup') {
        return 'Follow-up agendado conforme política comercial.';
      }
      if (action.tool === 'transfer_to_human') {
        return 'Transferência para atendimento humano iniciada.';
      }
      if (action.tool === 'create_payment_link') {
        return 'Link de pagamento preparado e enviado.';
      }
      return `Ação executada: ${action.tool}.`;
    })
    .join(' ');
}
