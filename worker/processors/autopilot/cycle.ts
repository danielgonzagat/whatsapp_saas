import OpenAI from 'openai';
import { safeResolve } from '../../safe-path';
import { prisma } from '../../db';
import { publishAgentEvent } from '../../providers/agent-events';
import {
  buildBusinessStateSnapshot,
  buildDecisionEnvelope,
  buildMissionPlan,
  computeDemandState,
  extractMarketSignals,
  persistBusinessSnapshot,
  persistDemandState,
  persistMarketSignals,
  persistSystemInsight,
} from '../../providers/commercial-intelligence';
import { getWorkspaceLocalHour, isWithinWorkspaceWindow } from '../../providers/timezone';
import { WhatsAppEngine } from '../../providers/whatsapp-engine';
import { forEachSequential } from '../../utils/async-sequence';
import { buildSignedLocalStorageUrl } from '../../utils/signed-storage-url';
import {
  log,
  isAutonomousEnabled,
  isCiaAutonomyMode,
  isExplicitProactiveOutreachAllowed,
  type UnknownRecord,
  notifyBillingSuspended,
  WINDOW_START,
  WINDOW_END,
  SILENCE_HOURS,
  CYCLE_LIMIT,
} from './shared';
import { maybeEscalateToHumanControl } from './backlog';
import { logAutopilotAction } from './safeguard';
import { executeAction } from './execution';

export async function runCycleAll() {
  const workspaces = await prisma.workspace.findMany({
    select: { id: true, providerSettings: true },
    take: 500,
  });
  await forEachSequential(workspaces, async (ws) => {
    const settings = (ws.providerSettings ?? {}) as UnknownRecord;
    if (settings?.billingSuspended === true) {
      log.info('autopilot_cycle_skip_billing', { workspaceId: ws.id });
      await notifyBillingSuspended(ws.id);
      return;
    }
    if (isCiaAutonomyMode(settings)) {
      log.info('autopilot_cycle_skip_cia_primary', { workspaceId: ws.id });
      return;
    }
    if (!isAutonomousEnabled(settings)) {
      return;
    }
    if (!isExplicitProactiveOutreachAllowed(settings)) {
      log.info('autopilot_cycle_skip_proactive_disabled', {
        workspaceId: ws.id,
      });
      return;
    }
    await runCycleWorkspace(ws.id, settings);
  });
}

export async function runCycleWorkspace(workspaceId: string, presetSettings?: UnknownRecord) {
  const settings = presetSettings
    ? presetSettings
    : ((
        await prisma.workspace.findUnique({
          where: { id: workspaceId },
          select: { providerSettings: true },
        })
      )?.providerSettings as UnknownRecord);
  if (settings?.billingSuspended === true) {
    log.info('autopilot_cycle_skip_billing', { workspaceId });
    await notifyBillingSuspended(workspaceId);
    return { queued: 0, reason: 'billing_suspended' };
  }
  if (!isAutonomousEnabled(settings)) {
    return { queued: 0, reason: 'autopilot_disabled' };
  }
  const now = new Date();
  const nowHour = getWorkspaceLocalHour(settings, now);
  const withinWindow = isWithinWorkspaceWindow({
    settings,
    startHour: WINDOW_START,
    endHour: WINDOW_END,
    now,
  });
  if (!withinWindow) {
    log.info('autopilot_cycle_skipped_window', { workspaceId, nowHour, WINDOW_START, WINDOW_END });
    return { queued: 0, reason: 'outside_window', localHour: nowHour };
  }

  const openBacklog = prisma.conversation.count
    ? await prisma.conversation
        .count({
          where: {
            workspaceId,
            status: { not: 'CLOSED' },
            unreadCount: { gt: 0 },
          },
        })
        .catch(() => 0)
    : 0;

  const cutoff = new Date(Date.now() - SILENCE_HOURS * 3600000);
  const convs = await prisma.conversation.findMany({
    where: {
      workspaceId,
      status: 'OPEN',
      lastMessageAt: { lt: cutoff },
      unreadCount: 0,
    },
    include: {
      contact: {
        select: {
          id: true,
          phone: true,
          name: true,
          leadScore: true,
          customFields: true,
          email: true,
        },
      },
      messages: { orderBy: { createdAt: 'desc' }, take: 5 },
    },
  });

  const limited = convs.slice(0, Math.max(1, CYCLE_LIMIT));
  const enriched = limited
    .map((conv) => {
      const lastInbound = conv.messages.find((m: UnknownRecord) => m.direction === 'INBOUND');
      const lastMessage = conv.messages[0];
      const demandState = computeDemandState({
        lastMessageAt: conv.lastMessageAt,
        unreadCount: conv.unreadCount,
        leadScore: (conv.contact as UnknownRecord | undefined)?.leadScore || 0,
        lastMessageText: lastInbound?.content || lastMessage?.content || '',
      });

      return {
        conv,
        lastInbound,
        lastMessage,
        demandState,
      };
    })
    .sort((a, b) => b.demandState.attentionScore - a.demandState.attentionScore);

  const marketSignals = extractMarketSignals(
    enriched.flatMap(({ conv }) => conv.messages.map((message) => message.content)),
  );
  const hotLeadCount = enriched.filter((item) => item.demandState.lane === 'HOT').length;
  const pendingPaymentCount = enriched.filter(({ lastInbound, lastMessage }) => {
    const text = String(lastInbound?.content || lastMessage?.content || '').toLowerCase();
    return ['pix', 'boleto', 'cartao', 'cartão', 'pagamento', 'pagar', 'vencimento', 'cobran'].some(
      (keyword) => text.includes(keyword),
    );
  }).length;
  const recentExecuted = await prisma.autopilotEvent
    .findMany({
      where: {
        workspaceId,
        status: 'executed',
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
      },
      take: 50,
      orderBy: { createdAt: 'desc' },
    })
    .catch(() => []);

  const approvedSalesCount = recentExecuted.filter(
    (event: UnknownRecord) => event?.meta?.saleApproved === true,
  ).length;
  const approvedSalesAmount = recentExecuted
    .map((event: UnknownRecord) => Number(event?.meta?.amount || 0) || 0)
    .reduce((sum, amount) => sum + amount, 0);

  const snapshot = buildBusinessStateSnapshot({
    openBacklog,
    hotLeadCount,
    pendingPaymentCount,
    approvedSalesCount,
    approvedSalesAmount,
    avgResponseMinutes: 0,
    marketSignals,
  });

  await persistBusinessSnapshot(prisma, {
    workspaceId,
    snapshot,
  });
  await persistMarketSignals(prisma, {
    workspaceId,
    signals: marketSignals,
  });

  const missionPlan = buildMissionPlan({
    demandStates: enriched.map(({ conv, demandState }) => ({
      contactName: conv.contact?.name || conv.contact?.phone || null,
      demandState,
    })),
    marketSignals,
    snapshot,
  });

  await publishAgentEvent({
    type: 'thought',
    workspaceId,
    phase: 'mission_plan',
    message: missionPlan.summary,
    meta: {
      focusContacts: missionPlan.focusContacts,
      priorities: missionPlan.priorities,
      openBacklog,
      hotLeadCount,
      pendingPaymentCount,
    },
  });

  if (marketSignals[0]?.frequency >= 3) {
    await persistSystemInsight(prisma, {
      workspaceId,
      type: 'CIA_MARKET_SIGNAL',
      title: `Sinal dominante: ${marketSignals[0].normalizedKey}`,
      description: `Detectei ${marketSignals[0].frequency} ocorrências recentes de ${marketSignals[0].signalType.toLowerCase()}.`,
      severity: marketSignals[0].frequency >= 5 ? 'WARNING' : 'INFO',
      metadata: {
        signalType: marketSignals[0].signalType,
        normalizedKey: marketSignals[0].normalizedKey,
        frequency: marketSignals[0].frequency,
        examples: marketSignals[0].examples,
      },
    });
  }

  if (!isExplicitProactiveOutreachAllowed(settings)) {
    log.info('autopilot_cycle_skip_proactive_disabled', {
      workspaceId,
      message: 'BI persisted but skipping proactive outreach',
    });
    return { queued: 0, reason: 'proactive_outreach_disabled', snapshot };
  }

  let executed = 0;
  await forEachSequential(enriched, async ({ conv, lastInbound, lastMessage, demandState }) => {
    if (conv.contact?.id) {
      await persistDemandState(prisma, {
        workspaceId,
        contactId: conv.contact.id,
        state: demandState,
        contactName: conv.contact.name || conv.contact.phone,
      });
    }

    if (demandState.strategy === 'DROP' || demandState.strategy === 'WAIT') {
      await logAutopilotAction({
        workspaceId,
        contactId: conv.contact?.id,
        phone: conv.contact?.phone,
        action: 'CYCLE_SKIP',
        intent: 'REENGAGE',
        status: 'skipped',
        reason: demandState.strategy === 'DROP' ? 'attention_budget_drop' : 'attention_budget_wait',
        meta: { demandState },
      });
      return;
    }

    const text = (lastInbound?.content || lastMessage?.content || '').toLowerCase();
    const buying = [
      'preco',
      'preço',
      'quanto',
      'valor',
      'pix',
      'boleto',
      'custa',
      'pag',
      'assin',
    ].some((k) => text.includes(k));
    const lastDate = lastMessage?.createdAt ? new Date(lastMessage.createdAt) : null;
    const ageHours = lastDate ? (Date.now() - lastDate.getTime()) / 3600000 : null;
    const action =
      demandState.strategy === 'RECOVER_PAYMENT'
        ? 'FOLLOW_UP_STRONG'
        : ageHours && ageHours > 72
          ? 'ANTI_CHURN'
          : buying || demandState.strategy === 'PUSH'
            ? 'GHOST_CLOSER'
            : 'LEAD_UNLOCKER';

    const decisionEnvelope = buildDecisionEnvelope({
      intent: buying ? 'FOLLOW_UP_BUYING' : 'REENGAGE',
      action,
      confidence: demandState.lane === 'HOT' ? 0.88 : demandState.lane === 'WARM' ? 0.76 : 0.62,
      messageContent: text,
      demandState,
    });

    const humanGate = await maybeEscalateToHumanControl({
      workspaceId,
      contactId: conv.contact?.id,
      contactName: conv.contact?.name || conv.contact?.phone,
      phone: conv.contact?.phone,
      decisionEnvelope,
      messageContent: text,
      intent: buying ? 'FOLLOW_UP_BUYING' : 'REENGAGE',
      action,
    });
    if (humanGate.blocked) {
      return;
    }

    await executeAction(action, {
      workspaceId,
      contactId: conv.contact?.id,
      conversationId: conv.id,
      phone: conv.contact?.phone,
      messageContent: lastInbound?.content || conv.messages[0]?.content || '',
      settings,
      intent: buying ? 'FOLLOW_UP_BUYING' : 'REENGAGE',
      reason: 'cycle_silence',
      intentConfidence: decisionEnvelope.confidence,
      usedHistory: true,
      usedKb: false,
      idempotencyContext: {
        source: 'cycle_silence',
        lastInboundId: lastInbound?.id || null,
        lastInboundAt: lastInbound?.createdAt?.toISOString?.() || null,
        conversationId: conv.id,
      },
    });
    executed += 1;
  });
  log.info('autopilot_cycle_completed', { workspaceId, processed: limited.length });
  return {
    queued: executed,
    reason: executed > 0 ? 'executed' : 'no_eligible_conversations',
    processed: limited.length,
  };
}

export async function sendAudioResponse(
  workspaceId: string,
  phone: string,
  chatId: string | undefined,
  text: string,
  settings: UnknownRecord,
  workspaceCfg: UnknownRecord,
  quotedMessageId?: string,
): Promise<boolean> {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      log.warn('openai_tts_not_configured', { workspaceId });
      return false;
    }

    let voiceId =
      settings?.voice?.voiceId ||
      settings?.autopilot?.voiceId ||
      process.env.OPENAI_TTS_VOICE ||
      'nova';

    const voiceProfile = await prisma.voiceProfile.findFirst({
      where: { workspaceId },
      orderBy: { updatedAt: 'desc' },
      select: { voiceId: true },
    });
    if (voiceProfile?.voiceId) {
      voiceId = voiceProfile.voiceId;
    }

    const ttsSpeed = Number.parseFloat(process.env.OPENAI_TTS_SPEED || '1.0');

    const openai = new OpenAI({ apiKey });
    const response = await openai.audio.speech.create({
      model: 'tts-1',
      voice: voiceId as string,
      input: text,
      speed: ttsSpeed,
      response_format: 'opus',
    });

    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = Buffer.from(arrayBuffer);
    const base64Audio = audioBuffer.toString('base64');

    const fs = await import('node:fs');
    const path = await import('node:path');
    const crypto = await import('node:crypto');

    const uploadsDir = safeResolve(process.cwd(), '..', 'backend', 'uploads', 'audio');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const fileName = `audio_${crypto.randomUUID()}_${Date.now()}.mp3`;
    const filePath = safeResolve(uploadsDir, path.normalize(fileName));
    if (!filePath.startsWith(`${uploadsDir}${path.sep}`) && filePath !== uploadsDir) {
      throw new Error('Path traversal detected in audio file path');
    }
    fs.writeFileSync(filePath, audioBuffer);

    const cdnBase = process.env.CDN_BASE_URL || process.env.MEDIA_BASE_URL;

    let audioUrl: string;
    if (cdnBase) {
      audioUrl = `${cdnBase}/audio/${fileName}`;
    } else if (process.env.APP_URL || process.env.BACKEND_URL || process.env.API_URL) {
      audioUrl = buildSignedLocalStorageUrl(`audio/${fileName}`, {
        expiresInSeconds: 15 * 60,
        downloadName: fileName,
      });
    } else {
      audioUrl = `data:audio/mpeg;base64,${base64Audio}`;
    }

    await WhatsAppEngine.sendMedia(
      workspaceCfg as { id: string; [key: string]: unknown },
      phone,
      'audio',
      audioUrl,
      undefined,
      {
        quotedMessageId,
        chatId,
      },
    );

    setTimeout(() => {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch {
        void 0;
      }
    }, 60000);

    log.info('audio_response_sent', {
      workspaceId,
      phone,
      textLength: text.length,
      audioUrl: audioUrl.substring(0, 80),
    });
    return true;
  } catch (error: unknown) {
    const errorInstanceofError =
      error instanceof Error
        ? error
        : new Error(typeof error === 'string' ? error : 'unknown error');
    log.error('send_audio_error', { error: errorInstanceofError.message, workspaceId, phone });
    return false;
  }
}
