import { WorkerLogger } from '../../logger';
import {
  autopilotDecisionCounter,
  autopilotPipelineCounter,
} from '../../metrics';
import { buildDecisionEnvelope } from '../../providers/commercial-intelligence';
import {
  extractTextResponse,
  mapUnifiedActionsToAutopilot,
  processWithUnifiedAgent,
  shouldUseUnifiedAgent,
} from '../../providers/unified-agent-integrator';
import {
  log,
  type UnknownRecord,
  type AutopilotDecision,
} from './shared';
import { maybeEscalateToHumanControl } from './backlog';
import {
  beginAutonomyExecution,
  buildAutonomyExecutionKey,
  finishAutonomyExecution,
  decideActionSafe,
  generateAutonomousFallbackResponse,
} from './cognition';
import { executeAction, sendDirectAutopilotText } from './execution';

const scanLog = new WorkerLogger('autopilot:scan-decisions');

export interface ScanDecisionInput {
  workspaceId: string;
  contactId: string;
  phone: string;
  chatId: string;
  contactName: string;
  messageContent: string;
  messageCount: number;
  leadScore?: number;
  productMatches: string[];
  cognitiveState: unknown;
  deliveryMode: 'reactive' | 'proactive';
  settings: UnknownRecord;
  workspaceRecord: UnknownRecord;
  smokeTestId?: string;
  smokeMode: string;
  runId?: string;
  customerMessages?: { content: string; quotedMessageId?: string; createdAt?: string }[];
  messageIds?: string[];
  providerMessageIds?: string[];
  conversationId?: string;
}

export interface ScanDecisionResult {
  status: 'sent' | 'failed' | 'skipped';
  summary: string;
  keepReplyLock: boolean;
}

export async function runScanDecisions(params: ScanDecisionInput): Promise<ScanDecisionResult> {
  const {
    workspaceId, contactId, phone, chatId, contactName,
    messageContent, messageCount, leadScore, productMatches,
    cognitiveState: cognitiveStateRaw, deliveryMode,
    settings, workspaceRecord, smokeTestId, smokeMode, runId,
    customerMessages, messageIds, providerMessageIds, conversationId,
  } = params;

  const cognitiveState = cognitiveStateRaw as UnknownRecord;

  const useUnifiedAgent =
    cognitiveState.nextBestAction === 'RESPOND' ||
    productMatches.length > 0 ||
    shouldUseUnifiedAgent({ messageContent, leadScore: leadScore || undefined, settings });

  let decision: AutopilotDecision;

  if (useUnifiedAgent) {
    log.info('autopilot_using_unified_agent', { workspaceId, contactId, messageCount, matchedProducts: productMatches });

    const unifiedResult = await processWithUnifiedAgent({
      workspaceId, contactId, phone, message: messageContent,
      context: { source: 'autopilot_worker', aggregatedPendingMessages: messageCount, pendingMessageIds: messageIds, matchedProducts: productMatches },
    });

    if (unifiedResult) {
      decision = mapUnifiedActionsToAutopilot(unifiedResult.actions);
      const unifiedAgentResponse = extractTextResponse(unifiedResult);

      if (decision.alreadyExecuted) {
        const observedExecution = await beginAutonomyExecution({
          workspaceId, actionType: 'UNIFIED_AGENT_EXECUTED', contactId,
          conversationId: conversationId || undefined,
          idempotencyKey: buildAutonomyExecutionKey({
            workspaceId, actionType: 'UNIFIED_AGENT_EXECUTED', contactId,
            conversationId: conversationId || undefined, phone,
            payload: { source: 'unified_agent_already_executed', actions: unifiedResult.actions, response: unifiedAgentResponse || null, messageIds, runId: runId || null },
          }),
          request: { phone, actions: unifiedResult.actions, response: unifiedAgentResponse || null, source: 'unified_agent_already_executed', messageIds, runId: runId || null },
        });
        if (observedExecution.allowed) {
          await finishAutonomyExecution(observedExecution.record?.id, 'SUCCESS', {
            response: { channel: 'UNIFIED_AGENT_TOOL', actions: unifiedResult.actions, response: unifiedAgentResponse || null },
          });
        }
        autopilotDecisionCounter.inc({ workspaceId, intent: decision.intent, action: 'UNIFIED_AGENT', result: 'success' });
        autopilotPipelineCounter.inc({ workspaceId, stage: 'unified_agent', result: 'already_executed' });
        return { status: 'sent', summary: 'A resposta já havia sido executada.', keepReplyLock: true };
      }

      if (unifiedAgentResponse && !decision.alreadyExecuted) {
        const decisionEnvelope = buildDecisionEnvelope({
          intent: decision.intent, action: 'UNIFIED_AGENT_TEXT', confidence: decision.confidence,
          messageContent, demandState: undefined, matchedProducts: productMatches,
        });
        const humanGate = await maybeEscalateToHumanControl({
          workspaceId, contactId, contactName, phone, runId,
          decisionEnvelope, messageContent, intent: decision.intent, action: 'UNIFIED_AGENT_TEXT',
        });
        if (humanGate.blocked) {
          return { status: 'skipped', summary: humanGate.summary, keepReplyLock: false };
        }

        if (smokeTestId && smokeMode !== 'live') {
          autopilotPipelineCounter.inc({ workspaceId, stage: 'reply', result: 'preview' });
          return { status: 'skipped', summary: 'Resposta gerada em modo preview.', keepReplyLock: false };
        }

        const sendResult = await sendDirectAutopilotText({
          workspaceId, contactId, conversationId, phone, contactName,
          text: unifiedAgentResponse, settings, intent: decision.intent,
          reason: decision.reason, workspaceRecord,
          intentConfidence: decision.confidence, actionLabel: 'UNIFIED_AGENT_TEXT',
          usedHistory: true, usedKb: productMatches.length > 0,
          deliveryMode, smokeTestId, smokeMode, runId, customerMessages,
          idempotencyContext: { source: 'scan_contact_unified_agent_text', messageIds, providerMessageIds, runId: runId || null },
        });
        return {
          status: sendResult === 'executed' ? 'sent' : 'skipped',
          summary: sendResult === 'executed' ? 'Resposta enviada com texto gerado pelo Unified Agent.' : 'A resposta foi pulada por política operacional.',
          keepReplyLock: sendResult === 'executed',
        };
      }
    } else {
      log.warn('autopilot_unified_fallback', { workspaceId });
      decision = await decideActionSafe({ workspaceId, contactId, phone, messageContent, settings });
    }
  } else {
    decision = await decideActionSafe({ workspaceId, contactId, phone, messageContent, settings });
  }

  log.info('autopilot_decision', { decision });

  if (!decision.action || decision.action === 'NONE') {
    const decisionEnvelope = buildDecisionEnvelope({
      intent: decision.intent || 'GENERAL_ASSISTANCE', action: 'AUTONOMOUS_FALLBACK',
      confidence: decision.confidence, messageContent,
      demandState: undefined, matchedProducts: productMatches,
    });
    const humanGate = await maybeEscalateToHumanControl({
      workspaceId, contactId, contactName, phone, runId,
      decisionEnvelope, messageContent, intent: decision.intent || 'GENERAL_ASSISTANCE', action: 'AUTONOMOUS_FALLBACK',
    });
    if (humanGate.blocked) {
      return { status: 'skipped', summary: humanGate.summary, keepReplyLock: false };
    }

    const fallbackText = await generateAutonomousFallbackResponse({
      workspaceId, messageContent, settings, matchedProducts: productMatches,
      contactId, phone, deliveryMode, contactName, cognitiveState: cognitiveStateRaw as never,
    });

    if (smokeTestId && smokeMode !== 'live') {
      autopilotPipelineCounter.inc({ workspaceId, stage: 'reply', result: 'preview' });
      return { status: 'skipped', summary: 'Fallback gerado em modo preview.', keepReplyLock: false };
    }

    const sendResult = await sendDirectAutopilotText({
      workspaceId, contactId, conversationId, phone, contactName,
      text: fallbackText, settings, intent: decision.intent || 'GENERAL_ASSISTANCE',
      reason: decision.reason || 'autonomous_fallback', workspaceRecord,
      intentConfidence: decision.confidence, actionLabel: 'AUTONOMOUS_FALLBACK',
      usedHistory: true, usedKb: productMatches.length > 0 || decision.usedKb,
      deliveryMode, smokeTestId, smokeMode, runId, customerMessages,
      idempotencyContext: { source: 'scan_contact_autonomous_fallback', messageIds, providerMessageIds, runId: runId || null },
    });

    return {
      status: sendResult === 'executed' ? 'sent' : 'skipped',
      summary: sendResult === 'executed' ? 'Resposta enviada com fallback autônomo.' : 'Fallback pulado por política operacional.',
      keepReplyLock: sendResult === 'executed',
    };
  }

  const decisionEnvelope = buildDecisionEnvelope({
    intent: decision.intent, action: decision.action, confidence: decision.confidence,
    messageContent, demandState: undefined, matchedProducts: productMatches,
  });
  const humanGate = await maybeEscalateToHumanControl({
    workspaceId, contactId, contactName, phone, runId,
    decisionEnvelope, messageContent, intent: decision.intent, action: decision.action,
  });
  if (humanGate.blocked) {
    return { status: 'skipped', summary: humanGate.summary, keepReplyLock: false };
  }

  const executeResult = await executeAction(decision.action, {
    workspaceId, contactId, conversationId, phone, chatId, contactName,
    messageContent, settings, intent: decision.intent, reason: decision.reason,
    workspaceRecord, intentConfidence: decision.confidence,
    usedHistory: true, usedKb: productMatches.length > 0 || decision.usedKb,
    deliveryMode, smokeTestId, smokeMode, runId, customerMessages,
    idempotencyContext: { source: 'scan_contact_action', messageIds, providerMessageIds, runId: runId || null },
  });

  return {
    status: executeResult === 'executed' ? 'sent' : 'skipped',
    summary: executeResult === 'executed' ? `Ação ${decision.action} executada com sucesso.` : `Ação ${decision.action} pulada por política operacional.`,
    keepReplyLock: executeResult === 'executed',
  };
}

export { scanLog };
