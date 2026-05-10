interface DlqEvent {
  queue: string;
  jobId?: string | number | undefined;
  jobName?: string | undefined;
  reason?: string | undefined;
}

interface DlqPayload extends DlqEvent {
  type: 'dlq_event';
  env: string;
  at: string;
}

const buildDlqPayload = (input: DlqEvent): DlqPayload => ({
  type: 'dlq_event',
  queue: input.queue,
  jobId: input.jobId,
  jobName: input.jobName,
  reason: input.reason,
  env: process.env.NODE_ENV || 'dev',
  at: new Date().toISOString(),
});

const buildSlackBody = (payload: DlqPayload): { text: string } => ({
  text: `DLQ ${payload.queue} -> job ${payload.jobName || payload.jobId || 'unknown'} (${payload.reason || 'no reason'}) [${payload.env}]`,
});

const buildTeamsBody = (payload: DlqPayload): Record<string, unknown> => ({
  '@type': 'MessageCard',
  '@context': 'http://schema.org/extensions',
  summary: 'DLQ Event',
  themeColor: 'E53935',
  title: `DLQ ${payload.queue}`,
  sections: [
    {
      facts: [
        { name: 'Job', value: String(payload.jobName || payload.jobId || 'unknown') },
        { name: 'Reason', value: payload.reason || 'n/a' },
        { name: 'Env', value: payload.env },
        { name: 'At', value: payload.at },
      ],
    },
  ],
});

const buildWebhookBody = (
  payload: DlqPayload,
  type: 'slack' | 'teams' | 'generic',
): Record<string, unknown> => {
  if (type === 'slack') {
    return buildSlackBody(payload);
  }
  if (type === 'teams') {
    return buildTeamsBody(payload);
  }
  return JSON.parse(JSON.stringify(payload)) as Record<string, unknown>;
};

const resolveFetch = (): typeof globalThis.fetch | undefined =>
  typeof globalThis.fetch === 'function' ? globalThis.fetch : undefined;

const normalizeError = (err: unknown): Error =>
  err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'unknown error');

function classifyWebhook(webhook: string): 'slack' | 'teams' | 'generic' {
  try {
    const host = new URL(webhook).hostname.toLowerCase();
    if (host === 'hooks.slack.com') {
      return 'slack';
    }
    if (
      host === 'outlook.office.com' ||
      host === 'outlook.office365.com' ||
      host.endsWith('.office.com') ||
      host.endsWith('.office365.com')
    ) {
      return 'teams';
    }
  } catch {
    return 'generic';
  }

  return 'generic';
}

export async function notifyOps(input: DlqEvent) {
  const webhook = process.env.DLQ_WEBHOOK_URL || process.env.OPS_WEBHOOK_URL;
  if (!webhook) {
    return;
  }
  const fetchFn = resolveFetch();
  if (!fetchFn) {
    return;
  }

  try {
    const payload = buildDlqPayload(input);
    const body = buildWebhookBody(payload, classifyWebhook(webhook));
    await fetchFn(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err: unknown) {
    const e = normalizeError(err);
    console.warn('[DLQ] Falha ao notificar webhook (%s): %s', webhook, e.message || err);
  }
}
