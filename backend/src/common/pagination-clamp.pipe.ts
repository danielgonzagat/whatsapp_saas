import { ArgumentMetadata, Injectable, PipeTransform } from '@nestjs/common';

/**
 * PaginationClamp — centralised take/limit/page guardrails (P6-8, I17).
 *
 * Why a pipe? Because every controller that exposes a client-supplied
 * `limit`/`take`/`page` query is a potential unbounded-query source. The
 * audit that drove Wave 2 found 16 list endpoints each with its own
 * hand-rolled clamp logic (some clamp, some don't, some use wrong bounds).
 * Centralising the clamp removes the class of bugs instead of fixing
 * instances.
 *
 * ## Usage
 *
 * Apply at the controller parameter:
 *
 *     @Get('transactions')
 *     list(
 *       @Query('limit', new PaginationLimitPipe()) limit: number,
 *       @Query('page', new PaginationPagePipe()) page: number,
 *     ) { ... }
 *
 * Or with custom bounds:
 *
 *     @Query('limit', new PaginationLimitPipe({ max: 50, default: 10 })) limit: number
 *
 * Or use the utility helper in a service when the controller can't own
 * the decorator (e.g. composite filters):
 *
 *     const take = clampLimit(req.query.limit);
 *
 * ## Guarantees
 *
 * - Returned value is ALWAYS a finite integer within [min, max].
 * - Undefined, null, empty string, NaN, negative, or non-numeric input
 *   falls back to the `default`.
 * - Inputs above `max` are clamped DOWN to `max` (not rejected).
 * - Inputs below `min` are clamped UP to `min`.
 */

export interface ClampOptions {
  /** Minimum allowed value. Defaults to 1. */
  min?: number;
  /** Maximum allowed value. Defaults to 100 — the I17 ceiling. */
  max?: number;
  /** Value to use when the caller did not supply one. Defaults to 20. */
  default?: number;
}

const DEFAULT_LIMIT_OPTS: Required<ClampOptions> = {
  min: 1,
  max: 100,
  default: 20,
};

const DEFAULT_PAGE_OPTS: Required<ClampOptions> = {
  min: 1,
  max: 10_000,
  default: 1,
};

function clamp(raw: unknown, opts: Required<ClampOptions>): number {
  if (raw === undefined || raw === null || raw === '') return opts.default;
  const parsed = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(parsed)) return opts.default;
  // Floor so "100.9" → 100, never "101".
  const integer = Math.floor(parsed);
  if (integer < opts.min) return opts.min;
  if (integer > opts.max) return opts.max;
  return integer;
}

/**
 * Standalone helper for services/controllers that cannot use the decorator
 * form (e.g. when the raw value is read from `req.query` directly, or when
 * the controller accepts an object of filters).
 */
export function clampLimit(raw: unknown, options?: ClampOptions): number {
  return clamp(raw, { ...DEFAULT_LIMIT_OPTS, ...(options ?? {}) });
}

export function clampPage(raw: unknown, options?: ClampOptions): number {
  return clamp(raw, { ...DEFAULT_PAGE_OPTS, ...(options ?? {}) });
}

/**
 * Pipe form for `take` / `limit` query params. Accepts the same
 * `ClampOptions` to override bounds for a specific endpoint.
 */
@Injectable()
export class PaginationLimitPipe implements PipeTransform<unknown, number> {
  private readonly options: Required<ClampOptions>;

  constructor(options: ClampOptions = {}) {
    this.options = { ...DEFAULT_LIMIT_OPTS, ...options };
  }

  transform(value: unknown, _metadata: ArgumentMetadata): number {
    return clamp(value, this.options);
  }
}

/**
 * Pipe form for `page` query params.
 */
@Injectable()
export class PaginationPagePipe implements PipeTransform<unknown, number> {
  private readonly options: Required<ClampOptions>;

  constructor(options: ClampOptions = {}) {
    this.options = { ...DEFAULT_PAGE_OPTS, ...options };
  }

  transform(value: unknown, _metadata: ArgumentMetadata): number {
    return clamp(value, this.options);
  }
}
