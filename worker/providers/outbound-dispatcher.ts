import { flowQueue, getQueueEvents } from '../queue';

/** Dispatch outbound through flow. */
export async function dispatchOutboundThroughFlow(input: {
  workspaceId: string;
  to: string;
  chatId?: string | undefined;
  message?: string | undefined;
  mediaUrl?: string | undefined;
  mediaType?: string | undefined;
  caption?: string | undefined;
  template?: {
    name: string;
    language?: string;
    components?: unknown[];
  } | undefined;
  jobId: string;
  externalId?: string | undefined;
  quotedMessageId?: string | undefined;
  timeoutMs?: number | undefined;
}) {
  const job = await flowQueue.add(
    'send-message',
    {
      workspaceId: input.workspaceId,
      to: input.to,
      user: input.to,
      chatId: input.chatId,
      message: input.message,
      mediaUrl: input.mediaUrl,
      mediaType: input.mediaType,
      caption: input.caption,
      template: input.template,
      externalId: input.externalId || input.jobId,
      quotedMessageId: input.quotedMessageId,
    },
    {
      jobId: input.jobId,
      removeOnComplete: true,
    },
  );

  return job.waitUntilFinished(
    getQueueEvents('flow-jobs'),
    Math.max(5_000, input.timeoutMs || 45_000),
  );
}
