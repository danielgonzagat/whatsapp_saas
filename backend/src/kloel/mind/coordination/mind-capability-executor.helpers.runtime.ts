/**
 * Runtime-introspection helpers extracted from `mind-capability-executor.service.ts`.
 * Each function is side-effect-free so impure reads (process metrics, env vars,
 * HTTP responses) happen at the call-site and the projections stay unit-testable
 * with plain inputs.
 */

/**
 * Self-runtime snapshot fields surfaced by `inspectRuntime`. Only safe,
 * secret-free Node.js process metrics are captured.
 */
export interface SelfRuntimeSnapshot {
  nodeVersion: string;
  uptimeSeconds: number;
  rssMb: number;
  heapUsedMb: number;
  env: string;
}

/**
 * Build the self-runtime snapshot from raw Node.js `process` metrics. The
 * memory values are rounded to whole megabytes; uptime is rounded to whole
 * seconds. Side-effect-free: all impure reads happen at the call-site so this
 * helper can be unit-tested with plain inputs.
 */
export function buildSelfRuntimeSnapshot(input: {
  memoryUsage: { rss: number; heapUsed: number };
  nodeVersion: string;
  uptimeSeconds: number;
  nodeEnv: string | undefined;
}): SelfRuntimeSnapshot {
  return {
    nodeVersion: input.nodeVersion,
    uptimeSeconds: Math.round(input.uptimeSeconds),
    rssMb: Math.round(input.memoryUsage.rss / 1048576),
    heapUsedMb: Math.round(input.memoryUsage.heapUsed / 1048576),
    env: input.nodeEnv ?? 'unknown',
  };
}

/**
 * Railway deploy-status configuration resolved from the environment. Returns
 * `null` when any required env var is missing — callers should emit the
 * canonical `{ configured: false }` payload in that case.
 */
export interface RailwayRuntimeConfig {
  token: string;
  projectId: string;
  envId: string;
  serviceId: string;
}

/**
 * Resolve the Railway deploy-status configuration from a plain env-like record
 * (typically `process.env`). Returns `null` if any required field is missing
 * or empty, matching the existing `inspectRuntime` contract.
 */
export function getRailwayRuntimeConfig(
  env: Readonly<Record<string, string | undefined>>,
): RailwayRuntimeConfig | null {
  const token = env.RAILWAY_TOKEN;
  const projectId = env.RAILWAY_PROJECT_ID;
  const envId = env.RAILWAY_ENV_ID;
  const serviceId = env.RAILWAY_BACKEND_SERVICE_ID;
  if (!token || !projectId || !envId || !serviceId) {
    return null;
  }
  return { token, projectId, envId, serviceId };
}

/**
 * Build the GraphQL request body that fetches the latest Railway deployment
 * for the configured project/environment/service.
 */
export function buildRailwayDeploymentsQuery(input: {
  projectId: string;
  envId: string;
  serviceId: string;
}): { query: string } {
  return {
    query: `query{deployments(first:1,input:{projectId:"${input.projectId}",environmentId:"${input.envId}",serviceId:"${input.serviceId}"}){edges{node{status createdAt}}}}`,
  };
}

/**
 * Parse the Railway GraphQL response into the canonical `inspectRuntime`
 * shape. Always returns a record with `configured: true`. An unknown response
 * resolves to `status: 'unknown'`; a populated edge surfaces `status` and
 * `createdAt` from the API.
 */
export function parseRailwayDeploymentResponse(json: unknown): Record<string, unknown> {
  const typed = json as
    | {
        data?: { deployments?: { edges?: Array<{ node?: Record<string, unknown> }> } };
      }
    | null
    | undefined;
  const node = typed?.data?.deployments?.edges?.[0]?.node;
  if (!node) {
    return { configured: true, status: 'unknown' };
  }
  return { configured: true, status: node.status, createdAt: node.createdAt };
}

/**
 * Vercel deploy-status configuration resolved from the environment. `teamId`
 * is optional — when present it is appended to the deployments query.
 */
export interface VercelRuntimeConfig {
  token: string;
  projectId: string;
  teamId?: string;
}

/**
 * Resolve the Vercel deploy-status configuration from a plain env-like record.
 * Returns `null` when `VERCEL_TOKEN` or `VERCEL_PROJECT_ID` is missing.
 */
export function getVercelRuntimeConfig(
  env: Readonly<Record<string, string | undefined>>,
): VercelRuntimeConfig | null {
  const token = env.VERCEL_TOKEN;
  const projectId = env.VERCEL_PROJECT_ID;
  if (!token || !projectId) {
    return null;
  }
  const teamId = env.VERCEL_TEAM_ID;
  return teamId ? { token, projectId, teamId } : { token, projectId };
}

/**
 * Build the Vercel REST URL that fetches the latest production deployment for
 * the configured project. Appends `&teamId=...` when a team scope is provided.
 */
export function buildVercelDeploymentsUrl(input: { projectId: string; teamId?: string }): string {
  const teamQ = input.teamId ? `&teamId=${input.teamId}` : '';
  return `https://api.vercel.com/v6/deployments?projectId=${input.projectId}&target=production&limit=1${teamQ}`;
}

/**
 * Parse a Vercel deployments response into the canonical `inspectRuntime`
 * shape. Returns `{ configured: true, state: 'unknown' }` when no deployment
 * is present; otherwise surfaces the deployment's `state` and `createdAt`.
 * Note: Vercel uses `created` (not `createdAt`) on the deployment object —
 * we preserve that key under the `createdAt` alias for consistency with the
 * Railway shape used by callers.
 */
export function parseVercelDeploymentResponse(json: unknown): Record<string, unknown> {
  const typed = json as { deployments?: Array<Record<string, unknown>> } | null | undefined;
  const deployment = typed?.deployments?.[0];
  if (!deployment) {
    return { configured: true, state: 'unknown' };
  }
  return { configured: true, state: deployment.state, createdAt: deployment.created };
}

/**
 * Extract a safe, secret-free error message from an `unknown` thrown value.
 * Falls back to the provided default when the value is not an `Error`.
 */
export function runtimeErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
