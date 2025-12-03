import { Worker, Job } from "bullmq";
import { connection } from "../queue";
import axios from "axios";
import * as crypto from "crypto";

export const webhookWorker = new Worker("webhook-jobs", async (job: Job) => {
    const { url, payload, secret, event } = job.data;
    const timestamp = Date.now();
    
    // Sign payload
    const signature = secret
        ? crypto.createHmac('sha256', secret).update(`${timestamp}.${JSON.stringify(payload)}`).digest('hex')
        : '';

    try {
        await axios.post(url, {
            event,
            timestamp,
            data: payload
        }, {
            headers: {
                'X-Webhook-Signature': signature,
                'X-Webhook-Event': event,
                'User-Agent': 'Kloel-Webhook-Dispatcher/1.0'
            },
            timeout: 10000 // 10s timeout
        });
    } catch (err: any) {
        // BullMQ will handle retries based on queue options
        console.error(`[Webhook] Failed to send to ${url}: ${err.message}`);
        throw err; 
    }
}, { connection, concurrency: 20 });
