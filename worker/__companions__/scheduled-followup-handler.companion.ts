import { type Job } from 'bullmq';
import { prisma } from '../db';
import { buildQueueJobId } from '../job-id';
import { WorkerLogger } from '../logger';
import { dispatchOutboundThroughFlow } from '../providers/outbound-dispatcher';
import { sendFallbackEmail } from './fallback-email.companion';

const log = new WorkerLogger('scheduled-followup');

export async function handleScheduledFollowup(job: Job) {
  const { workspaceId, contactId, phone, message, scheduledFor } = job.data ?? {};

  log.info('followup_start', { jobId: job.id, workspaceId, phone, scheduledFor });

  if (!workspaceId || !phone || !message) {
    log.warn('followup_invalid_job', { jobId: job.id, data: job.data });
    return { error: true, reason: 'invalid_followup_data' };
  }

  try {
    // Load workspace config
    const ws = await prisma.workspace.findUnique({ where: { id: workspaceId } });
    if (!ws) {
      log.warn('followup_workspace_not_found', { workspaceId });
      return { error: true, reason: 'workspace_not_found' };
    }

    // Check if contact responded in the meantime
    if (contactId) {
      const recentMessage = await prisma.message.findFirst({
        where: {
          conversation: { contactId, workspaceId },
          direction: 'INBOUND',
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
        orderBy: { createdAt: 'desc' },
      });

      if (recentMessage) {
        log.info('followup_skip_recent_inbound', { workspaceId, contactId, phone });
        return { skipped: true, reason: 'recent_inbound_message' };
      }
    }

    // Send the follow-up message through the canonical outbound pipeline
    let sent = false;
    let channel = 'whatsapp';

    try {
      const result = await dispatchOutboundThroughFlow({
        workspaceId,
        to: phone,
        message,
        jobId: buildQueueJobId('scheduled-followup', workspaceId, contactId || phone, job.id),
      });
      sent = !!result && !result.error;
      log.info('followup_sent', { workspaceId, phone, channel, result: sent });
    } catch (whatsappErr: unknown) {
      log.warn('followup_whatsapp_failed', {
        workspaceId,
        phone,
        error: whatsappErr instanceof Error ? whatsappErr.message : String(whatsappErr),
      });
    }

    // Fallback: try email if WhatsApp failed and contact has email
    if (!sent && contactId) {
      const contact = await prisma.contact.findFirst({
        where: { id: contactId, workspaceId },
        select: { email: true, name: true },
      });

      if (contact?.email) {
        try {
          const emailResult = await sendFallbackEmail(
            contact.email,
            contact.name,
            message,
            ws.name,
          );
          if (emailResult) {
            sent = true;
            channel = 'email';
            log.info('followup_email_sent', { workspaceId, email: contact.email });
          }
        } catch (emailErr: unknown) {
          log.warn('followup_email_failed', {
            workspaceId,
            error: emailErr instanceof Error ? emailErr.message : String(emailErr),
          });
        }
      }
    }

    if (!sent) {
      log.warn('followup_all_channels_failed', { workspaceId, phone, contactId });
      return { ok: false, reason: 'all_channels_failed' };
    }

    // Update autopilot event status
    try {
      const prismaClient = prisma as unknown as Record<string, unknown>;
      if (prismaClient.autopilotEvent) {
        await (
          prismaClient.autopilotEvent as { updateMany: (args: unknown) => Promise<unknown> }
        ).updateMany({
          where: {
            workspaceId,
            contactId: contactId || undefined,
            status: 'scheduled',
            action: 'SCHEDULE_FOLLOWUP',
          },
          data: {
            status: 'success',
            responseText: message,
          },
        });
      }
    } catch {
      void 0;
    }

    return { ok: true, sent: true };
  } catch (err: unknown) {
    log.error('followup_error', {
      jobId: job.id,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
