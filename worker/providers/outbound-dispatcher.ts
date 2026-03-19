import { flowQueue, getQueueEvents } from "../queue";

export async function dispatchOutboundThroughFlow(input: {
  workspaceId: string;
  to: string;
  message?: string;
  mediaUrl?: string;
  mediaType?: string;
  caption?: string;
  template?: {
    name: string;
    language?: string;
    components?: any[];
  };
  jobId: string;
  externalId?: string;
  timeoutMs?: number;
}) {
  const job = await flowQueue.add(
    "send-message",
    {
      workspaceId: input.workspaceId,
      to: input.to,
      user: input.to,
      message: input.message,
      mediaUrl: input.mediaUrl,
      mediaType: input.mediaType,
      caption: input.caption,
      template: input.template,
      externalId: input.externalId || input.jobId,
    },
    {
      jobId: input.jobId,
      removeOnComplete: true,
    },
  );

  return job.waitUntilFinished(
    getQueueEvents("flow-jobs"),
    Math.max(5_000, input.timeoutMs || 45_000),
  );
}
