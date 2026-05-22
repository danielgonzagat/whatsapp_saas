import { WorkerLogger } from '../../logger';
import { prisma } from '../../db';
import { redis } from '../../redis-client';
import { autopilotQueue } from '../../queue';
import { buildQueueJobId } from '../../job-id';
import { publishAgentEvent, finishBacklogRunTask } from '../../providers/agent-events';
import { autopilotPipelineCounter } from '../../metrics';
import { unifiedWhatsAppProvider as whatsappApiProvider } from '../../providers/unified-whatsapp-provider';
import { log, normalizeJsonObject, type UnknownRecord } from './shared';
import { ensureTrustedContactProfile } from './profile';
import { resolveWorkspaceSelfIdentity } from './identity';
import { buildPendingMessageBatch } from './scan-criteria';
import { checkScanPreFlight, checkScanAutonomyBilling } from './scan-ingestion';
import { runScanCognitivePipeline } from './scan-scoring';
import { runScanDecisions } from './scan-decisions';
import { finalizeBacklogIntoSilentCatalog, resolveScanDeliveryMode } from './backlog';
import { isRecentLiveConversation, reportSmokeTest } from './shared';
import { sendDirectAutopilotText } from './execution';
import { forEachSequential } from '../../utils/async-sequence';

const scanLog = new WorkerLogger('autopilot:scan');

export { buildPendingMessageBatch } from './scan-criteria';
export { checkScanPreFlight, checkScanAutonomyBilling } from './scan-ingestion';
export { runScanCognitivePipeline } from './scan-scoring';
export { runScanDecisions } from './scan-decisions';

export async function runScanContact(data: UnknownRecord) {
  const { workspaceId } = data || {};
  if (!workspaceId) {
    return;
  }
  const smokeTestId = data?.smokeTestId as string | undefined;
  const smokeMode = data?.smokeMode === 'live' ? 'live' : 'dry-run';
  const runId = data?.runId as string | undefined;
  const requestedDeliveryMode = resolveScanDeliveryMode(data || {});

  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
  const settings = (workspace?.providerSettings ?? {}) as UnknownRecord;
  const selfIdentity = await resolveWorkspaceSelfIdentity(workspaceId, settings);
  const aggregated = await buildPendingMessageBatch({
    workspaceId,
    contactId: data?.contactId,
    phone: data?.phone,
    chatId: data?.chatId,
    fallbackMessageContent: data?.messageContent,
    selfIdentity,
  });

  let finalStatus: 'sent' | 'failed' | 'skipped' = 'skipped';
  let finalContactId = data?.contactId as string | undefined;
  let finalPhone = data?.phone as string | undefined;
  let finalContactName = data?.contactName as string | undefined;
  let finalChatId = data?.chatId as string | undefined;
  let replyLockKey: string | null = null;
  let keepReplyLock = false;

  try {
    if (!aggregated) {
      log.info('autopilot_scan_contact_empty', {
        workspaceId,
        contactId: data?.contactId,
        phone: data?.phone,
      });
      autopilotPipelineCounter.inc({ workspaceId, stage: 'scan_contact', result: 'empty' });
      await reportSmokeTest(smokeTestId, {
        status: 'empty',
        workspaceId,
        contactId: data?.contactId,
        phone: data?.phone,
      });
      return;
    }
    /* empty check handled above */

    const {
      contactId,
      phone,
      chatId,
      contactName,
      leadScore,
      messageContent,
      messageCount,
      messageIds,
      providerMessageIds,
      customerMessages,
    } = aggregated;
    const effectiveDeliveryMode: 'reactive' | 'proactive' =
      requestedDeliveryMode === 'reactive'
        ? 'reactive'
        : isRecentLiveConversation(customerMessages || [])
          ? 'reactive'
          : 'proactive';

    finalContactId = contactId;
    finalPhone = phone;
    finalContactName = contactName;
    finalChatId = chatId;

    if (contactId && chatId) {
      const existingContact = await prisma.contact
        .findUnique({ where: { id: contactId }, select: { customFields: true } })
        .catch(() => null);
      const existingCustomFields = normalizeJsonObject(existingContact?.customFields);
      await prisma.contact
        .update({
          where: { id: contactId },
          data: {
            customFields: {
              ...existingCustomFields,
              lastRemoteChatId: chatId,
              lastResolvedChatId: chatId,
            },
          },
        })
        .catch((err) => {
          log.warn('contact_update_chatid_failed', { error: err?.message, contactId });
          return undefined;
        });
    }

    const preFlight = await checkScanPreFlight({
      workspaceId,
      contactId,
      phone,
      chatId,
      contactName,
      selfIdentity,
      data,
      runId,
      smokeTestId,
      smokeMode,
    });
    if (preFlight.skip) {
      return;
    }
    replyLockKey = preFlight.replyLockKey;

    log.info('autopilot_scan_contact', { workspaceId, contactId, phone, messageCount });
    autopilotPipelineCounter.inc({ workspaceId, stage: 'scan_contact', result: 'processing' });
    await reportSmokeTest(smokeTestId, {
      status: 'processing',
      workspaceId,
      contactId,
      phone,
      messageCount,
    });

    await publishAgentEvent({
      type: 'thought',
      workspaceId,
      runId,
      phase: 'open_contact',
      message: `Abrindo conversa com ${contactName || phone}`,
      meta: {
        contactId,
        contactName,
        phone,
        backlogIndex: data?.backlogIndex,
        backlogTotal: data?.backlogTotal,
      },
    });

    const billingCheck = await checkScanAutonomyBilling({
      workspaceId,
      contactId,
      phone,
      settings,
      smokeTestId,
    });
    if (billingCheck.skip) {
      return;
    }

    const cognitiveResult = await runScanCognitivePipeline({
      workspaceId,
      contactId,
      phone,
      contactName,
      messageContent,
      messageCount,
      leadScore,
      conversationId: undefined,
      deliveryMode: effectiveDeliveryMode,
      settings,
      workspaceRecord: (workspace as UnknownRecord) || {},
      smokeTestId,
      smokeMode,
      runId,
      customerMessages,
      messageIds,
      providerMessageIds,
    });

    if (cognitiveResult.skip) {
      return;
    }

    if (cognitiveResult.resolvedAction && cognitiveResult.resolvedText) {
      const sendResult = await sendDirectAutopilotText({
        workspaceId,
        contactId,
        phone,
        contactName,
        text: cognitiveResult.resolvedText,
        settings,
        intent: undefined,
        reason: 'cognitive_next_best_action',
        workspaceRecord: (workspace as UnknownRecord) || undefined,
        actionLabel: cognitiveResult.resolvedAction,
        usedHistory: true,
        usedKb: cognitiveResult.productMatches.length > 0,
        deliveryMode: effectiveDeliveryMode,
        smokeTestId,
        smokeMode,
        runId,
        customerMessages,
        idempotencyContext: {
          source: 'scan_contact_cognitive_action',
          action: cognitiveResult.resolvedAction,
          messageIds,
          providerMessageIds,
          runId: runId || null,
        },
      });
      finalStatus = sendResult === 'executed' ? 'sent' : 'skipped';
      keepReplyLock = sendResult === 'executed';
      return;
    }

    const decisionResult = await runScanDecisions({
      workspaceId,
      contactId,
      phone,
      chatId,
      contactName,
      messageContent,
      messageCount,
      leadScore,
      productMatches: cognitiveResult.productMatches,
      cognitiveState: cognitiveResult.cognitiveState,
      deliveryMode: effectiveDeliveryMode,
      settings,
      workspaceRecord: (workspace as UnknownRecord) || {},
      smokeTestId,
      smokeMode,
      runId,
      customerMessages,
      messageIds,
      providerMessageIds,
    });

    finalStatus = decisionResult.status;
    keepReplyLock = decisionResult.keepReplyLock;
  } catch (_err: unknown) {
    finalStatus = 'failed';
    throw _err;
  } finally {
    if (finalStatus === 'sent') {
      await runPostSendCleanup(
        workspaceId,
        finalContactId,
        finalPhone,
        finalChatId,
        finalContactName,
        runId,
      );
    }
    if (replyLockKey && !keepReplyLock) {
      await redis.del(replyLockKey).catch(() => undefined);
    }
  }
}

async function runPostSendCleanup(
  workspaceId: string,
  finalContactId?: string,
  finalPhone?: string,
  finalChatId?: string,
  finalContactName?: string,
  runId?: string,
) {
  const finalContactRecord = finalContactId
    ? await prisma.contact
        .findUnique({
          where: { id: finalContactId },
          select: { id: true, name: true, customFields: true },
        })
        .catch(() => null)
    : null;
  const finalCustomFields = normalizeJsonObject(finalContactRecord?.customFields);

  if (finalPhone) {
    await ensureTrustedContactProfile({
      workspaceId,
      contactId: finalContactId,
      phone: finalPhone,
      chatId:
        String(finalChatId || '').trim() ||
        String(finalCustomFields.lastRemoteChatId || '').trim() ||
        String(finalCustomFields.lastCatalogChatId || '').trim() ||
        String(finalCustomFields.lastResolvedChatId || '').trim() ||
        undefined,
      contactName: finalContactName,
      existingContact: finalContactRecord as {
        id?: string | null;
        name?: string | null;
        customFields?: UnknownRecord;
      } | null,
    }).catch(() => ({ contactId: '', trustedName: '', savedToWhatsapp: false }));
  }

  const readCandidates = Array.from(
    new Set(
      [
        String(finalChatId || '').trim(),
        String(finalCustomFields.lastRemoteChatId || '').trim(),
        String(finalCustomFields.lastCatalogChatId || '').trim(),
        String(finalCustomFields.lastResolvedChatId || '').trim(),
        finalPhone ? `${String(finalPhone).trim()}@c.us` : '',
        finalPhone ? `${String(finalPhone).trim()}@s.whatsapp.net` : '',
      ].filter(Boolean),
    ),
  );

  await forEachSequential(readCandidates, async (candidate) => {
    await whatsappApiProvider.readChatMessages(workspaceId, candidate).catch((err) => {
      log.warn('read_chat_messages_failed', { error: err?.message, candidate });
      return undefined;
    });
  });

  if (finalContactId && finalPhone) {
    await Promise.resolve(
      autopilotQueue.add(
        'score-contact',
        {
          workspaceId,
          contactId: finalContactId,
          phone: finalPhone,
          contactName: finalContactName,
          chatId: finalChatId || `${finalPhone}@c.us`,
          reason: 'post_reply_score',
        },
        {
          jobId: buildQueueJobId('score-contact', workspaceId, finalContactId),
          removeOnComplete: true,
        },
      ),
    ).catch((err) => {
      log.warn('score_contact_queue_add_failed', { error: err?.message });
      return undefined;
    });
  }

  if (runId) {
    const runState = await finishBacklogRunTask({
      workspaceId,
      runId,
      contactId: finalContactId,
      contactName: finalContactName,
      phone: finalPhone,
      status: 'sent',
      summary: 'Resposta enviada.',
    });
    if (runState && runState.finished >= runState.total) {
      await finalizeBacklogIntoSilentCatalog({ workspaceId, runId, reason: 'backlog_completed' });
    }
  }
}

export { scanLog };
