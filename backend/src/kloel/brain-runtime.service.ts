import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import {
  didBrainActionSucceed,
  mapBrainActionToDomainEvent,
  readBrainActionName,
} from './brain-action-event-mapper';
import { BrainCapabilityRegistryService } from './brain-capability-registry.service';
import {
  BrainCommercialGraphService,
  CommercialGraphRecommendation,
} from './brain-commercial-graph.service';
import { BrainEventSpineService } from './brain-event-spine.service';
import { BRAIN_EVENT_TAXONOMY } from './brain-event-taxonomy';
import { BrainDecideDto, BrainObserveDto } from './brain-runtime.dto';
import { KloelThreadService } from './kloel-thread.service';
import { UnifiedAgentContextDataService } from './unified-agent-context-data.service';
import { UnifiedAgentService } from './unified-agent.service';

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

@Injectable()
export class BrainRuntimeService {
  constructor(
    private readonly unifiedAgent: UnifiedAgentService,
    private readonly contextData: UnifiedAgentContextDataService,
    private readonly capabilities: BrainCapabilityRegistryService,
    private readonly events: BrainEventSpineService,
    private readonly threads: KloelThreadService,
    private readonly graph: BrainCommercialGraphService,
  ) {}

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

    const result = await this.unifiedAgent.processMessage({
      allowedTools: this.capabilities.allowedFor(source),
      workspaceId: params.workspaceId,
      contactId: params.body.contactId ?? '',
      phone: params.body.phone ?? '',
      message,
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
        contactId: params.body.contactId,
        intent,
        action: actionSucceeded ? 'capability.executed' : 'capability.failed',
        status: actionSucceeded ? 'executed' : 'error',
        meta: actionMeta,
      });
      const domainEvent = mapBrainActionToDomainEvent(actionName);
      if (domainEvent) {
        await this.events.record({
          workspaceId: params.workspaceId,
          contactId: params.body.contactId,
          intent,
          action: domainEvent,
          status: actionSucceeded ? 'executed' : 'error',
          meta: actionMeta,
        });
      }
    }

    await this.events.record({
      workspaceId: params.workspaceId,
      contactId: params.body.contactId,
      intent,
      action: 'brain.decide',
      status: 'executed',
      responseText: result.response,
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
      conversationId: thread?.id,
      title: resolvedTitle,
      intent: result.intent || intent,
      requestId,
      confidence: result.confidence,
      response: result.response,
      actions: result.actions,
    };
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
      question: params.body.question,
      workspace,
      products: products.length,
      capabilities: this.capabilities.list().length,
      dataKeys,
      insights,
      recommendations,
    };
  }
}
