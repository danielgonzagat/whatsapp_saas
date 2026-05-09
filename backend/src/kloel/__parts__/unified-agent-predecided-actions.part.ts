import { forEachSequential } from '../../common/async-sequence';
import type { ActionEntry, PredecidedAction, ToolArgs } from '../unified-agent.types';

type UnknownRecord = Record<string, unknown>;

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
  const allowed = input.allowedTools?.length ? new Set(input.allowedTools) : null;
  const actionsList: ActionEntry[] = [];

  await forEachSequential(input.predecidedActions, async (action) => {
    if (allowed && !allowed.has(action.tool)) {
      actionsList.push({
        tool: action.tool,
        args: action.args,
        result: { blocked: true, reason: 'capability_not_allowed' },
      });
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
