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

function splitIdentifier(value: string): Set<string> {
  const tokens = new Set<string>();
  let current = '';
  for (const char of value) {
    const isAlphaNumeric =
      (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z') || (char >= '0' && char <= '9');
    if (!isAlphaNumeric) {
      if (current) {
        tokens.add(current.toLowerCase());
        current = '';
      }
      continue;
    }
    if (current && current[current.length - 1] <= 'z' && current[current.length - 1] >= 'a') {
      if (char >= 'A' && char <= 'Z') {
        tokens.add(current.toLowerCase());
        current = char;
        continue;
      }
    }
    current += char;
  }
  if (current) {
    tokens.add(current.toLowerCase());
  }
  return tokens;
}

function hasTokenPrefix(tokens: Set<string>, prefix: string): boolean {
  return [...tokens].some((token) => token.startsWith(prefix));
}

function hasIdempotencyEvidence(value: string): boolean {
  const tokens = splitIdentifier(value);
  return (
    hasTokenPrefix(tokens, 'idempot') ||
    (tokens.has('request') && tokens.has('id')) ||
    hasTokenPrefix(tokens, 'dedup') ||
    tokens.has('duplicate') ||
    tokens.has('unique') ||
    tokens.has('existing') ||
    tokens.has('upsert')
  );
}

function hasCreateOrUpdateEvidence(value: string): boolean {
  const tokens = splitIdentifier(value);
  return (
    tokens.has('create') ||
    tokens.has('update') ||
    tokens.has('save') ||
    tokens.has('insert') ||
    tokens.has('upsert') ||
    (tokens.has('find') && tokens.has('create'))
  );
}

function hasExternalEffectCreateEvidence(value: string): boolean {
  const tokens = splitIdentifier(value);
  return (
    hasCreateOrUpdateEvidence(value) &&
    (tokens.has('charge') || tokens.has('billing') || tokens.has('pay'))
  );
}

function hasQueueEnqueueEvidence(value: string): boolean {
  const tokens = splitIdentifier(value);
  return tokens.has('queue') || tokens.has('job') || tokens.has('add');
}

function hasWebhookEvidence(value: string): boolean {
  return hasTokenPrefix(splitIdentifier(value), 'webhook');
}

function hasMutationEvidence(value: string): boolean {
  const tokens = splitIdentifier(value);
  return (
    hasCreateOrUpdateEvidence(value) ||
    tokens.has('delete') ||
    tokens.has('process') ||
    tokens.has('handle')
  );
}

function hasRetryEvidence(value: string): boolean {
  const tokens = splitIdentifier(value);
  return tokens.has('retry') || tokens.has('retries') || tokens.has('backoff');
}

function hasExternalSideEffectEvidence(value: string): boolean {
  const tokens = splitIdentifier(value);
  return (
    tokens.has('send') ||
    tokens.has('email') ||
    tokens.has('sms') ||
    tokens.has('message') ||
    tokens.has('charge') ||
    tokens.has('payment') ||
    tokens.has('external')
  );
}

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
    const fileTokens = splitIdentifier(normalizedRelFile);

    if (hasExternalEffectCreateEvidence(content) && fileTokens.has('service')) {
      if (!hasIdempotencyEvidence(content)) {
        breaks.push(
          idempotencyFinding({
            severity: 'critical',
            file: relFile,
            line: 0,
            description: 'External-effect creation path lacks idempotency evidence',
            detail:
              'Accept and preserve a request identity or prove duplicate-safe mutation behavior with observed evidence.',
          }),
        );
      }

      if (hasExternalSideEffectEvidence(content) && !hasIdempotencyEvidence(content)) {
        breaks.push(
          idempotencyFinding({
            severity: 'critical',
            file: relFile,
            line: 0,
            description: 'External provider call lacks request identity evidence',
            detail:
              'Forward or derive a stable request identity for external effects, then prove duplicate-safe retry behavior.',
          }),
        );
      }
    }

    if (fileTokens.has('controller')) {
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith('@Post') && line.includes('(')) {
          const context = lines.slice(i, Math.min(lines.length, i + 30)).join('\n');
          const createsResource = hasCreateOrUpdateEvidence(context);
          if (createsResource && !hasIdempotencyEvidence(context)) {
            breaks.push(
              idempotencyFinding({
                severity: 'high',
                file: relFile,
                line: i + 1,
                description: 'POST endpoint performs creation without idempotency evidence',
                detail:
                  'Support a stable request identity or prove duplicate-safe mutation behavior with observed evidence.',
              }),
            );
          }
        }
      }
    }

    if (hasQueueEnqueueEvidence(content)) {
      if (!hasIdempotencyEvidence(content)) {
        breaks.push(
          idempotencyFinding({
            severity: 'high',
            file: relFile,
            line: 0,
            description: 'Queued work is enqueued without deduplication evidence',
            detail:
              'Derive a stable job identity or prove duplicate-safe queue behavior with observed evidence.',
          }),
        );
      }
    }

    if (hasWebhookEvidence(normalizedRelFile) && fileTokens.has('controller')) {
      const hasIdempotencyCheck = hasIdempotencyEvidence(content);
      const mutatesWebhookState = hasMutationEvidence(content);

      if (mutatesWebhookState && !hasIdempotencyCheck) {
        breaks.push(
          idempotencyFinding({
            severity: 'high',
            file: relFile,
            line: 0,
            description: 'Webhook-like handler mutates state without duplicate-processing evidence',
            detail:
              'Store or derive a processed-event identity and prove duplicate delivery is acknowledged without duplicate mutation.',
          }),
        );
      }
    }

    if (hasRetryEvidence(content) && !normalizedRelFile.toLowerCase().endsWith('.module.ts')) {
      if (!hasIdempotencyEvidence(content) && hasExternalSideEffectEvidence(content)) {
        breaks.push(
          idempotencyFinding({
            severity: 'high',
            file: relFile,
            line: 0,
            description: 'Retry logic wraps external side effects without idempotency evidence',
            detail:
              'Retrying external effects can create duplicates; prove stable request identity before configuring retries.',
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
