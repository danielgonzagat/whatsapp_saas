import { readObject, readString, varAsString } from './flow-engine.helpers';
import type { ExecutionState, FlowNode } from './flow-engine.types';
import { prisma } from './db';
import { CRM } from './providers/crm';
import { redis } from './redis-client';
import { isUrlAllowed, safeRequest, validateUrl } from './utils/ssrf-protection';
import type { FlowNodeExecutorDeps, FlowNodeResult } from './flow-node-executor.types';

const PATTERN_RE = /\{\{(.*?)\}\}/g;

export async function executeActionNode(
  deps: FlowNodeExecutorDeps,
  state: ExecutionState,
  node: FlowNode,
): Promise<FlowNodeResult> {
  const actionType = readString(node.data, 'actionType', 'tag');
  const config = readObject(node.data, 'config') || {};

  switch (actionType) {
    case 'tag': {
      const tagName = readString(config, 'tagName');
      if (tagName) {
        await CRM.addTag(state.workspaceId, state.user, tagName);
      }
      break;
    }
    case 'variable': {
      const varKey = readString(config, 'key');
      const varValue = readString(config, 'value');
      if (varKey) {
        state.variables[varKey] = deps.evaluate(varValue, state.variables);
      }
      break;
    }
    case 'webhook': {
      const url = readString(config, 'webhookUrl');
      const method = readString(config, 'method', 'POST');
      if (url) {
        try {
          const allowlist = (process.env.API_NODE_ALLOWLIST || '')
            .split(',')
            .map((u) => u.trim())
            .filter(Boolean);

          const validation = await validateUrl(url);
          if (!validation.valid) {
            deps.log.warn('action_webhook_ssrf_blocked', {
              user: state.user,
              url: url.substring(0, 100),
              error: validation.error,
            });
            throw new Error(`action_webhook_blocked: ${validation.error}`);
          }

          if (!isUrlAllowed(url, allowlist)) {
            throw new Error('action_webhook_blocked_not_allowlisted');
          }

          await safeRequest({
            url,
            method,
            timeout: 10000,
            maxRedirects: 3,
            allowlist,
          });
        } catch (err) {
          deps.log.error('action_webhook_error', {
            user: state.user,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
      break;
    }
    case 'assignAgent':
    case 'notification': {
      const message = readString(config, 'message');
      if (message) {
        await deps.sendMessage(
          state.user,
          message.replace(PATTERN_RE, (_, key) => varAsString(state.variables[String(key).trim()])),
          state.workspaceId,
        );
      }
      break;
    }
    case 'createLead':
    case 'updateLead': {
      const leadName = readString(config, 'name');
      const leadPhone = readString(config, 'phone') || state.user;
      if (leadName || leadPhone) {
        try {
          let contact = await prisma.contact.findUnique({
            where: { workspaceId_phone: { workspaceId: state.workspaceId, phone: leadPhone } },
          });
          if (!contact) {
            contact = await prisma.contact.create({
              data: {
                workspaceId: state.workspaceId,
                phone: leadPhone,
                name: leadName || leadPhone,
              },
            });
          } else if (leadName) {
            await prisma.contact.update({
              where: { id: contact.id, workspaceId: state.workspaceId },
              data: { name: leadName },
            });
          }
          state.variables.lead_created = contact.id;
        } catch (err) {
          deps.log.error('action_lead_error', {
            user: state.user,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
      break;
    }
    default:
      deps.log.warn('unknown_action_type', {
        nodeId: node.id,
        actionType,
      });
  }
  return node.next ?? 'END';
}

export async function executeInputNode(
  deps: FlowNodeExecutorDeps,
  state: ExecutionState,
  node: FlowNode,
): Promise<FlowNodeResult> {
  const question = readString(node.data, 'question');
  const variableName = readString(node.data, 'variableName');
  const inputType = readString(node.data, 'inputType', 'text');

  // If there's a pending message, save it and continue
  const lastUserMessage = state.variables.last_user_message;
  let pendingMessage: string | undefined =
    typeof lastUserMessage === 'string' ? lastUserMessage : undefined;

  if (!pendingMessage) {
    try {
      const lpopped = await redis.lpop(`reply:${state.user}`);
      pendingMessage = lpopped ?? undefined;
      if (pendingMessage) {
        state.variables.last_user_message = pendingMessage;
      }
    } catch (err) {
      deps.log.error('input_lpop_error', {
        user: state.user,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (pendingMessage) {
    state.variables.last_user_message = undefined;
    if (variableName) {
      if (inputType === 'number') {
        state.variables[variableName] = Number(pendingMessage);
      } else {
        state.variables[variableName] = pendingMessage;
      }
    }
    state.variables.last_collected_input = pendingMessage;
    state.waitingForResponse = false;
    state.timeoutAt = undefined;
    return node.yes || node.next || 'END';
  }

  // If a question is configured, ask it first
  if (question && !state.variables._input_question_sent) {
    state.variables._input_question_sent = true;
    const finalQuestion = question.replace(PATTERN_RE, (_, key) =>
      varAsString(state.variables[String(key).trim()]),
    );
    await deps.sendMessage(state.user, finalQuestion, state.workspaceId);
  }

  state.waitingForResponse = true;
  state.timeoutAt = Date.now() + 3600_000; // 1 hour default
  await deps.context.zadd(
    'timeouts',
    state.timeoutAt,
    deps.timeoutMember(state.user, state.workspaceId),
  );
  return 'WAIT';
}
