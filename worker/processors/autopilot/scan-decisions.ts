import { WorkerLogger } from '../../logger';
import { autopilotDecisionCounter, autopilotPipelineCounter } from '../../metrics';
import { buildDecisionEnvelope } from '../../providers/commercial-intelligence';
import {
  extractTextResponse,
  mapUnifiedActionsToAutopilot,
  processWithUnifiedAgent,
} from '../../providers/unified-agent-integrator';
import { log, type UnknownRecord, type AutopilotDecision } from './shared';
import { maybeEscalateToHumanControl } from './backlog';
import {
  beginAutonomyExecution,
  buildAutonomyExecutionKey,
  finishAutonomyExecution,
  decideActionSafe,
  generateAutonomousFallbackResponse,
} from './cognition';
import { executeAction, sendDirectAutopilotText } from './execution';
import {
  AUTONOMOUS_FALLBACK_ACTION,
  UNIFIED_AGENT_EXECUTED_ACTION,
  UNIFIED_AGENT_TEXT_ACTION,
  buildAlreadyExecutedResult,
  buildExecutionSummary,
  buildIdempotencyContext,
  buildPreviewResult,
  buildSkippedResult,
  formatActionExecutedSummary,
  formatActionSkippedSummary,
  isNoActionDecision,
  isPreviewMode,
  resolveFallbackIntent,
  resolveFallbackReason,
  resolveUsedKb,
  shouldRouteToUnifiedAgent,
  type ScanDecisionResult,
} from './scan-decisions.helpers';

export type { ScanDecisionResult } from './scan-decisions.helpers';

const scanLog = new WorkerLogger('autopilot:scan-decisions');

export interface ScanDecisionInput {
  workspaceId: string;
  contactId: string;
  phone: string;
  chatId: string;
  contactName: string;
  messageContent: string;
  messageCount: number;
  leadScore?: number | undefined;
  productMatches: string[];
  cognitiveState: unknown;
  deliveryMode: 'reactive' | 'proactive';
  settings: UnknownRecord;
  workspaceRecord: UnknownRecord;
  smokeTestId?: string | undefined;
  smokeMode: 'dry-run' | 'live';
  runId?: string | undefined;
  customerMessages?: {
    content: string;
    quotedMessageId?: string | undefined;
    createdAt?: string | undefined;
  }[];
  messageIds?: (string | null | undefined)[];
  providerMessageIds?: (string | null | undefined)[];
  conversationId?: string;
}

export async function runScanDecisions(params: ScanDecisionInput): Promise<ScanDecisionResult> {
  const {
    workspaceId,
    contactId,
    phone,
    chatId,
    contactName,
    messageContent,
    messageCount,
    leadScore,
    productMatches,
    cognitiveState: cognitiveStateRaw,
    deliveryMode,
    settings,
    workspaceRecord,
    smokeTestId,
    smokeMode,
    runId,
    customerMessages,
    messageIds,
    providerMessageIds,
    conversationId,
  } = params;

  const cognitiveState = cognitiveStateRaw as UnknownRecord;

  const useUnifiedAgent = shouldRouteToUnifiedAgent({
    cognitiveState,
    productMatches,
    messageContent,
    leadScore: leadScore ?? undefined,
    settings,
  });

  let decision: AutopilotDecision;

  if (useUnifiedAgent) {
    log.info('autopilot_using_unified_agent', {
      workspaceId,
      contactId,
      messageCount,
      matchedProducts: productMatches,
    });

    const unifiedResult = await processWithUnifiedAgent({
      workspaceId,
      contactId,
      phone,
      message: messageContent,
      context: {
        source: 'autopilot_worker',
        aggregatedPendingMessages: messageCount,
        pendingMessageIds: messageIds,
        matchedProducts: productMatches,
      },
    });

    if (unifiedResult) {
      decision = mapUnifiedActionsToAutopilot(unifiedResult.actions);
      const unifiedAgentResponse = extractTextResponse(unifiedResult);

      if (decision.alreadyExecuted) {
        const observedExecution = await beginAutonomyExecution({
          workspaceId,
          actionType: UNIFIED_AGENT_EXECUTED_ACTION,
          contactId,
          conversationId: conversationId || undefined,
          idempotencyKey: buildAutonomyExecutionKey({
            workspaceId,
            actionType: UNIFIED_AGENT_EXECUTED_ACTION,
            contactId,
            conversationId: conversationId || undefined,
            phone,
            payload: {
              source: 'unified_agent_already_executed',
              actions: unifiedResult.actions,
              response: unifiedAgentResponse || null,
              messageIds,
              runId: runId || null,
            },
          }),
          request: {
            phone,
            actions: unifiedResult.actions,
            response: unifiedAgentResponse || null,
            source: 'unified_agent_already_executed',
            messageIds,
            runId: runId || null,
          },
        });
        if (observedExecution.allowed) {
          await finishAutonomyExecution(observedExecution.record?.id, 'SUCCESS', {
            response: {
              channel: 'UNIFIED_AGENT_TOOL',
              actions: unifiedResult.actions,
              response: unifiedAgentResponse || null,
            },
          });
        }
        autopilotDecisionCounter.inc({
          workspaceId,
          intent: decision.intent,
          action: 'UNIFIED_AGENT',
          result: 'success',
        });
        autopilotPipelineCounter.inc({
          workspaceId,
          stage: 'unified_agent',
          result: 'already_executed',
        });
        return buildAlreadyExecutedResult('A resposta já havia sido executada.');
      }

      if (unifiedAgentResponse && !decision.alreadyExecuted) {
        const decisionEnvelope = buildDecisionEnvelope({
          intent: decision.intent,
          action: 'UNIFIED_AGENT_TEXT',
          confidence: decision.confidence,
          messageContent,
          demandState: undefined,
          matchedProducts: productMatches,
        });
        const humanGate = await maybeEscalateToHumanControl({
          workspaceId,
          contactId,
          contactName,
          phone,
          runId,
          decisionEnvelope,
          messageContent,
          intent: decision.intent,
          action: UNIFIED_AGENT_TEXT_ACTION,
        });
        if (humanGate.blocked) {
          return buildSkippedResult(humanGate.summary);
        }

        if (isPreviewMode(smokeTestId, smokeMode)) {
          autopilotPipelineCounter.inc({ workspaceId, stage: 'reply', result: 'preview' });
          return buildPreviewResult('Resposta gerada em modo preview.');
        }

        const sendResult = await sendDirectAutopilotText({
          workspaceId,
          contactId,
          conversationId,
          phone,
          contactName,
          text: unifiedAgentResponse,
          settings,
          intent: decision.intent,
          reason: decision.reason,
          workspaceRecord,
          intentConfidence: decision.confidence,
          actionLabel: UNIFIED_AGENT_TEXT_ACTION,
          usedHistory: true,
          usedKb: productMatches.length > 0,
          deliveryMode,
          smokeTestId,
          smokeMode,
          runId,
          customerMessages,
          idempotencyContext: buildIdempotencyContext({
            source: 'scan_contact_unified_agent_text',
            messageIds,
            providerMessageIds,
            runId,
          }),
        });
        return buildExecutionSummary({
          executionResult: sendResult,
          executedSummary: 'Resposta enviada com texto gerado pelo Unified Agent.',
          skippedSummary: 'A resposta foi pulada por política operacional.',
        });
      }
    } else {
      log.warn('autopilot_unified_fallback', { workspaceId });
      decision = await decideActionSafe({
        workspaceId,
        contactId,
        phone,
        messageContent,
        settings,
      });
    }
  } else {
    decision = await decideActionSafe({ workspaceId, contactId, phone, messageContent, settings });
  }

  log.info('autopilot_decision', { decision });

  if (isNoActionDecision(decision)) {
    const fallbackIntent = resolveFallbackIntent(decision);
    const decisionEnvelope = buildDecisionEnvelope({
      intent: fallbackIntent,
      action: AUTONOMOUS_FALLBACK_ACTION,
      confidence: decision.confidence,
      messageContent,
      demandState: undefined,
      matchedProducts: productMatches,
    });
    const humanGate = await maybeEscalateToHumanControl({
      workspaceId,
      contactId,
      contactName,
      phone,
      runId,
      decisionEnvelope,
      messageContent,
      intent: fallbackIntent,
      action: AUTONOMOUS_FALLBACK_ACTION,
    });
    if (humanGate.blocked) {
      return buildSkippedResult(humanGate.summary);
    }

    const fallbackText = await generateAutonomousFallbackResponse({
      workspaceId,
      messageContent,
      settings,
      matchedProducts: productMatches,
      contactId,
      phone,
      deliveryMode,
      contactName,
      cognitiveState: cognitiveStateRaw as never,
    });

    if (isPreviewMode(smokeTestId, smokeMode)) {
      autopilotPipelineCounter.inc({ workspaceId, stage: 'reply', result: 'preview' });
      return buildPreviewResult('Fallback gerado em modo preview.');
    }

    const sendResult = await sendDirectAutopilotText({
      workspaceId,
      contactId,
      conversationId,
      phone,
      contactName,
      text: fallbackText,
      settings,
      intent: fallbackIntent,
      reason: resolveFallbackReason(decision),
      workspaceRecord,
      intentConfidence: decision.confidence,
      actionLabel: AUTONOMOUS_FALLBACK_ACTION,
      usedHistory: true,
      usedKb: resolveUsedKb(decision, productMatches),
      deliveryMode,
      smokeTestId,
      smokeMode,
      runId,
      customerMessages,
      idempotencyContext: buildIdempotencyContext({
        source: 'scan_contact_autonomous_fallback',
        messageIds,
        providerMessageIds,
        runId,
      }),
    });

    return buildExecutionSummary({
      executionResult: sendResult,
      executedSummary: 'Resposta enviada com fallback autônomo.',
      skippedSummary: 'Fallback pulado por política operacional.',
    });
  }

  const decisionEnvelope = buildDecisionEnvelope({
    intent: decision.intent,
    action: decision.action,
    confidence: decision.confidence,
    messageContent,
    demandState: undefined,
    matchedProducts: productMatches,
  });
  const humanGate = await maybeEscalateToHumanControl({
    workspaceId,
    contactId,
    contactName,
    phone,
    runId,
    decisionEnvelope,
    messageContent,
    intent: decision.intent,
    action: decision.action,
  });
  if (humanGate.blocked) {
    return buildSkippedResult(humanGate.summary);
  }

  const executeResult = await executeAction(decision.action, {
    workspaceId,
    contactId,
    conversationId,
    phone,
    chatId,
    contactName,
    messageContent,
    settings,
    intent: decision.intent,
    reason: decision.reason,
    workspaceRecord,
    intentConfidence: decision.confidence,
    usedHistory: true,
    usedKb: resolveUsedKb(decision, productMatches),
    deliveryMode,
    smokeTestId,
    smokeMode,
    runId,
    customerMessages,
    idempotencyContext: buildIdempotencyContext({
      source: 'scan_contact_action',
      messageIds,
      providerMessageIds,
      runId,
    }),
  });

  return buildExecutionSummary({
    executionResult: executeResult,
    executedSummary: formatActionExecutedSummary(decision.action),
    skippedSummary: formatActionSkippedSummary(decision.action),
  });
}

export { scanLog };
