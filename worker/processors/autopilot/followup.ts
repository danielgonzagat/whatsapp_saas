import { prisma } from '../../db';
import { autopilotQueue } from '../../queue';
import {
  getDelayUntilWorkspaceWindowOpens,
  getWorkspaceLocalHour,
  isWithinWorkspaceWindow,
} from '../../providers/timezone';
import {
  log,
  notifyBillingSuspended,
  isAutonomousEnabled,
  isExplicitProactiveOutreachAllowed,
  WINDOW_START,
  WINDOW_END,
  type UnknownRecord,
} from './shared';
import { logAutopilotAction } from './safeguard';
import { executeAction, sendDirectAutopilotText } from './execution';

type ChannelName = 'whatsapp' | 'instagram' | 'messenger' | 'facebook' | 'tiktok' | 'email';

export async function runFollowupContact(data: UnknownRecord) {
  const workspaceId = data?.workspaceId;
  if (!workspaceId) {
    return;
  }

  const contactId = data?.contactId;
  const phone = data?.phone;
  const scheduledAt = data?.scheduledAt ? new Date(data.scheduledAt) : null;
  const jobKey = contactId || phone || workspaceId;
  const channel: ChannelName = (
    typeof data?.channel === 'string' ? data.channel : 'whatsapp'
  ) as ChannelName;

  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { providerSettings: true },
  });
  const settings = (workspace?.providerSettings ?? {}) as UnknownRecord;

  if (settings?.billingSuspended === true) {
    log.info('followup_skip_billing_suspended', { workspaceId });
    await notifyBillingSuspended(workspaceId);
    await logAutopilotAction({
      workspaceId,
      contactId,
      phone,
      action: 'FOLLOWUP_CONTACT',
      intent: 'FOLLOW_UP',
      status: 'skipped',
      reason: 'billing_suspended',
      meta: { source: 'followup_contact' },
    });
    return 'skipped';
  }

  if (!isAutonomousEnabled(settings)) {
    log.info('followup_skip_autopilot_disabled', { workspaceId });
    await logAutopilotAction({
      workspaceId,
      contactId,
      phone,
      action: 'FOLLOWUP_CONTACT',
      intent: 'FOLLOW_UP',
      status: 'skipped',
      reason: 'autopilot_disabled',
      meta: { source: 'followup_contact' },
    });
    return 'skipped';
  }

  if (!isExplicitProactiveOutreachAllowed(settings)) {
    log.info('followup_skip_proactive_disabled', { workspaceId });
    await logAutopilotAction({
      workspaceId,
      contactId,
      phone,
      action: 'FOLLOWUP_CONTACT',
      intent: 'FOLLOW_UP',
      status: 'skipped',
      reason: 'proactive_outreach_disabled',
      meta: { source: 'followup_contact' },
    });
    return 'skipped';
  }

  // P1.4 — per-channel followup enforcement. When the operator explicitly
  // disabled followups for this channel, the scheduler must not enqueue and
  // the handler must not execute. Record the decision for auditability.
  try {
    const channelConfig = await prisma.channelConfig.findUnique({
      where: { workspaceId_channel: { workspaceId, channel } },
      select: { followupEnabled: true },
    });
    if (channelConfig?.followupEnabled === false) {
      log.info('followup.skipped.channel-disabled', { workspaceId, channel });
      await logAutopilotAction({
        workspaceId,
        contactId,
        phone,
        action: 'FOLLOWUP_CONTACT',
        intent: 'FOLLOW_UP',
        status: 'skipped',
        reason: 'followup_disabled_per_channel_config',
        meta: { source: 'followup_contact', channel },
      });
      return null;
    }
  } catch (configErr: unknown) {
    log.warn('followup_channel_config_lookup_failed', {
      workspaceId,
      channel,
      error: configErr instanceof Error ? configErr.message : String(configErr),
    });
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
    const delayMs = getDelayUntilWorkspaceWindowOpens({
      settings,
      startHour: WINDOW_START,
      endHour: WINDOW_END,
      now,
    });

    await autopilotQueue.add(
      'followup-contact',
      {
        ...data,
        workspaceId,
        scheduledAt: data?.scheduledAt || new Date().toISOString(),
      },
      {
        delay: delayMs,
        jobId: `followup-${jobKey}-window`,
        removeOnComplete: true,
      },
    );

    await logAutopilotAction({
      workspaceId,
      contactId,
      phone,
      action: 'FOLLOWUP_CONTACT',
      intent: 'FOLLOW_UP',
      status: 'skipped',
      reason: 'outside_window_rescheduled',
      meta: {
        source: 'followup_contact',
        localHour: nowHour,
        windowStart: WINDOW_START,
        windowEnd: WINDOW_END,
        delayMs,
      },
    });
    return 'skipped';
  }

  // Encontra conversa aberta
  const conv = await prisma.conversation.findFirst({
    where: {
      workspaceId,
      status: 'OPEN',
      ...(contactId ? { contactId } : phone ? { contact: { phone } } : {}),
    },
    include: {
      contact: { select: { id: true, phone: true } },
      messages: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
  });
  if (!conv || !conv.contact?.phone) {
    return 'skipped';
  }
  if (conv.mode && conv.mode !== 'AI') {
    await logAutopilotAction({
      workspaceId,
      contactId: conv.contact.id,
      phone: conv.contact.phone,
      action: 'FOLLOWUP_CONTACT',
      intent: 'FOLLOW_UP',
      status: 'skipped',
      reason: 'human_mode_lock',
      meta: {
        source: 'followup_contact',
        conversationId: conv.id,
        conversationMode: conv.mode,
      },
    });
    return 'skipped';
  }

  const lastMsg = conv.messages[0];
  if (!lastMsg) {
    return 'skipped';
  }

  // Se houve resposta INBOUND após o agendamento, não enviar follow-up
  if (scheduledAt && lastMsg.direction === 'INBOUND' && lastMsg.createdAt > scheduledAt) {
    log.info('followup_skip_inbound_received', { workspaceId, contactId: conv.contact.id });
    await logAutopilotAction({
      workspaceId,
      contactId: conv.contact.id,
      phone: conv.contact.phone,
      action: 'FOLLOWUP_CONTACT',
      intent: 'FOLLOW_UP',
      status: 'skipped',
      reason: 'inbound_after_schedule',
      meta: { source: 'followup_contact' },
    });
    return 'skipped';
  }

  const text = (lastMsg.content || '').toLowerCase();
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

  const action = data?.actionOverride || (buying ? 'GHOST_CLOSER' : 'LEAD_UNLOCKER');

  if (data?.messageOverride) {
    return sendDirectAutopilotText({
      workspaceId,
      contactId: conv.contact.id,
      conversationId: conv.id,
      phone: conv.contact.phone,
      text: String(data.messageOverride),
      settings,
      intent: buying ? 'FOLLOW_UP_BUYING' : 'REENGAGE',
      reason: data?.reason || 'cia_followup_override',
      workspaceRecord: { providerSettings: settings },
      actionLabel: action,
      idempotencyContext: {
        source: 'followup_override',
        scheduledAt: data?.scheduledAt || null,
        jobKey,
      },
    });
  }

  return executeAction(action, {
    workspaceId,
    contactId: conv.contact.id,
    conversationId: conv.id,
    phone: conv.contact.phone,
    messageContent: lastMsg.content || '',
    settings,
    intent: buying ? 'FOLLOW_UP_BUYING' : 'REENGAGE',
    reason: data?.reason || 'buying_signal_followup',
    workspaceRecord: { providerSettings: settings },
    idempotencyContext: {
      source: 'followup_contact',
      scheduledAt: data?.scheduledAt || null,
      jobKey,
    },
  });
}
