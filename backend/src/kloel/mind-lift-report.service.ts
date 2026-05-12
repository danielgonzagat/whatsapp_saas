import { Injectable } from '@nestjs/common';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DecisionOutcomeService } from './decision-outcome.service';

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

    const markdown = lines.join('\n');
    const date = new Date().toISOString().split('T')[0];
    const filepath = join(process.cwd(), '..', 'artifacts', 'mind-reports', `${date}.md`);

    await writeFile(filepath, markdown, 'utf-8');

    return markdown;
  }

  async generateJsonReport(sinceDays = 14): Promise<LiftReport> {
    return this.aggregate(sinceDays);
  }
}
