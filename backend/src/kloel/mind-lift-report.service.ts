import { Injectable } from '@nestjs/common';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { DecisionOutcomeService } from './decision-outcome.service';

// Lift reports land in `<repoRoot>/artifacts/mind-reports/<date>.md`.
// The backend may boot from `backend/` (dev), repo root (CI), or `/app`
// (Docker). Resolve robustly without assuming cwd, allowing an explicit
// `MIND_REPORTS_DIR` override for tests and prod overrides.
function resolveReportsDir(): string {
  const override = process.env.MIND_REPORTS_DIR?.trim();
  if (override) return resolve(override);
  // Prefer `<cwd>/artifacts/mind-reports` if it exists (repo-root invocation),
  // otherwise fall back to `<cwd>/../artifacts/mind-reports` (backend cwd).
  const direct = resolve(process.cwd(), 'artifacts', 'mind-reports');
  const parent = resolve(process.cwd(), '..', 'artifacts', 'mind-reports');
  return parent.includes('/whatsapp_saas/artifacts/') ? parent : direct;
}

const OUTCOME_WEIGHTS: Record<string, number> = {
  'inbound.received': 0.5,
  'payment.succeeded': 1.0,
  'checkout.abandoned': -0.3,
  'coupon.redeemed': 0.7,
  'conversation.handed_off': 0.6,
  'contact.opted_out': -1.0,
  'payment.refunded': -0.5,
  'subscription.canceled': -0.8,
  'inbound.silent_24h': -0.1,
};

interface OutcomeRow {
  outcomeName: string | null;
  wonVsBaseline: boolean | null;
  outcomeValue: unknown;
  chosenAction: string | null;
  baselineAction: string | null;
}

export interface FailureReasonCount {
  reason: string;
  chosenAction: string;
  baselineAction: string;
  count: number;
  totalOutcomeKeys: number;
}

interface LiftRow {
  decisionType: string;
  channel: string;
  total: number;
  closed: number;
  successCount: number;
  successRate: number;
  lowerCI: number;
  upperCI: number;
  wonCount: number;
  wonRate: number;
  failureReasonCounts: FailureReasonCount[];
}

export interface LiftReport {
  generatedAt: string;
  sinceDays: number;
  rows: LiftRow[];
}

function wilsonInterval(successes: number, trials: number, z = 1.96): { lower: number; upper: number } {
  if (trials === 0) return { lower: 0, upper: 0 };
  const p = successes / trials;
  const denominator = 1 + (z * z) / trials;
  const centre = (p + (z * z) / (2 * trials)) / denominator;
  const margin = (z / denominator) * Math.sqrt((p * (1 - p)) / trials + (z * z) / (4 * trials * trials));
  return {
    lower: Math.max(0, centre - margin),
    upper: Math.min(1, centre + margin),
  };
}

function extractChannel(contextSnapshot: unknown): string {
  if (contextSnapshot && typeof contextSnapshot === 'object' && !Array.isArray(contextSnapshot)) {
    const ctx = contextSnapshot as Record<string, unknown>;
    return String(ctx.channel ?? ctx.source ?? 'unknown');
  }
  return 'unknown';
}

function isSingleSuccess(outcome: OutcomeRow): boolean {
  const weight = outcome.outcomeName ? (OUTCOME_WEIGHTS[outcome.outcomeName] ?? 0) : 0;
  return weight >= 0.3;
}

function normalizeFailureReason(reason: string): string {
  const trimmed = reason.trim();
  if (/^[A-Za-z0-9_.-]{1,80}$/.test(trimmed)) return trimmed;
  return 'unclassified_reason';
}

function normalizeReportLabel(label: string | null | undefined, fallback: string): string {
  if (!label) return fallback;
  const trimmed = label.trim();
  if (/^[A-Za-z0-9_.-]{1,80}$/.test(trimmed)) return trimmed;
  return fallback;
}

function extractFailureReason(
  outcomeValue: unknown,
): { reason: string; outcomeKeysCount: number } | null {
  if (!outcomeValue || typeof outcomeValue !== 'object' || Array.isArray(outcomeValue)) return null;
  const ov = outcomeValue as Record<string, unknown>;
  if (typeof ov.reason !== 'string' || ov.reason.length === 0) return null;
  const keys = ov.outcomeKeys;
  const outcomeKeysCount = Array.isArray(keys) ? keys.length : 0;
  return { reason: normalizeFailureReason(ov.reason), outcomeKeysCount };
}

function buildFailureReasonCounts(outcomes: OutcomeRow[]): FailureReasonCount[] {
  const map = new Map<
    string,
    {
      reason: string;
      chosenAction: string;
      baselineAction: string;
      count: number;
      outcomeKeysTotal: number;
    }
  >();
  for (const o of outcomes) {
    const extracted = extractFailureReason(o.outcomeValue);
    if (!extracted) continue;
    const chosenAction = normalizeReportLabel(o.chosenAction, 'unknown_action');
    const baselineAction = normalizeReportLabel(o.baselineAction, 'unknown_baseline');
    const key = JSON.stringify([extracted.reason, chosenAction, baselineAction]);
    const entry = map.get(key) ?? {
      reason: extracted.reason,
      chosenAction,
      baselineAction,
      count: 0,
      outcomeKeysTotal: 0,
    };
    entry.count += 1;
    entry.outcomeKeysTotal += extracted.outcomeKeysCount;
    map.set(key, entry);
  }
  return Array.from(map.values()).map(
    ({ reason, chosenAction, baselineAction, count, outcomeKeysTotal }) => ({
      reason,
      chosenAction,
      baselineAction,
      count,
      totalOutcomeKeys: outcomeKeysTotal,
    }),
  );
}

@Injectable()
export class MindLiftReportService {
  constructor(private readonly decisionOutcome: DecisionOutcomeService) {}

  async aggregate(sinceDays = 14): Promise<LiftReport> {
    const since = new Date(Date.now() - sinceDays * 86400 * 1000);
    const rows = await this.decisionOutcome.findAllClosedSince(since);

    const grouped = new Map<string, OutcomeRow[]>();

    for (const row of rows) {
      const channel = extractChannel(row.contextSnapshot);
      const key = `${row.decisionType}:${channel}`;
      const entry = grouped.get(key) ?? [];
      entry.push({
        outcomeName: row.outcomeName ?? null,
        wonVsBaseline: row.wonVsBaseline ?? null,
        outcomeValue: row.outcomeValue ?? null,
        chosenAction: row.chosenAction ?? null,
        baselineAction: row.baselineAction ?? null,
      });
      grouped.set(key, entry);
    }

    const liftRows: LiftRow[] = [];

    for (const [key, outcomes] of grouped.entries()) {
      const parts = key.split(':');
      const decisionType = parts[0] ?? 'unknown';
      const channel = parts[1] ?? 'unknown';
      const total = outcomes.length;
      const closed = outcomes.filter((o) => o.outcomeName !== null).length;
      const successCount = outcomes.filter(isSingleSuccess).length;
      const successRate = total > 0 ? successCount / total : 0;
      const ci = wilsonInterval(successCount, total);
      const wonCount = outcomes.filter((o) => o.wonVsBaseline === true).length;
      const wonRate = total > 0 ? wonCount / total : 0;

      const failureReasonCounts = buildFailureReasonCounts(outcomes);

      liftRows.push({
        decisionType,
        channel,
        total,
        closed,
        successCount,
        successRate,
        lowerCI: ci.lower,
        upperCI: ci.upper,
        wonCount,
        wonRate,
        failureReasonCounts,
      });
    }

    liftRows.sort((a, b) => b.successRate - a.successRate);

    return {
      generatedAt: new Date().toISOString(),
      sinceDays,
      rows: liftRows,
    };
  }

  async generateMarkdownReport(sinceDays = 14): Promise<string> {
    const report = await this.aggregate(sinceDays);
    const lines: string[] = [];

    lines.push('# MIND Lift Report');
    lines.push('');
    lines.push(`Generated: ${report.generatedAt}`);
    lines.push(`Window: ${report.sinceDays} days`);
    lines.push(`Total decision-channel pairs: ${report.rows.length}`);
    lines.push('');

    lines.push('| Decision Type | Channel | Total | Closed | Success Rate | 95% CI | Won vs Baseline |');
    lines.push('|---------------|---------|-------|--------|-------------|--------|----------------|');

    for (const row of report.rows) {
      const ciStr = `${(row.lowerCI * 100).toFixed(1)}%-${(row.upperCI * 100).toFixed(1)}%`;
      lines.push(
        `| ${row.decisionType} | ${row.channel} | ${row.total} | ${row.closed} | ${(row.successRate * 100).toFixed(1)}% | ${ciStr} | ${(row.wonRate * 100).toFixed(1)}% |`,
      );
    }

    const rowsWithFailures = report.rows.filter((r) => r.failureReasonCounts.length > 0);
    if (rowsWithFailures.length > 0) {
      lines.push('');
      lines.push('## Failure Reason Summary');
      lines.push('');
      lines.push('| Decision Type | Channel | Chosen Action | Baseline Action | Reason | Count | Outcome Keys Total |');
      lines.push('|---------------|---------|---------------|-----------------|--------|-------|-------------------|');

      for (const row of rowsWithFailures) {
        for (const fr of row.failureReasonCounts) {
          lines.push(
            `| ${row.decisionType} | ${row.channel} | ${fr.chosenAction} | ${fr.baselineAction} | ${fr.reason} | ${fr.count} | ${fr.totalOutcomeKeys} |`,
          );
        }
      }
    }

    const markdown = lines.join('\n');
    const date = new Date().toISOString().split('T')[0];
    const filepath = join(resolveReportsDir(), `${date}.md`);

    // Ensure the parent dir exists. Without this the first run on a fresh
    // checkout (or any environment where the `.gitkeep` was deleted) would
    // throw ENOENT silently. mkdir { recursive: true } is idempotent.
    await mkdir(dirname(filepath), { recursive: true });
    await writeFile(filepath, markdown, 'utf-8');

    return markdown;
  }

  async generateJsonReport(sinceDays = 14): Promise<LiftReport> {
    return this.aggregate(sinceDays);
  }
}
