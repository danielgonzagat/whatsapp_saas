/**
 * MindRuntime — canonical name for the cognitive runtime orchestrator
 * (ADR-0013 Wave M1).
 *
 * Central decision/observe orchestrator that fans incoming Brain requests out
 * to the unified agent, the operator capability executor, the event spine, and
 * the conversational thread store. Backwards-compat alias
 * `BrainRuntimeService` is preserved for the existing DI tokens during the
 * Wave M1 alias window (4 weeks).
 *
 * Legacy shim: `backend/src/kloel/brain-runtime.service.ts` re-exports
 * `MindRuntime` under the deprecated alias `BrainRuntimeService`.
 *
 * @cluster Mind/Coordination
 * @canonical backend/src/kloel/mind/coordination/mind-runtime.service.ts
 * @see docs/adr/0013-kloel-mind-unification.md
 */
import { BadRequestException, Inject, Injectable, forwardRef } from '@nestjs/common';
import { StructuredLogger } from '../../../logging/structured-logger';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import {
  didBrainActionSucceed,
  mapBrainActionToDomainEvent,
  readBrainActionName,
} from './mind-action-event-mapper';
import { MindCapabilityExecutor } from './mind-capability-executor.service';
import { OPERATOR_CAPABILITIES } from './mind-capabilities.const';
import { MindCapabilityRegistry } from './mind-capability-registry.service';
import { MindCommercialGraph } from './mind-commercial-graph.service';
import type { CommercialGraphRecommendation } from './mind-commercial-graph.types';
import { MindEventSpine } from './mind-event-spine.service';
import { BRAIN_EVENT_TAXONOMY } from './mind-event-taxonomy';
import { BrainDecideDto, BrainObserveDto } from './mind-runtime.dto';
import { KloelThreadService } from '../../kloel-thread.service';
import { UnifiedAgentContextDataService } from '../../unified-agent-context-data.service';
import { UnifiedAgentService } from '../../unified-agent.service';
import {
  buildObserveInsights,
  buildOperatorResponseText,
  buildPredecidedActions,
  buildStreamEvents,
  cloneJson,
  readOptionalString,
  resolveDecideMessage,
} from './mind-runtime.helpers';

// OPERATOR_CAPABILITIES moved to ../../brain-capabilities.const (single
// source of truth shared with the executor's self-model registry).

@Injectable()
export class MindRuntime {
  private readonly logger = StructuredLogger.from(MindRuntime.name);

  constructor(
    @Inject(forwardRef(() => UnifiedAgentService))
    private readonly unifiedAgent: UnifiedAgentService,
    private readonly contextData: UnifiedAgentContextDataService,
    private readonly capabilities: MindCapabilityRegistry,
    private readonly events: MindEventSpine,
    private readonly threads: KloelThreadService,
    private readonly graph: MindCommercialGraph,
    private readonly executor: MindCapabilityExecutor,
  ) {
    this.logger.debug?.(`MindRuntime initialized`);
  }

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
    const message = resolveDecideMessage({ ...params.body, intent });

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
      case 'inspect_self':
        capabilityResult = await this.executor.inspectSelf(workspaceId, context);
        break;
      case 'inspect_runtime':
        capabilityResult = await this.executor.inspectRuntime(workspaceId);
        break;
      case 'search_code':
        capabilityResult = await this.executor.searchCode(workspaceId, context);
        break;
      case 'read_source_file':
        capabilityResult = await this.executor.readSourceFile(workspaceId, context);
        break;
      case 'safe_query':
        capabilityResult = await this.executor.runSafeQuery(workspaceId, context);
        break;
      case 'list_capabilities_detail':
        capabilityResult = await this.executor.listCapabilitiesDetail(workspaceId);
        break;
      default:
        capabilityResult = { ok: false, error: 'unknown_operator_intent' };
    }

    const action = {
      tool: intent,
      result: capabilityResult.data ?? { error: capabilityResult.error },
    };
    const actions = [action];

    const responseText = buildOperatorResponseText({
      intent,
      ok: capabilityResult.ok,
      error: capabilityResult.error,
      result: capabilityResult.data,
    });

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
        action: cloneJson(action),
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
    const decision = await this.decide(params);
    return buildStreamEvents(decision);
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
    const insights = buildObserveInsights(recommendations);

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

/**
 * @deprecated Use {@link MindRuntime} instead. Kept for the ADR-0013 Wave M1
 * alias window (4 weeks) so existing DI tokens and direct imports keep
 * resolving while callers migrate.
 */
export { MindRuntime as BrainRuntimeService };
