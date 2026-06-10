/**
 * Canonical Prisma datasource URL construction for the worker runtime.
 *
 * Prisma's default pool size is `num_physical_cpus * 2 + 1` PER CLIENT INSTANCE.
 * On shared hosts (Railway) the container sees the host's CPU count, so a single
 * unbounded client can claim dozens of Postgres connections and exhaust
 * `max_connections` ("FATAL: sorry, too many clients already" — issue #413).
 *
 * This module is the ONE place where the worker applies `connection_limit` and
 * `pool_timeout` to the datasource URL. Tunable via env:
 *   - PRISMA_CONNECTION_LIMIT (default 10 connections)
 *   - PRISMA_POOL_TIMEOUT    (default 20 seconds)
 *
 * Params already present in DATABASE_URL always win (never overridden here).
 */

export const DEFAULT_PRISMA_CONNECTION_LIMIT = 10;
export const DEFAULT_PRISMA_POOL_TIMEOUT_SECONDS = 20;

const POSTGRES_SCHEME_PATTERN = /^postgres(ql)?:\/\//i;

function parsePositiveInteger(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    return fallback;
  }
  return value;
}

function hasQueryParam(url: string, param: string): boolean {
  const queryIndex = url.indexOf('?');
  if (queryIndex === -1) {
    return false;
  }
  const query = url.slice(queryIndex + 1);
  return new RegExp(`(^|&)${param}=`).test(query);
}

/**
 * Appends `connection_limit` and `pool_timeout` to a Postgres datasource URL.
 *
 * - Returns `undefined` when the URL is missing/empty (caller falls back to
 *   Prisma's own env resolution, preserving previous behavior).
 * - Leaves non-Postgres URLs (e.g. `prisma://` Accelerate) untouched — pool
 *   params only apply to direct Postgres connections.
 * - Respects params already present in the URL.
 */
export function buildPrismaDatasourceUrl(
  rawUrl: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  if (!rawUrl || rawUrl.trim() === '') {
    return undefined;
  }
  if (!POSTGRES_SCHEME_PATTERN.test(rawUrl)) {
    return rawUrl;
  }

  const connectionLimit = parsePositiveInteger(
    env.PRISMA_CONNECTION_LIMIT,
    DEFAULT_PRISMA_CONNECTION_LIMIT,
  );
  const poolTimeout = parsePositiveInteger(
    env.PRISMA_POOL_TIMEOUT,
    DEFAULT_PRISMA_POOL_TIMEOUT_SECONDS,
  );

  const additions: string[] = [];
  if (!hasQueryParam(rawUrl, 'connection_limit')) {
    additions.push(`connection_limit=${connectionLimit}`);
  }
  if (!hasQueryParam(rawUrl, 'pool_timeout')) {
    additions.push(`pool_timeout=${poolTimeout}`);
  }
  if (additions.length === 0) {
    return rawUrl;
  }

  const separator = rawUrl.includes('?') ? '&' : '?';
  return `${rawUrl}${separator}${additions.join('&')}`;
}

/**
 * PrismaClient constructor options carrying the pooled datasource URL.
 * Empty object when DATABASE_URL is unset (Prisma resolves env itself).
 */
export function buildPrismaClientOptions(
  env: NodeJS.ProcessEnv = process.env,
): { datasourceUrl?: string } {
  const url = buildPrismaDatasourceUrl(env.DATABASE_URL, env);
  return url === undefined ? {} : { datasourceUrl: url };
}
