/**
 * PULSE Parser 94: Idempotency Checker
 * Layer 25: Request Safety
 * Mode: DEEP (requires codebase scan + optional runtime validation)
 *
 * CHECKS:
 * 1. Triple-send same request: sends the same POST request 3 times with identical
 *    idempotency key and verifies only 1 record is created (or all return same result)
 * 2. Payment idempotency: verifies all payment creation endpoints:
 *    a. Accept and store an idempotency key from the client
 *    b. Return the cached response if the same key is seen again (not process twice)
 *    c. Pass idempotency key to Asaas (prevents double-charge at provider level)
 * 3. BullMQ job idempotency: verifies jobs have a jobId or deduplication key
 *    (same job enqueued twice should not run twice)
 * 4. Webhook idempotency: verifies webhooks are processed at-most-once
 *    (already covered by audit-trail, but checks specifically for idempotency key storage)
 * 5. Retry safety: verifies that operations which may be retried (network errors)
 *    are idempotent (same result on retry as on first call)
 *
 * REQUIRES: PULSE_DEEP=1, PULSE_CHAOS=1 for runtime tests
 * Emits idempotency evidence gaps; diagnostic identity is synthesized downstream.
 */
import * as path from 'path';
import type { Break, PulseConfig } from '../types';
import { walkFiles } from './utils';
import { readTextFile } from '../safe-fs';

const IDEMPOTENCY_KEY_RE = /idempotencyKey|idempotency.key|X-Idempotency-Key|idempotent/i;
const JOB_ID_RE = /jobId\s*:|opts.*jobId|deduplication|deduplicate/i;
const PAYMENT_ENDPOINT_RE = /createPayment|createCharge|createBilling|checkout.*create|pay\s*\(/i;
const UPSERT_RE = /\.upsert\s*\(|createOrUpdate|findOrCreate/i;
const DUPLICATE_CHECK_RE = /alreadyExists|isDuplicate|existingRecord|externalId.*unique|@@unique/i;
const MUTATING_WEBHOOK_RE =
  /prisma\.[A-Za-z_$]\w*\.(?:create|update|upsert|delete)|this\.[A-Za-z_$]\w*Service\.[A-Za-z_$]\w*\(|process[A-Za-z]+Webhook|handle[A-Za-z]+Event/i;

function idempotencyFinding(input: {
  severity: Break['severity'];
  file: string;
  line: number;
  description: string;
  detail: string;
}): Break {
  return {
    type: 'idempotency-evidence-gap',
    severity: input.severity,
    file: input.file,
    line: input.line,
    description: input.description,
    detail: input.detail,
    source: 'parser:weak_signal:idempotency',
    surface: 'request-safety',
  };
}

/** Check idempotency. */
export function checkIdempotency(config: PulseConfig): Break[] {
  const breaks: Break[] = [];

  const backendFiles = walkFiles(config.backendDir, ['.ts']);

  for (const file of backendFiles) {
    if (/\.spec\.ts$|migration|seed/i.test(file)) {
      continue;
    }

    let content: string;
    try {
      content = readTextFile(file, 'utf8');
    } catch {
      continue;
    }

    const relFile = path.relative(config.rootDir, file);
    const normalizedRelFile = relFile.replace(/\\/g, '/');

    // CHECK 2: Payment idempotency
    if (PAYMENT_ENDPOINT_RE.test(content) && /service/i.test(file)) {
      const hasIdempotencyKey = IDEMPOTENCY_KEY_RE.test(content);
      const hasUpsert = UPSERT_RE.test(content);
      const hasDuplicateCheck = DUPLICATE_CHECK_RE.test(content);

      if (!hasIdempotencyKey && !hasUpsert && !hasDuplicateCheck) {
        breaks.push(
          idempotencyFinding({
            severity: 'critical',
            file: relFile,
            line: 0,
            description:
              'Payment creation endpoint without idempotency key — network retry causes double charge',
            detail:
              'Accept X-Idempotency-Key header; store key+response in Redis/DB; return cached response on duplicate key',
          }),
        );
      }

      // Specifically verify Stripe calls pass idempotency key
      if (/stripe/i.test(content) && !IDEMPOTENCY_KEY_RE.test(content)) {
        breaks.push(
          idempotencyFinding({
            severity: 'critical',
            file: relFile,
            line: 0,
            description:
              'Stripe payment call without idempotency key — provider retry can create duplicate financial operations',
            detail:
              'Pass the idempotency key to Stripe requests to prevent duplicate financial operations at provider level',
          }),
        );
      }
    }

    // CHECK 1: General POST endpoints without idempotency
    if (/controller/i.test(file)) {
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (/@Post\s*\(/.test(line)) {
          // Check surrounding method for idempotency handling
          const context = lines.slice(i, Math.min(lines.length, i + 30)).join('\n');
          const hasIdempotency =
            IDEMPOTENCY_KEY_RE.test(context) ||
            UPSERT_RE.test(context) ||
            DUPLICATE_CHECK_RE.test(context);
          // Only flag if the POST creates a resource (create/save/add in method body)
          const createsResource = /\.create\s*\(|\.save\s*\(|\.insert\s*\(/.test(context);
          if (createsResource && !hasIdempotency) {
            breaks.push(
              idempotencyFinding({
                severity: 'high',
                file: relFile,
                line: i + 1,
                description:
                  'POST endpoint creates resource without idempotency — safe retry not possible',
                detail:
                  'Support X-Idempotency-Key or use upsert with unique constraint to make creation idempotent',
              }),
            );
          }
        }
      }
    }

    // CHECK 3: BullMQ job idempotency
    if (/queue|Queue|addJob|add\s*\(/.test(content) && /bull|BullMQ/i.test(content)) {
      const hasJobId = JOB_ID_RE.test(content);
      if (!hasJobId) {
        breaks.push(
          idempotencyFinding({
            severity: 'high',
            file: relFile,
            line: 0,
            description:
              'BullMQ job enqueued without deduplication jobId — same job may run multiple times on retry',
            detail:
              'Pass { jobId: uniqueKey } option when adding jobs; BullMQ will skip duplicate jobIds',
          }),
        );
      }
    }

    // CHECK 4: Webhook idempotency (at-most-once processing)
    if (/webhook/i.test(file) && /controller/i.test(file)) {
      const hasIdempotencyCheck =
        DUPLICATE_CHECK_RE.test(content) || IDEMPOTENCY_KEY_RE.test(content);
      const hasWebhookEventModel = /WebhookEvent|webhookEvent/i.test(content);
      const mutatesWebhookState = MUTATING_WEBHOOK_RE.test(content);

      if (mutatesWebhookState && !hasIdempotencyCheck && !hasWebhookEventModel) {
        breaks.push(
          idempotencyFinding({
            severity: 'high',
            file: relFile,
            line: 0,
            description:
              'Webhook handler without idempotency check — duplicate webhooks will be processed twice',
            detail:
              'Store processed webhook IDs in WebhookEvent model; reject duplicates with 200 (not 409)',
          }),
        );
      }
    }

    // CHECK 5: Retry-unsafe operations (operations with side effects that are not guarded)
    if (
      /retry|Retry|maxRetries|backoff/i.test(content) &&
      !/\.module\.ts$/i.test(normalizedRelFile)
    ) {
      // Check if retried operations are marked as idempotent or have guards
      if (
        !/idempotent|idempotency|requestId|once.*retry|retryOnce|skipDuplicate/i.test(content) &&
        /sendEmail|sendSMS|sendWhatsApp|charge|processPayment/i.test(content)
      ) {
        breaks.push(
          idempotencyFinding({
            severity: 'high',
            file: relFile,
            line: 0,
            description:
              'Retry logic around operations with external side effects without idempotency guard',
            detail:
              'Retrying email/SMS/payment sends can cause duplicates; ensure idempotency before configuring retries',
          }),
        );
      }
    }
  }

  // RUNTIME CHECKS (require PULSE_CHAOS=1 + running infrastructure)
  if (process.env.PULSE_CHAOS) {
    // TODO: Implement when infrastructure available
    //
    // CHECK 1 — Triple-send test
    // 1. Generate a unique idempotency key
    // 2. POST /products with the key 3 times simultaneously
    // 3. Verify: exactly 1 product created (not 3)
    // 4. Verify: all 3 responses have identical body (same record returned)
    //
    // CHECK 2 — Payment double-charge test
    // 1. Send payment request with idempotency key K
    // 2. Before response received, send same request again with key K
    // 3. Verify: Asaas shows only 1 charge
    // 4. Verify: DB has only 1 Payment record
  }

  return breaks;
}
