/**
 * URL/runtime predicates used by Redis URL resolution.
 *
 * Extracted from resolve-redis-url.ts so each predicate is measured on its
 * own by complexity scanners (Codacy / lizard bundles neighbouring TS
 * functions together and reports an inflated CCN for the first name).
 *
 * Pure: no side effects beyond reading process.env.
 */
export function isLocalhost(url: string): boolean {
  return url.includes('localhost') || url.includes('127.0.0.1');
}

/** Is railway public proxy. */
export function isRailwayPublicProxy(url: string): boolean {
  return url.includes('mainline.proxy.rlwy.net') || url.includes('.proxy.rlwy.net');
}

/** Is railway runtime. */
export function isRailwayRuntime(): boolean {
  return [
    process.env.RAILWAY_PROJECT_ID,
    process.env.RAILWAY_ENVIRONMENT_ID,
    process.env.RAILWAY_SERVICE_ID,
    process.env.RAILWAY_DEPLOYMENT_ID,
  ].some((value) => typeof value === 'string' && value.trim().length > 0);
}

/** Is production like runtime. */
export function isProductionLikeRuntime(): boolean {
  return process.env.NODE_ENV === 'production' || isRailwayRuntime();
}
