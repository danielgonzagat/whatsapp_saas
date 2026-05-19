/**
 * ARCHITECTURAL COHESION: This file is a single organism — the Flow Node
 * Dispatcher. It maps 25+ node types to their handler implementations via
 * a single switch/case statement. Each handler delegates to a specialized
 * module (executeAiNode → flow-node-executor.ai.ts, executeActionNode →
 * flow-node-executor.actions.ts, etc.). The switch itself is the
 * authoritative registry of all supported node types in the flow system.
 * Splitting the switch by node category would create an indirection tax
 * without reducing complexity — every new node type must be registered
 * here regardless of which file it lives in.
 */

import type { Prisma } from '@prisma/client';
import {
  readNumber,
  readObject,
  readOptionalString,
  readString,
  varAsString,
} from './flow-engine.helpers';
import type { ExecutionState, FlowNode } from './flow-engine.types';
import { prisma } from './db';
import { CRM } from './providers/crm';
import { redis } from './redis-client';

const PATTERN_RE = /\{\{(.*?)\}\}/g;

import { executeActionNode, executeInputNode } from './flow-node-executor.actions';
import { executeAiNode } from './flow-node-executor.ai';
import { executeApiNode } from './flow-node-executor.api';
import {
  executeAutoPitchNode,
  executeMediaNode,
  executeVoiceNode,
  executeWaitForReplyNode,
} from './flow-node-executor.interactions';
import type { FlowNodeExecutorDeps, FlowNodeResult } from './flow-node-executor.types';

export async function executeNode(
  deps: FlowNodeExecutorDeps,
  state: ExecutionState,
  node: FlowNode,
): Promise<FlowNodeResult> {
  switch (node.type) {
    case 'messageNode': {
      const template = readString(node.data, 'text');
      const text = template.replace(PATTERN_RE, (_, key) => {
        const k = String(key).trim();
        return varAsString(state.variables[k]);
      });
      await deps.sendMessage(state.user, text, state.workspaceId);
      return node.next ?? 'END';
    }

    case 'message':
      await deps.sendMessage(state.user, readString(node.data, 'text'), state.workspaceId);
      return node.next ?? 'END';

    case 'delayNode':
    case 'delay':
      await deps.sleep(readNumber(node.data, 'seconds') * 1000);
      return node.next ?? 'END';

    case 'waitNode': {
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
          deps.log.error('waitnode_lpop_error', {
            user: state.user,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      if (pendingMessage) {
        const raw = pendingMessage;
        const keywords = readString(node.data, 'expectedKeywords')
          .split(',')
          .map((k: string) => k.trim().toLowerCase())
          .filter(Boolean);
        const matched =
          keywords.length === 0
            ? true
            : keywords.some((k: string) => raw.toLowerCase().includes(k));

        state.variables.last_user_message = undefined;

        state.waitingForResponse = false;
        state.timeoutAt = undefined;
        return matched ? node.yes || node.next || 'END' : node.no || node.next || 'END';
      }

      state.waitingForResponse = true;
      const waitTimeoutSeconds =
        readNumber(node.data, 'timeoutSeconds', 0) || readNumber(node.data, 'timeout', 0) || 3600;
      state.timeoutAt = Date.now() + waitTimeoutSeconds * 1000;
      await deps.context.zadd(
        'timeouts',
        state.timeoutAt,
        deps.timeoutMember(state.user, state.workspaceId),
      );
      return 'WAIT';
    }

    case 'wait_response':
      if (!state.variables.last_user_message) {
        try {
          const pending = await redis.lpop(`reply:${state.user}`);
          if (pending) {
            state.variables.last_user_message = pending;
          }
        } catch (err) {
          deps.log.error('waitresponse_lpop_error', {
            user: state.user,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      if (state.variables.last_user_message) {
        state.variables.last_user_message = undefined;
        state.waitingForResponse = false;
        state.timeoutAt = undefined;
        return node.next ?? 'END';
      }

      state.waitingForResponse = true;
      state.timeoutAt = Date.now() + readNumber(node.data, 'timeout') * 1000;
      await deps.context.zadd(
        'timeouts',
        state.timeoutAt,
        deps.timeoutMember(state.user, state.workspaceId),
      );
      return 'WAIT';

    case 'condition': {
      const val = deps.evaluate(readString(node.data, 'expression'), state.variables);
      return val ? node.yes || 'END' : node.no || 'END';
    }

    case 'conditionNode': {
      const variableName = readString(node.data, 'variable');
      const operator = readString(node.data, 'operator', '==');
      const expectedValue = node.data?.value;
      const actualValue = variableName ? state.variables[variableName] : undefined;

      let result = false;
      switch (operator) {
        case '==':
          result = String(actualValue) === String(expectedValue);
          break;
        case '!=':
          result = String(actualValue) !== String(expectedValue);
          break;
        case '>':
          result = Number(actualValue) > Number(expectedValue);
          break;
        case '<':
          result = Number(actualValue) < Number(expectedValue);
          break;
        case 'contains':
          result = String(actualValue || '').includes(String(expectedValue));
          break;
        default:
          result = String(actualValue) === String(expectedValue);
      }
      return result ? node.yes || node.next || 'END' : node.no || node.next || 'END';
    }

    case 'subflow': {
      (state.stack ?? []).push({ flowId: state.flowId, nodeId: node.next || 'END' });
      const targetFlow = readString(node.data, 'targetFlow');
      const targetNode = readString(node.data, 'targetNode');
      state.flowId = targetFlow;
      state.nodeId = targetNode;
      return targetNode;
    }

    case 'return': {
      const ctx = state.stack?.pop();
      if (!ctx) {
        return 'END';
      }
      state.flowId = ctx.flowId;
      return ctx.nodeId;
    }

    case 'save_variable': {
      const key = readString(node.data, 'key');
      const value = readString(node.data, 'value');
      const finalValue = deps.evaluate(value, state.variables);
      state.variables[key] = finalValue;

      if (key.startsWith('contact.')) {
        const field = key.replace('contact.', '');
        await CRM.updateContact(state.workspaceId, state.user, {
          customFields: { [field]: finalValue },
        });
      }
      return node.next ?? 'END';
    }

    case 'apiNode':
      return executeApiNode(deps, state, node);

    case 'tagNode': {
      const action = readString(node.data, 'action');
      const tag = readString(node.data, 'tag');
      if (!tag) {
        return node.next ?? 'END';
      }
      if (action === 'remove') {
        await CRM.removeTag(state.workspaceId, state.user, tag);
      } else {
        await CRM.addTag(state.workspaceId, state.user, tag);
      }
      return node.next ?? 'END';
    }

    case 'crmNode': {
      const action = readString(node.data, 'action');
      const attribute = readString(node.data, 'attribute');
      const value = node.data?.value;
      if (action === 'setAttribute' && attribute) {
        await CRM.setAttribute(
          state.workspaceId,
          state.user,
          attribute,
          (value ?? null) as Prisma.InputJsonValue | null,
        );
        state.variables[attribute] = value;
      } else if (action === 'getAttribute' && attribute) {
        const val = await CRM.getAttribute(state.workspaceId, state.user, attribute);
        state.variables[attribute] = val;
      } else if (action === 'saveContact') {
        await CRM.saveContact(state.workspaceId, state.user, state.variables);
      }
      return node.next ?? 'END';
    }

    case 'updateStageNode': {
      const { pipelineId, stageId } = node.data || {};
      if (pipelineId && stageId) {
        try {
          const deals = await prisma.deal.findMany({
            where: {
              contact: { phone: state.user, workspaceId: state.workspaceId },
              stage: { pipelineId },
              status: 'OPEN',
            },
            orderBy: { createdAt: 'desc' },
            take: 1,
          });

          if (deals.length > 0) {
            const deal = deals[0];
            await prisma.deal.update({
              where: { id: deal.id },
              data: { stageId },
            });
            deps.log.info('deal_moved', { dealId: deal.id, stageId });
          } else {
            deps.log.warn('deal_not_found_for_move', { user: state.user, pipelineId });
          }
        } catch (err) {
          deps.log.error('update_stage_error', { error: err });
        }
      }
      return node.next ?? 'END';
    }

    case 'campaignNode': {
      const campaignId = readString(node.data, 'campaignId');
      const action = readString(node.data, 'action');
      if (campaignId) {
        const { Campaigns } = await import('./providers/campaigns');
        await Campaigns.run({ id: campaignId, user: state.user, action });
      }
      return node.next ?? 'END';
    }

    case 'switch': {
      const variable = readString(node.data, 'variable');
      const casesRaw = node.data?.cases;
      const defaultCase = readString(node.data, 'defaultCase');
      const value = variable ? state.variables[variable] : undefined;

      type SwitchCase = { value: unknown; target: string };
      const cases: SwitchCase[] = Array.isArray(casesRaw)
        ? casesRaw.filter(
            (c): c is SwitchCase =>
              !!c &&
              typeof c === 'object' &&
              'target' in c &&
              typeof (c as { target: unknown }).target === 'string',
          )
        : [];
      const match = cases.find((c) => String(c.value) === String(value));
      if (match) {
        return match.target;
      }

      return defaultCase || node.next || 'END';
    }

    case 'goToNode': {
      const targetNodeId = readString(node.data, 'targetNodeId');
      if (targetNodeId) {
        deps.log.info('goto_node', { from: node.id, to: targetNodeId });
        return targetNodeId;
      }
      return node.next ?? 'END';
    }
    case 'gotoNode': {
      const targetId = readString(node.data, 'targetId');
      if (targetId) {
        deps.log.info('goto_node', { from: node.id, to: targetId });
        return targetId;
      }
      return node.next ?? 'END';
    }

    case 'emotionNode': {
      const msg = varAsString(state.variables.last_user_message).toLowerCase();
      const has = (...ks: string[]) => ks.some((k) => msg.includes(k));

      let emotion = 'neutral';
      if (
        has('raiva', 'irrit', 'p*to', 'p...to', 'odio', 'odiei', 'horrivel', 'péssimo', 'pessimo')
      ) {
        emotion = 'angry';
      } else if (has('não entendi', 'nao entendi', 'confuso', 'confusão', 'como assim', '??')) {
        emotion = 'confused';
      } else if (has('ansioso', 'ansiosa', 'preocup', 'urgente', 'agora', 'imediato')) {
        emotion = 'anxious';
      } else if (has('ótimo', 'otimo', 'perfeito', 'gostei', 'massa', 'legal', 'show')) {
        emotion = 'happy';
      } else if (
        has('comprar', 'quanto custa', 'fechar', 'preço', 'preco', 'quero', 'vamos fechar')
      ) {
        emotion = 'buying';
      }

      state.variables.emotion = emotion;

      const emotionMap = readObject(node.data, 'map');
      const mapped = emotionMap?.[emotion];
      const target = (typeof mapped === 'string' ? mapped : '') || node.next || 'END';
      return target;
    }

    case 'autoPitchNode':
      return executeAutoPitchNode(deps, state, node);

    case 'mediaNode':
      return executeMediaNode(deps, state, node);

    case 'voiceNode':
      return executeVoiceNode(deps, state, node);

    case 'waitForReply':
      return executeWaitForReplyNode(deps, state, node);

    // ── Frontend FlowBuilder node types (bridged to engine handlers) ──

    case 'start':
      // start node is the entry point; passthrough
      return node.next ?? 'END';

    case 'end': {
      const endAction = readString(node.data, 'endAction', 'complete');
      if (endAction === 'handoff') {
        const handoffMessage =
          readOptionalString(node.data, 'handoffMessage') || 'Transferindo para atendente...';
        await deps.sendMessage(state.user, handoffMessage, state.workspaceId);
      }
      return 'END';
    }

    case 'ai':
    case 'aiNode':
    case 'gptNode':
    case 'aiKbNode':
      return executeAiNode(deps, state, node);

    case 'action':
      return executeActionNode(deps, state, node);

    case 'input':
      return executeInputNode(deps, state, node);

    default:
      deps.log.warn('unknown_node_type', { nodeId: node.id, type: node.type });
      return node.next ?? 'END';
  }
}
