import { prisma } from '../../db';
import { publishAgentEvent } from '../../providers/agent-events';
import { buildDecisionEnvelope, buildHumanTask, persistHumanTask, persistSystemInsight, shouldAutonomousSend } from '../../providers/commercial-intelligence';
import { beginAutonomyExecution, buildAutonomyExecutionKey, finishAutonomyExecution } from './cognition';
import { logAutopilotAction } from './safeguard';

export async function maybeEscalateToHumanControl(input: {
  workspaceId: string;
  contactId?: string | undefined;
  contactName?: string | undefined;
  phone?: string | undefined;
  runId?: string | undefined;
  decisionEnvelope: ReturnType<typeof buildDecisionEnvelope>;
  messageContent?: string | undefined;
  intent?: string | undefined;
  action?: string | undefined;
}) {
  if (input.action === 'AUTONOMOUS_FALLBACK' && input.decisionEnvelope.riskFlags.length === 0) {
    return { blocked: false as const };
  }

  const allowedToSend = shouldAutonomousSend(input.decisionEnvelope, 'AUTONOMOUS');

  if (allowedToSend) {
    return { blocked: false as const };
  }

  const humanTask = buildHumanTask({
    workspaceId: input.workspaceId,
    ...(input.contactId !== undefined ? { contactId: input.contactId } : {}),
    ...(input.phone !== undefined ? { phone: input.phone } : {}),
    decision: input.decisionEnvelope,
    ...(input.messageContent !== undefined ? { messageContent: input.messageContent } : {}),
  });

  if (humanTask) {
    const lockedConversation = await lockConversationForHumanReview({
      workspaceId: input.workspaceId,
      ...(input.contactId !== undefined ? { contactId: input.contactId } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
    });
    const taskPayload = {
      ...humanTask,
      conversationId: lockedConversation?.id || null,
      status: 'OPEN' as const,
    };

    await persistHumanTask(prisma, {
      workspaceId: input.workspaceId,
      task: taskPayload,
    });

    await persistSystemInsight(prisma, {
      workspaceId: input.workspaceId,
      type: 'CIA_HUMAN_TASK',
      title: `Validação humana necessária para ${input.contactName || input.phone || 'contato'}`,
      description: humanTask.reason,
      severity: humanTask.urgency === 'CRITICAL' ? 'CRITICAL' : 'WARNING',
      metadata: {
        contactId: input.contactId,
        phone: input.phone,
        taskType: humanTask.taskType,
        urgency: humanTask.urgency,
        riskFlags: input.decisionEnvelope.riskFlags,
      },
    });

    const transferExecution = await beginAutonomyExecution({
      workspaceId: input.workspaceId,
      actionType: 'TRANSFER_HUMAN',
      ...(input.contactId !== undefined ? { contactId: input.contactId } : {}),
      idempotencyKey: buildAutonomyExecutionKey({
        workspaceId: input.workspaceId,
        actionType: 'TRANSFER_HUMAN',
        ...(input.contactId !== undefined ? { contactId: input.contactId } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        payload: {
          reason: humanTask.reason,
          urgency: humanTask.urgency,
          riskFlags: input.decisionEnvelope.riskFlags,
          nextAction: input.decisionEnvelope.nextAction,
        },
      }),
      request: {
        phone: input.phone || null,
        reason: humanTask.reason,
        urgency: humanTask.urgency,
        riskFlags: input.decisionEnvelope.riskFlags,
        nextAction: input.decisionEnvelope.nextAction,
      },
    });
    if (transferExecution.allowed) {
      await finishAutonomyExecution(transferExecution.record?.id, 'SUCCESS', {
        response: {
          humanTaskId: humanTask.id,
          conversationId: lockedConversation?.id || null,
          status: 'conversation_locked_human',
        },
      });
    }
  }

  await publishAgentEvent({
    type: 'status',
    workspaceId: input.workspaceId,
    runId: input.runId,
    phase: 'human_validation',
    persistent: true,
    message: `Preciso de validação humana para ${input.contactName || input.phone || 'este contato'}. Motivo: ${
      humanTask?.reason || 'risco operacional identificado'
    }`,
    meta: {
      contactId: input.contactId,
      contactName: input.contactName || null,
      phone: input.phone || null,
      riskFlags: input.decisionEnvelope.riskFlags,
      urgency: humanTask?.urgency || null,
      nextAction: input.decisionEnvelope.nextAction,
    },
  });

  await logAutopilotAction({
    workspaceId: input.workspaceId,
    ...(input.contactId !== undefined ? { contactId: input.contactId } : {}),
    ...(input.phone !== undefined ? { phone: input.phone } : {}),
    action: input.action || 'HUMAN_REVIEW_REQUIRED',
    ...(input.intent !== undefined ? { intent: input.intent } : {}),
    status: 'skipped',
    reason: humanTask?.reason || 'human_validation_required',
    meta: {
      humanTaskId: humanTask?.id,
      riskFlags: input.decisionEnvelope.riskFlags,
      confidence: input.decisionEnvelope.confidence,
      capabilities: input.decisionEnvelope.capabilities,
    },
  });

  return {
    blocked: true as const,
    summary: humanTask?.reason || 'A IA decidiu escalar este caso para validação humana.',
  };
}

export async function findConversationAutomationState(input: {
  workspaceId: string;
  contactId?: string;
  phone?: string;
}) {
  if (!input.contactId && !input.phone) {
    return null;
  }

  return prisma.conversation.findFirst({
    where: {
      workspaceId: input.workspaceId,
      ...(input.contactId
        ? { contactId: input.contactId }
        : input.phone
          ? { contact: { phone: input.phone } }
          : {}),
    },
    orderBy: [{ updatedAt: 'desc' }],
    select: {
      id: true,
      mode: true,
      status: true,
      assignedAgentId: true,
    },
  });
}

export async function lockConversationForHumanReview(input: {
  workspaceId: string;
  contactId?: string;
  phone?: string;
}) {
  const conversation = await findConversationAutomationState(input);
  if (!conversation || conversation.mode === 'HUMAN') {
    return conversation;
  }

  await prisma.conversation.updateMany({
    where: { id: conversation.id, workspaceId: input.workspaceId },
    data: { mode: 'HUMAN' },
  });

  return {
    ...conversation,
    mode: 'HUMAN',
  };
}
