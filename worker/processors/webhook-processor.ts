import * as crypto from 'node:crypto';
import axios from 'axios';
import { type Job, Worker } from 'bullmq';
import { connection } from '../queue';
import { validateUrl } from '../utils/ssrf-protection';

export const webhookWorker = new Worker(
  'webhook-jobs',
  async (job: Job) => {
    const { url, payload, secret, event } = job.data;
    const timestamp = Date.now();

    // SSRF protection: validate URL before making the request
    const validation = await validateUrl(url);
    if (!validation.valid) {
      console.warn(`[Webhook] SSRF protection: blocked request to ${url} — ${validation.error}`);
      return;
    }

    // Sign payload
    const signature = secret
      ? crypto
          .createHmac('sha256', secret)
          .update(`${timestamp}.${JSON.stringify(payload)}`)
          .digest('hex')
      : '';

    try {
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
          timeout: 10000, // 10s timeout
        },
      );
    } catch (err: unknown) {
      const errInstanceofError =
        err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'unknown error');
      // BullMQ will handle retries based on queue options
      console.error(`[Webhook] Failed to send to ${url}: ${errInstanceofError.message}`);
      throw err;
    }
  },
  { connection, concurrency: 20 },
);
