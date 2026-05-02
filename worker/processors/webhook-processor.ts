import { createHmac } from 'node:crypto';
import axios from 'axios';
import { type Job, Worker } from 'bullmq';
import { connection } from '../queue';
import { throwIfRetryable } from '../src/utils/error-handler';
import { validateUrl } from '../utils/ssrf-protection';

/** Webhook worker. */
export const webhookWorker = new Worker(
  'webhook-jobs',
  async (job: Job) => {
    const { url, payload, secret, event } = job.data;
    const timestamp = Date.now();

    const validation = await validateUrl(url);
    if (!validation.valid) {
      console.warn(`[Webhook] SSRF protection: blocked request to ${url} — ${validation.error}`);
      throw new Error(`SSRF blocked: ${validation.error}`);
    }

    const signature = secret
      ? createHmac('sha256', secret)
          .update(`${timestamp}.${JSON.stringify(payload)}`)
          .digest('hex')
      : '';

    try {
      await job.updateProgress(50);
      await axios.post(
        url,
        {
          event,
          timestamp,
          data: payload,
        },
        {
          headers: {
            'X-Webhook-Signature': signature,
            'X-Webhook-Event': event,
            'User-Agent': 'Kloel-Webhook-Dispatcher/1.0',
          },
          timeout: 10000,
        },
      );
      await job.updateProgress(100);
    } catch (err: unknown) {
      console.error(
        `[Webhook] Failed to send to ${url}: ${err instanceof Error ? err.message : 'unknown_error'}`,
      );
      throwIfRetryable(err, 'webhook');
    }
  },
  { connection, concurrency: 20 },
);
