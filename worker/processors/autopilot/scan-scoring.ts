import { WorkerLogger } from '../../logger';
import { prisma } from '../../db';
import { publishAgentEvent } from '../../providers/agent-events';
import { autopilotPipelineCounter } from '../../metrics';
import {
  computeDemandState,
  buildDecisionEnvelope,
  persistDemandState,
} from '../../providers/commercial-intelligence';
import {
  buildConversationTacticPlan,
  assertConversationTacticPlan,
} from '../cia/conversation-tactics';
import { recordDecisionOutcome } from '../cia/cognitive-state';
import { type UnknownRecord, findWorkspaceProductMatches } from './shared';
import { logAutopilotAction } from './safeguard';
import {
  computePersistentCognitiveState,
  computeCognitiveRewardSignal,
  buildCognitiveMessage,
} from './cognition';
import { maybeEscalateToHumanControl } from './backlog';
import { reportSmokeTest } from './shared';

const scanLog = new WorkerLogger('autopilot:scan-scoring');

export interface ScanScoringResult {
  skip: boolean;
  summary: string;
  resolvedAction?: string;
  resolvedText?: string;
  productMatches: string[];
  cognitiveState: unknown;
  deliveryMode: 'reactive' | 'proactive';
}

export async function runScanCognitivePipeline(params: {
  workspaceId: string;
  contactId: string;
  phone: string;
  contactName: string;
  messageContent: string;
  messageCount: number;
  leadScore?: number | null | undefined;
  conversationId?: string | undefined;
  deliveryMode: 'reactive' | 'proactive';
  settings: UnknownRecord;
  workspaceRecord: UnknownRecord;
  smokeTestId?: string | undefined;
  smokeMode: string;
  runId?: string | undefined;
  customerMessages?:
    | { content: string; quotedMessageId?: string | undefined; createdAt?: string | undefined }[]
    | undefined;
  messageIds?: (string | null | undefined)[] | undefined;
  providerMessageIds?: (string | null | undefined)[] | undefined;
}): Promise<ScanScoringResult> {
  const {
    workspaceId,
    contactId,
    phone,
    contactName,
    messageContent,
    messageCount,
    leadScore,
    conversationId,
    deliveryMode,
    smokeTestId,
    smokeMode,
    runId,
  } = params;

  const productMatches = await findWorkspaceProductMatches(workspaceId, messageContent);

  await publishAgentEvent({
    type: 'thought',
    workspaceId,
    runId,
    phase: 'analyze_contact',
    message:
      productMatches.length > 0
        ? `Identifiquei interesse em ${productMatches.join(', ')}.`
        : 'Lendo o histórico recente e entendendo a intenção do contato.',
    meta: { contactId, contactName, phone, matchedProducts: productMatches },
  });

  const demandState = computeDemandState({
    lastMessageAt: new Date(),
    unreadCount: messageCount,
    leadScore: leadScore || 0,
    lastMessageText: messageContent,
  });

  if (contactId) {
    await persistDemandState(prisma, { workspaceId, contactId, state: demandState, contactName });
  }

  const cognitiveState = await computePersistentCognitiveState({
    workspaceId,
    conversationId,
    contactId,
    phone,
    contactName,
    messageContent,
    unreadCount: messageCount,
    lastMessageAt: new Date(),
    leadScore: leadScore || 0,
    demandState,
    source: 'scan_contact',
  });

  await publishAgentEvent({
    type: 'thought',
    workspaceId,
    runId,
    phase: 'cognitive_state',
    message: `Estado cognitivo de ${contactName || phone}: ${cognitiveState.summary}`,
    meta: {
      contactId,
      contactName,
      phone,
      nextBestAction: cognitiveState.nextBestAction,
      intent: cognitiveState.intent,
      stage: cognitiveState.stage,
      confidence: cognitiveState.classificationConfidence,
    },
  });

  if (cognitiveState.nextBestAction === 'WAIT') {
    await publishAgentEvent({
      type: 'status',
      workspaceId,
      runId,
      phase: 'cognitive_wait',
      message: `Vou esperar mais sinais antes de agir com ${contactName || phone}.`,
      meta: {
        contactId,
        phone,
        nextBestAction: cognitiveState.nextBestAction,
        summary: cognitiveState.summary,
      },
    });
    await logAutopilotAction({
      workspaceId,
      contactId,
      phone,
      action: 'SCAN_CONTACT',
      intent: cognitiveState.intent,
      status: 'skipped',
      reason: 'cognitive_wait',
      meta: {
        source: 'scan_contact',
        nextBestAction: cognitiveState.nextBestAction,
        cognitiveSummary: cognitiveState.summary,
      },
    });
    await recordDecisionOutcome(prisma, {
      workspaceId,
      contactId,
      conversationId,
      phone,
      action: cognitiveState.nextBestAction,
      outcome: 'WAITED',
      reward: computeCognitiveRewardSignal(cognitiveState.nextBestAction, cognitiveState),
      message: cognitiveState.summary,
      metadata: { source: 'scan_contact' },
    });
    return {
      skip: true,
      summary: 'Estado cognitivo indicou espera antes da próxima ação.',
      productMatches,
      cognitiveState,
      deliveryMode,
    };
  }

  if (cognitiveState.nextBestAction === 'ESCALATE_HUMAN') {
    const cognitiveEnvelope = buildDecisionEnvelope({
      intent: cognitiveState.intent,
      action: 'COGNITIVE_ESCALATION',
      confidence: cognitiveState.classificationConfidence,
      messageContent,
      demandState,
      matchedProducts: productMatches,
    });
    const humanGate = await maybeEscalateToHumanControl({
      workspaceId,
      contactId,
      contactName,
      phone,
      runId,
      decisionEnvelope: cognitiveEnvelope,
      messageContent,
      intent: cognitiveState.intent,
      action: 'COGNITIVE_ESCALATION',
    });
    await recordDecisionOutcome(prisma, {
      workspaceId,
      contactId,
      conversationId,
      phone,
      action: cognitiveState.nextBestAction,
      outcome: humanGate.blocked ? 'ESCALATED' : 'SKIPPED',
      reward: computeCognitiveRewardSignal(cognitiveState.nextBestAction, cognitiveState),
      message: cognitiveState.summary,
      metadata: { source: 'scan_contact', blocked: humanGate.blocked },
    });
    if (humanGate.blocked) {
      return {
        skip: true,
        summary: humanGate.summary,
        productMatches,
        cognitiveState,
        deliveryMode,
      };
    }
  }

  if (
    [
      'ASK_CLARIFYING',
      'SOCIAL_PROOF',
      'OFFER',
      'PAYMENT_RECOVERY',
      'FOLLOWUP_SOFT',
      'FOLLOWUP_URGENT',
    ].includes(cognitiveState.nextBestAction)
  ) {
    const conversationTacticPlan = buildConversationTacticPlan({
      action: cognitiveState.nextBestAction,
      state: cognitiveState,
    });
    assertConversationTacticPlan(conversationTacticPlan);
    const text = buildCognitiveMessage({
      action: cognitiveState.nextBestAction,
      state: cognitiveState,
      contactName,
      matchedProducts: productMatches,
      tactic: conversationTacticPlan.selectedTactic,
    });

    const cognitiveEnvelope = buildDecisionEnvelope({
      intent: cognitiveState.intent,
      action: cognitiveState.nextBestAction,
      confidence: cognitiveState.classificationConfidence,
      messageContent,
      demandState,
      matchedProducts: productMatches,
    });
    const humanGate = await maybeEscalateToHumanControl({
      workspaceId,
      contactId,
      contactName,
      phone,
      runId,
      decisionEnvelope: cognitiveEnvelope,
      messageContent,
      intent: cognitiveState.intent,
      action: cognitiveState.nextBestAction,
    });
    if (humanGate.blocked) {
      await recordDecisionOutcome(prisma, {
        workspaceId,
        contactId,
        conversationId,
        phone,
        action: cognitiveState.nextBestAction,
        outcome: 'ESCALATED',
        reward: computeCognitiveRewardSignal(cognitiveState.nextBestAction, cognitiveState),
        message: text,
        metadata: { source: 'scan_contact', blocked: true },
      });
      return {
        skip: true,
        summary: humanGate.summary,
        productMatches,
        cognitiveState,
        deliveryMode,
      };
    }

    if (smokeTestId && smokeMode !== 'live') {
      autopilotPipelineCounter.inc({ workspaceId, stage: 'reply', result: 'preview' });
      await reportSmokeTest(smokeTestId, {
        status: 'completed',
        mode: smokeMode,
        workspaceId,
        contactId,
        phone,
        decision: { intent: cognitiveState.intent, action: cognitiveState.nextBestAction },
        responseText: text,
        matchedProducts: productMatches,
      });
      return {
        skip: true,
        summary: 'Resposta cognitiva gerada em modo preview.',
        resolvedAction: cognitiveState.nextBestAction,
        resolvedText: text,
        productMatches,
        cognitiveState,
        deliveryMode,
      };
    }

    return {
      skip: false,
      summary: '',
      resolvedAction: cognitiveState.nextBestAction,
      resolvedText: text,
      productMatches,
      cognitiveState,
      deliveryMode,
    };
  }

  return { skip: false, summary: '', productMatches, cognitiveState, deliveryMode };
}

export { scanLog };
