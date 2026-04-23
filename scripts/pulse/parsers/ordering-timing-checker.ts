/**
 * PULSE Parser 85: Ordering & Timing Checker
 * Layer 16: Temporal Correctness
 * Mode: DEEP (requires codebase scan + optional runtime validation)
 *
 * CHECKS:
 * 1. Out-of-order webhook handling: verifies webhook processors check event timestamps
 *    before applying state changes (a REFUND arriving before PAID must be handled)
 * 2. Clock skew tolerance: JWT expiry and session checks must allow ±30s skew
 *    (too strict = users logged out spuriously; too loose = security risk)
 * 3. Timezone handling: financial reports and scheduling must use UTC storage
 *    with explicit timezone conversion at display layer — not mix of TZ
 * 4. Idempotent webhook processing with sequence numbers (Asaas sends events in order
 *    but network can deliver out of order)
 * 5. Cron job timing: cron expressions verified against intended schedule
 *    (0 0 * * * = midnight UTC, not midnight local)
 * 6. Date comparison operators: verifies `>=` not `>` for range queries (off-by-one)
 * 7. Stale-while-revalidate cache: verifies SWR config doesn't serve stale financial data
 *
 * REQUIRES: PULSE_DEEP=1
 * BREAK TYPES:
 *   ORDERING_WEBHOOK_OOO(high)         — webhook handler ignores event ordering
 *   CLOCK_SKEW_TOO_STRICT(medium)      — JWT/session validation has zero skew tolerance
 *   TIMEZONE_REPORT_MISMATCH(high)     — financial data stored or compared in local TZ
 */
import * as path from 'path';
import type { Break, PulseConfig } from '../types';
import { walkFiles } from './utils';
import { readTextFile } from '../safe-fs';

/** Check ordering timing. */
export function checkOrderingTiming(config: PulseConfig): Break[] {
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
    const lines = content.split('\n');

    // CHECK 1: Webhook handlers process events without checking timestamp/sequence
    const looksLikeWebhookFile =
      /webhook/i.test(file) || /WebhookController|WebhookService/i.test(content);
    const looksLikeWebhookHelper = /(util|utils|helper|helpers|classifier)\.ts$/i.test(file);
    const handlesInboundWebhookEvents =
      /@(?:Post|Patch|All)\(|handle[A-Za-z]+Webhook|process[A-Za-z]+Webhook|req\.(body|headers)|signature|event/i.test(
        content,
      );
    const mutatesWebhookState =
      /prisma\.[a-z]+\.(create|update|upsert|delete)|status\s*=|ledger|payment|refund|charge|withdraw|transaction/i.test(
        content,
      );

    if (
      looksLikeWebhookFile &&
      !looksLikeWebhookHelper &&
      handlesInboundWebhookEvents &&
      mutatesWebhookState
    ) {
      const hasTimestampCheck =
        /event\.timestamp|createdAt|occurredAt|eventDate|sequence|order/i.test(content);
      const hasAlreadyProcessed =
        /alreadyProcessed|isDuplicate|externalId.*unique|webhookEvent/i.test(content);

      if (!hasTimestampCheck && !hasAlreadyProcessed) {
        breaks.push({
          type: 'ORDERING_WEBHOOK_OOO',
          severity: 'high',
          file: relFile,
          line: 0,
          description:
            'Webhook handler does not check event timestamp or sequence — out-of-order events cause incorrect state',
          detail:
            'Check event.dateCreated/timestamp before applying; reject events older than current entity state',
        });
      }
    }

    // CHECK 2: JWT validation with zero clock skew
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      if (/verify\s*\(|JwtService|jsonwebtoken/i.test(line)) {
        // Look at surrounding context for clockTolerance / clockSkew
        const context = lines.slice(Math.max(0, i - 3), i + 5).join('\n');
        if (!/clockTolerance|clockSkew|leeway|allowedClockSkew/i.test(context)) {
          breaks.push({
            type: 'CLOCK_SKEW_TOO_STRICT',
            severity: 'medium',
            file: relFile,
            line: i + 1,
            description:
              'JWT verification without clock skew tolerance — users may be spuriously logged out',
            detail:
              'Add clockTolerance: 30 to jwt.verify() options to handle clock drift between servers',
          });
          break; // One report per file
        }
      }
    }

    // CHECK 3: Local timezone in financial date operations
    const localTzPatterns = [
      /new Date\(\)\.toLocaleDateString|new Date\(\)\.toLocaleString/,
      /new Date\(\)\.getHours\(\)|new Date\(\)\.getDate\(\)/,
      /moment\(\)\.local\(\)|dayjs\(\)\.local\(\)/,
      /Intl\.DateTimeFormat(?!.*timeZone)/,
    ];

    if (/checkout|wallet|billing|payment|report|analytics/i.test(file)) {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith('//') || line.startsWith('*')) {
          continue;
        }

        if (localTzPatterns.some((re) => re.test(line))) {
          breaks.push({
            type: 'TIMEZONE_REPORT_MISMATCH',
            severity: 'high',
            file: relFile,
            line: i + 1,
            description:
              'Local timezone used in financial/report date operation — data inconsistency across server timezones',
            detail: `${line.slice(0, 120)} — use UTC explicitly: new Date().toISOString() or dayjs.utc()`,
          });
        }
      }

      // Verify UTC storage intent
      const storesDate = /createdAt|updatedAt|paidAt|refundedAt|\.date\s*=/i.test(content);
      const usesUTC = /\.toISOString\(\)|UTC|dayjs\.utc\(\)|moment\.utc\(\)/i.test(content);
      if (storesDate && !usesUTC) {
        breaks.push({
          type: 'TIMEZONE_REPORT_MISMATCH',
          severity: 'high',
          file: relFile,
          line: 0,
          description:
            'Financial file stores dates without explicit UTC — reports will differ by server timezone',
          detail:
            'Ensure all date storage uses toISOString() or dayjs.utc(); display layer converts to user TZ',
        });
      }
    }

    // CHECK 5: Cron job UTC awareness
    if (/cron|schedule/i.test(file)) {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        // Cron expression that might be confused as local time
        if (/Cron\s*\(\s*['"`]\d+\s+\d+/i.test(line) && !/UTC|utc|timezone/i.test(line)) {
          breaks.push({
            type: 'TIMEZONE_REPORT_MISMATCH',
            severity: 'high',
            file: relFile,
            line: i + 1,
            description:
              'Cron expression without explicit timezone — will run in server local time, not UTC',
            detail:
              line.slice(0, 120) +
              " — document or configure timezone explicitly (e.g., cronOptions: { timeZone: 'UTC' })",
          });
        }
      }
    }

    // CHECK 6: Date range off-by-one (> vs >=)
    if (/report|analytics|dashboard/i.test(file)) {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (/gte.*startDate|lte.*endDate|createdAt.*gt\s/i.test(line)) {
          // gt instead of gte is potentially off-by-one for date ranges
          if (/createdAt.*:\s*\{\s*gt\s*:/i.test(line) && !/gte/.test(line)) {
            breaks.push({
              type: 'ORDERING_WEBHOOK_OOO',
              severity: 'high',
              file: relFile,
              line: i + 1,
              description:
                'Date range query uses `gt` (strictly greater) — records at exact boundary excluded',
              detail: `${line.slice(0, 120)} — use \`gte\` (greater than or equal) for inclusive date ranges`,
            });
          }
        }
      }
    }
  }

  // Frontend: SWR stale financial data
  const frontendFiles = walkFiles(config.frontendDir, ['.ts', '.tsx']);
  for (const file of frontendFiles) {
    if (!/checkout|wallet|billing|payment/i.test(file)) {
      continue;
    }
    if (/node_modules|\.next/.test(file)) {
      continue;
    }

    let content: string;
    try {
      content = readTextFile(file, 'utf8');
    } catch {
      continue;
    }

    const relFile = path.relative(config.rootDir, file);

    // SWR with very long revalidateOnFocus=false and no revalidateInterval
    if (/useSWR/.test(content)) {
      const hasStaleConfig =
        /revalidateOnFocus\s*:\s*false/.test(content) &&
        !/refreshInterval|revalidateOnMount\s*:\s*true/.test(content);
      if (hasStaleConfig) {
        breaks.push({
          type: 'ORDERING_WEBHOOK_OOO',
          severity: 'high',
          file: relFile,
          line: 0,
          description:
            'SWR in financial page has revalidateOnFocus: false without refreshInterval — user sees stale balance',
          detail:
            'Add refreshInterval: 30000 or use mutate() after write operations to keep financial data fresh',
        });
      }
    }
  }

  // TODO: Implement when infrastructure available
  // - Runtime out-of-order webhook delivery simulation
  // - NTP sync validation on server
  // - DST boundary test (twice-a-year risk)

  return breaks;
}
