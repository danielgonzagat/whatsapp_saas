import { BadRequestException, Injectable } from '@nestjs/common';
import { StructuredLogger } from '../logging/structured-logger';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import {
  didBrainActionSucceed,
  mapBrainActionToDomainEvent,
  readBrainActionName,
} from './brain-action-event-mapper';
import { BrainCapabilityExecutorService } from './brain-capability-executor.service';
import { BrainCapabilityRegistryService } from './brain-capability-registry.service';
import { BrainCommercialGraphService } from './brain-commercial-graph.service';
import type { CommercialGraphRecommendation } from './brain-commercial-graph.types';
import { BrainEventSpineService } from './brain-event-spine.service';
import { BRAIN_EVENT_TAXONOMY } from './brain-event-taxonomy';
import { BrainDecideDto, BrainObserveDto } from './brain-runtime.dto';
import { KloelThreadService } from './kloel-thread.service';
import { UnifiedAgentContextDataService } from './unified-agent-context-data.service';
import { UnifiedAgentService } from './unified-agent.service';
import type { PredecidedAction } from './unified-agent.types';

function latestUserText(messages: BrainDecideDto['messages']): string | undefined {
  if (!messages?.length) {
    return undefined;
  }
  return [...messages]
    .reverse()
    .find((message) => message.role === 'user' && message.content.trim())?.content;
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function cloneJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function buildPredecidedActions(input: {
  allowedTools: string[];
  context?: Record<string, unknown>;
  intent: string;
}): PredecidedAction[] {
  if (!input.allowedTools.includes(input.intent)) {
    return [];
  }

  const args = readRecord(input.context?.actionArgs ?? input.context?.toolArgs);
  return [{ tool: input.intent, args: args }];
}

const OPERATOR_CAPABILITIES = [
  'list_products',
  'search_contact',
  'list_conversations',
  'send_message_via_channel',
  'query_revenue_summary',
] as const;

@Injectable()
export class BrainRuntimeService {
  private readonly logger = StructuredLogger.from(BrainRuntimeService.name);

  constructor(
    private readonly unifiedAgent: UnifiedAgentService,
    private readonly contextData: UnifiedAgentContextDataService,
    private readonly capabilities: BrainCapabilityRegistryService,
    private readonly events: BrainEventSpineService,
    private readonly threads: KloelThreadService,
    private readonly graph: BrainCommercialGraphService,
    private readonly executor: BrainCapabilityExecutorService,
  ) {
    this.logger.debug?.(`BrainRuntimeService initialized`);}

  listCapabilities() {
    return {
      count: this.capabilities.list().length,
      capabilities: this.capabilities.list(),
      domains: this.capabilities.grouped(),
    };
  }

  eventTaxonomy() {
    return {
      count: BRAIN_EVENT_TAXONOMY.length,
      events: [...BRAIN_EVENT_TAXONOMY],
    };
  }

  async decide(params: { body: BrainDecideDto; userId?: string; workspaceId: string }): Promise<{
    actions: unknown[];
    confidence: number;
    conversationId?: string;
    intent: string;
    requestId: string;
    response?: string;
    source: string;
    title?: string;
  }> {
    const source = params.body.source ?? 'chat';
    const intent = params.body.intent ?? 'user_message';
    const requestId = readOptionalString(params.body.context?.clientRequestId) ?? randomUUID();
    const message =
      latestUserText(params.body.messages) ??
      (typeof params.body.context?.message === 'string'
        ? params.body.context.message
        : undefined) ??
      intent;

    if (!message.trim()) {
      throw new BadRequestException('brain_message_required');
    }

    const shouldPersistThread = source === 'chat';
    const requestedConversationId = readOptionalString(params.body.context?.conversationId);
    const thread = shouldPersistThread
      ? await this.threads.resolveThread(params.workspaceId, requestedConversationId)
      : null;
    if (thread) {
      await this.threads.persistUserThreadMessage(thread.id, params.workspaceId, message, {
        brain: true,
        brainIntent: intent,
        brainRequestId: requestId,
        brainSource: source,
        userId: params.userId,
      } satisfies Prisma.InputJsonObject);
    }

    const allowedTools = this.capabilities.allowedFor(source);
    const predecidedActions = buildPredecidedActions({
      allowedTools,
      ...(params.body.context !== undefined ? { context: params.body.context } : {}),
      intent,
    });

    const isOperatorIntent = (OPERATOR_CAPABILITIES as readonly string[]).includes(intent);
    if (isOperatorIntent) {
      return this.executeOperatorCapability({
        workspaceId: params.workspaceId,
        // exactOptionalPropertyTypes: drop the key entirely when undefined
        // rather than passing `userId: undefined` which the target type rejects.
        ...(params.userId !== undefined ? { userId: params.userId } : {}),
        intent,
        source,
        requestId,
        thread,
        context: params.body.context ?? {},
        message,
      });
    }

    const result = await this.unifiedAgent.processMessage({
      allowedTools,
      workspaceId: params.workspaceId,
      contactId: params.body.contactId ?? '',
      phone: params.body.phone ?? '',
      message,
      predecidedActions,
      context: {
        brainSource: source,
        brainRequestId: requestId,
        brainIntent: intent,
        brainUserId: params.userId,
        ...(params.body.context ?? {}),
      },
    });

    let resolvedTitle = thread?.title;
    if (thread && result.response) {
      await this.threads.persistAssistantThreadMessage(
        thread.id,
        params.workspaceId,
        result.response,
        {
          brain: true,
          brainIntent: intent,
          brainRequestId: requestId,
          brainSource: source,
          actions: cloneJson(result.actions),
          confidence: result.confidence,
        } satisfies Prisma.InputJsonObject,
      );
      resolvedTitle = await this.threads.maybeGenerateThreadTitle(
        thread.id,
        thread.title,
        message,
        params.workspaceId,
      );
    }

    for (const action of result.actions) {
      const actionName = readBrainActionName(action);
      if (!actionName) {
        continue;
      }
      const actionSucceeded = didBrainActionSucceed(action);
      const actionMeta = {
        source,
        requestId,
        userId: params.userId,
        conversationId: thread?.id,
        action: cloneJson(action),
      } satisfies Prisma.InputJsonObject;
      await this.events.record({
        workspaceId: params.workspaceId,
        ...(params.body.contactId !== undefined ? { contactId: params.body.contactId } : {}),
        intent,
        action: actionSucceeded ? 'capability.executed' : 'capability.failed',
        status: actionSucceeded ? 'executed' : 'error',
        meta: actionMeta,
      });
      const domainEvent = mapBrainActionToDomainEvent(actionName);
      if (domainEvent) {
        await this.events.record({
          workspaceId: params.workspaceId,
          ...(params.body.contactId !== undefined ? { contactId: params.body.contactId } : {}),
          intent,
          action: domainEvent,
          status: actionSucceeded ? 'executed' : 'error',
          meta: actionMeta,
        });
      }
    }

    await this.events.record({
      workspaceId: params.workspaceId,
      ...(params.body.contactId !== undefined ? { contactId: params.body.contactId } : {}),
      intent,
      action: 'brain.decide',
      status: 'executed',
      ...(result.response !== undefined ? { responseText: result.response } : {}),
      meta: {
        source,
        requestId,
        userId: params.userId,
        conversationId: thread?.id,
        actionCount: result.actions.length,
        confidence: result.confidence,
      },
    });

    return {
      source,
      ...(thread?.id !== undefined ? { conversationId: thread.id } : {}),
      ...(resolvedTitle !== undefined ? { title: resolvedTitle } : {}),
      intent: result.intent || intent,
      requestId,
      confidence: result.confidence,
      ...(result.response !== undefined ? { response: result.response } : {}),
      actions: result.actions,
    };
  }

  private async executeOperatorCapability(params: {
    workspaceId: string;
    userId?: string;
    intent: string;
    source: string;
    requestId: string;
    thread: { id: string; title?: string | null } | null;
    context: Record<string, unknown>;
    message: string;
  }): Promise<{
    actions: unknown[];
    confidence: number;
    conversationId?: string;
    intent: string;
    requestId: string;
    response?: string;
    source: string;
    title?: string;
  }> {
    const startedAt = Date.now();
    const { workspaceId, intent, requestId, thread, context } = params;

    let capabilityResult: { ok: boolean; data?: unknown; error?: string };

    switch (intent) {
      case 'list_products':
        capabilityResult = await this.executor.listProducts(workspaceId, context);
        break;
      case 'search_contact':
        capabilityResult = await this.executor.searchContact(workspaceId, context);
        break;
      case 'list_conversations':
        capabilityResult = await this.executor.listConversations(workspaceId, context);
        break;
      case 'send_message_via_channel':
        capabilityResult = await this.executor.sendMessageViaChannel(workspaceId, context);
        break;
      case 'query_revenue_summary':
        capabilityResult = await this.executor.queryRevenueSummary(workspaceId, context);
        break;
      default:
        capabilityResult = { ok: false, error: 'unknown_operator_intent' };
    }

    const action = {
      tool: intent,
      result: capabilityResult.data ?? { error: capabilityResult.error },
    };
    const actions = [action];

    const responseText = capabilityResult.ok
      ? `Acao "${intent}" executada com sucesso.`
      : `Falha ao executar "${intent}": ${capabilityResult.error ?? 'erro desconhecido'}.`;

    if (thread) {
      await this.threads.persistAssistantThreadMessage(thread.id, workspaceId, responseText, {
        brain: true,
        brainIntent: intent,
        brainRequestId: requestId,
        brainSource: params.source,
        actions: actions as Prisma.InputJsonValue,
        confidence: capabilityResult.ok ? 1 : 0,
      } satisfies Prisma.InputJsonObject);
    }

    await this.events.record({
      workspaceId,
      intent,
      action: capabilityResult.ok ? 'capability.executed' : 'capability.failed',
      status: capabilityResult.ok ? 'executed' : 'error',
      meta: {
        source: params.source,
        requestId,
        userId: params.userId,
        conversationId: thread?.id,
        action: action as Prisma.InputJsonValue,
      },
    });

    await this.events.record({
      workspaceId,
      intent,
      action: 'brain.decide',
      status: 'executed',
      responseText,
      meta: {
        source: params.source,
        requestId,
        userId: params.userId,
        conversationId: thread?.id,
        actionCount: 1,
        confidence: capabilityResult.ok ? 1 : 0,
        operator: true,
        latencyMs: Date.now() - startedAt,
      },
    });

    return {
      source: params.source,
      ...(thread?.id !== undefined ? { conversationId: thread.id } : {}),
      ...(thread?.title !== null && thread?.title !== undefined ? { title: thread.title } : {}),
      intent,
      requestId,
      confidence: capabilityResult.ok ? 1 : 0,
      response: responseText,
      actions,
    };
  }

  async streamDecisionEvents(params: {
    body: BrainDecideDto;
    userId?: string;
    workspaceId: string;
  }): Promise<Array<Record<string, unknown>>> {
    const events: Array<Record<string, unknown>> = [
      {
        type: 'status',
        phase: 'thinking',
        message: 'Kloel Brain construindo contexto do workspace',
      },
    ];
    const decision = await this.decide(params);
    if (decision.conversationId) {
      events.push({
        type: 'thread',
        conversationId: decision.conversationId,
        title: decision.title,
      });
    }
    for (const action of decision.actions) {
      if (!action || typeof action !== 'object') {
        continue;
      }
      const record = action as Record<string, unknown>;
      events.push({
        type: 'tool_result',
        tool: typeof record.tool === 'string' ? record.tool : 'brain_action',
        result: record.result,
        success: true,
      });
    }
    events.push({
      type: 'content',
      content: decision.response || 'Ação processada pelo Kloel Brain.',
    });
    events.push({ type: 'done', done: true });
    return events;
  }

  async observe(params: { body: BrainObserveDto; userId?: string; workspaceId: string }): Promise<{
    capabilities: number;
    dataKeys: string[];
    insights: string[];
    mode: 'observe';
    products: number;
    question?: string;
    recommendations: CommercialGraphRecommendation[];
    requestId: string;
    source: string;
    workspace: Record<string, unknown>;
  }> {
    const source = params.body.source ?? 'system';
    const requestId = randomUUID();
    const [workspace, products, recommendationState] = await Promise.all([
      this.contextData.getWorkspaceContext(params.workspaceId),
      this.contextData.getProducts(params.workspaceId),
      this.graph.recommendNextActions(params.workspaceId),
    ]);
    const dataKeys = Object.keys(params.body.data ?? {}).sort();
    const recommendations = recommendationState.recommendations;
    const insights = recommendations
      .slice(0, 3)
      .map(
        (recommendation) =>
          `${recommendation.action}: ${Math.round(
            recommendation.confidence * 100,
          )}% confidence. ${recommendation.reason}`,
      );

    await this.events.record({
      workspaceId: params.workspaceId,
      intent: params.body.question ?? 'observe',
      action: 'brain.observe',
      status: 'executed',
      meta: {
        source,
        requestId,
        userId: params.userId,
        dataKeys,
        recommendationCount: recommendations.length,
      } satisfies Prisma.InputJsonObject,
    });

    return {
      mode: 'observe',
      source,
      requestId,
      ...(params.body.question !== undefined ? { question: params.body.question } : {}),
      workspace,
      products: products.length,
      capabilities: this.capabilities.list().length,
      dataKeys,
      insights,
      recommendations,
    };
  }
}
