import { InjectRedis } from '@nestjs-modules/ioredis';
import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import type Redis from 'ioredis';

/**
 * LLMBudgetService — per-workspace LLM cost enforcement (P6-7, I16).
 *
 * ## The problem Wave 2 found
 *
 * Before this service, every LLM call site in the backend and worker was
 * responsible for its own budget check. The `openai-wrapper.ts` explicitly
 * documents this in a comment:
 *
 *     // tokenBudget: callers must ensure budget check before invoking wrapper
 *
 * None of the ~15 actual call sites implement any check. A single buggy
 * caller (infinite loop, stuck retry, recursive prompt assembly) can burn
 * through a workspace's budget — or the platform's — in minutes. There
 * is no visibility into which workspace spent what, no enforcement, and
 * no alert when a workspace exceeds its tier.
 *
 * ## What this service enforces
 *
 * Invariant I16 — **LLM Budget Fail-Closed**: a workspace exceeding its
 * per-window cost budget has subsequent LLM calls rejected with a
 * structured `ForbiddenException({ code: 'llm_budget_exceeded' })` BEFORE
 * any request reaches the provider.
 *
 * ## Scoping
 *
 * The rolling window is a calendar month in UTC (`llm:budget:{ws}:YYYYMM`).
 * Spend is accumulated in cents via atomic `INCRBY`, and the budget is
 * read per-workspace from the configured default (env var). Per-workspace
 * overrides via `Workspace.llmBudgetCents` (or similar) are a follow-up —
 * this PR ships the enforcement mechanism and a global default.
 *
 * ## Fail-closed semantics
 *
 * - If Redis is unavailable, `assertBudget` throws `ForbiddenException`
 *   (code: 'llm_budget_check_unavailable') instead of degrading to
 *   "allow through" — fail-closed. A workspace without a working budget
 *   check must not call the provider.
 * - If no default is configured, a safe ceiling is used (R$ 100.00 / month).
 *   Operators raise the default via `LLM_BUDGET_DEFAULT_CENTS` when
 *   onboarding production traffic.
 */
@Injectable()
export class LLMBudgetService {
  private readonly logger = new Logger(LLMBudgetService.name);

  constructor(@InjectRedis() private readonly redis: Redis) {}

  /**
   * Assert that the workspace can afford `estimatedCostCents`. Throws
   * `ForbiddenException({ code: 'llm_budget_exceeded' })` when the
   * current window's spend + the estimate would exceed the budget.
   *
   * Call this BEFORE hitting the LLM provider. Pair with `recordSpend`
   * after the provider returns.
   */
  async assertBudget(workspaceId: string, estimatedCostCents: number): Promise<void> {
    if (!Number.isFinite(estimatedCostCents) || estimatedCostCents < 0) {
      throw new Error(`Invalid LLM cost estimate: ${estimatedCostCents}`);
    }

    const key = this.currentWindowKey(workspaceId);
    const budget = this.getWorkspaceBudgetCents();

    let spent = 0;
    try {
      const raw = await this.redis.get(key);
      spent = raw ? Number(raw) : 0;
      if (!Number.isFinite(spent)) {
        spent = 0;
      }
    } catch (err: unknown) {
      this.logger.error(
        `LLM budget check failed for ws=${workspaceId}: ${err instanceof Error ? err.message : 'unknown_error'}. Failing closed.`,
      );
      throw new ForbiddenException({
        code: 'llm_budget_check_unavailable',
        message: 'Budget enforcement temporarily unavailable. Retry later.',
      });
    }

    if (spent + estimatedCostCents > budget) {
      this.logger.warn(
        `llm_budget_exceeded ws=${workspaceId} spent=${spent} requested=${estimatedCostCents} budget=${budget}`,
      );
      throw new ForbiddenException({
        code: 'llm_budget_exceeded',
        message:
          'LLM cost budget exceeded for this workspace this month. ' +
          'Contact support to raise the limit.',
        meta: { spent, requested: estimatedCostCents, budget },
      });
    }

    this.budgetAlert(workspaceId, spent, estimatedCostCents, budget);
  }

  /**
   * Record actual cost after a successful LLM call. Idempotent against
   * Redis failure (logs and returns) — this is the only place in the
   * flow where we degrade gracefully, because failing to record does
   * not violate I16 (the next assertBudget will just see a slightly
   * stale total).
   */
  async recordSpend(workspaceId: string, actualCostCents: number): Promise<void> {
    if (!Number.isFinite(actualCostCents) || actualCostCents < 0) {
      return;
    }
    const key = this.currentWindowKey(workspaceId);
    try {
      await this.redis.incrby(key, Math.round(actualCostCents));
      // 35 days = generous ceiling over 1-month rolling window
      await this.redis.expire(key, 60 * 60 * 24 * 35);
    } catch (err: unknown) {
      this.logger.warn(
        `LLM budget recordSpend failed for ws=${workspaceId}: ${err instanceof Error ? err.message : 'unknown_error'}`,
      );
    }
  }

  /**
   * Read the current window's spend (for observability / admin dashboards).
   */
  async getCurrentSpendCents(workspaceId: string): Promise<number> {
    try {
      const raw = await this.redis.get(this.currentWindowKey(workspaceId));
      const n = raw ? Number(raw) : 0;
      return Number.isFinite(n) ? n : 0;
    } catch {
      return 0;
    }
  }

  private budgetAlert(
    workspaceId: string,
    spentCents: number,
    requestedCents: number,
    budgetCents: number,
  ): void {
    const projectedCents = spentCents + requestedCents;
    const ratio = budgetCents > 0 ? projectedCents / budgetCents : 1;
    if (ratio < 0.8) {
      return;
    }

    const threshold = ratio >= 0.95 ? '95%' : '80%';
    this.logger.warn(
      `llm_budget_approaching_limit ws=${workspaceId} threshold=${threshold} spent=${spentCents} requested=${requestedCents} projected=${projectedCents} budget=${budgetCents}`,
    );
  }

  private currentWindowKey(workspaceId: string): string {
    const now = new Date();
    const yyyymm = now.getUTCFullYear().toString() + String(now.getUTCMonth() + 1).padStart(2, '0');
    return `llm:budget:${workspaceId}:${yyyymm}`;
  }

  private getWorkspaceBudgetCents(): number {
    const raw = process.env.LLM_BUDGET_DEFAULT_CENTS;
    if (raw) {
      const parsed = Number(raw);
      if (Number.isFinite(parsed) && parsed > 0) {
        return Math.round(parsed);
      }
    }
    // Safe default: R$ 100.00 / month (= 10000 cents). Operators should
    // configure `LLM_BUDGET_DEFAULT_CENTS` explicitly for real workloads.
    return 10_000;
  }
}

/**
 * Rough pre-flight cost estimator for chat completions. The real cost
 * depends on provider tokenization, model tier, and output length, so
 * this is intentionally pessimistic (i.e. the estimate is an upper
 * bound on what the request COULD cost, not an average).
 *
 * For precise billing, use the provider's `usage` response field after
 * the call and pass it to `recordSpend` for accurate accumulation.
 */
export function estimateChatCostCents(params: {
  inputChars: number;
  maxOutputTokens: number;
  /** Cents per 1,000 input tokens. Defaults to GPT-4.1 mini rate. */
  inputRateCentsPer1k?: number;
  /** Cents per 1,000 output tokens. Defaults to GPT-4.1 mini rate. */
  outputRateCentsPer1k?: number;
}): number {
  // Rough "1 token ≈ 4 chars" heuristic for English-ish text.
  const inputTokens = Math.ceil(params.inputChars / 4);
  const outputTokens = Math.max(params.maxOutputTokens, 0);
  const inRate = params.inputRateCentsPer1k ?? 15; // $0.15 / 1M tokens ≈ 15 cents / 1k
  const outRate = params.outputRateCentsPer1k ?? 60; // $0.60 / 1M tokens ≈ 60 cents / 1k
  return Math.ceil((inputTokens * inRate) / 1000 + (outputTokens * outRate) / 1000);
}
