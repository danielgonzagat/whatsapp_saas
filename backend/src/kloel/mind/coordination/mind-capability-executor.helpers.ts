/**
 * Pure helpers extracted from `mind-capability-executor.service.ts` so the
 * service stays focused on Prisma/event orchestration. Anything that touches
 * Prisma, the event spine, or NestJS DI stays in the service; only
 * side-effect-free parsing/derivation lives here.
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

/**
 * Coerce an arbitrary value into a positive integer, falling back to the
 * provided default. Non-finite numbers, zero, and negative values all
 * resolve to the fallback. The result is floored to ensure an integer.
 */
export function readOptionalNum(value: unknown, fb: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fb;
}

/**
 * Coerce an arbitrary value into a trimmed string, falling back to the
 * provided default. Non-string values or strings that are empty after
 * trimming resolve to the fallback (default empty string).
 */
export function readOptionalStr(value: unknown, fb = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fb;
}

const ARRAY_GAP_CHECKS: ReadonlyArray<readonly [readonly string[], string]> = [
  [['capabilities'], 'no_capabilities_declared'],
  [['capabilities', 'available'], 'no_capabilities_available'],
  [['beliefs'], 'no_beliefs_formed'],
  [['memory', 'workingMemory'], 'working_memory_empty'],
  [['memory', 'episodicRefs'], 'no_episodic_memory'],
  [['memory', 'consolidatedRefs'], 'no_consolidated_memory'],
  [['predictions', 'active'], 'no_active_predictions'],
  [['perception', 'recentSalientEvents'], 'perception_loop_silent'],
];

function walkPath(root: Record<string, unknown>, path: readonly string[]): unknown {
  return path.reduce<unknown>(
    (acc, key) =>
      acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[key] : undefined,
    root,
  );
}

function isEmptyArray(value: unknown): boolean {
  return Array.isArray(value) && value.length === 0;
}

/**
 * Derive an HONEST gap list from the REAL cognitive-state ABI object.
 * Nothing here is hardcoded: it walks the actual returned structure and
 * reports which cognitive loops are still empty/unclosed. Missing paths
 * are simply skipped (no invented field names). This is the data the
 * self-introspection organ surfaces so Kloel can tell, through the chat,
 * what is genuinely not working in itself.
 */
export function computeCognitiveGaps(abi: unknown): string[] {
  if (!abi || typeof abi !== 'object') {
    return ['cognitive_state_unavailable'];
  }
  const root = abi as Record<string, unknown>;
  const gaps: string[] = [];

  for (const [path, label] of ARRAY_GAP_CHECKS) {
    if (isEmptyArray(walkPath(root, path))) {
      gaps.push(label);
    }
  }

  const lineageStatus = walkPath(root, ['lineage', 'status']);
  if (typeof lineageStatus === 'string' && lineageStatus !== 'intact') {
    gaps.push(`lineage_${lineageStatus}`);
  }
  const pulseVerdict = walkPath(root, ['pulseTruth', 'certificationVerdict']);
  if (typeof pulseVerdict === 'string' && pulseVerdict !== 'PASS') {
    gaps.push(`pulse_${pulseVerdict.toLowerCase()}`);
  }
  return gaps;
}

/**
 * Identity audience union accepted by the introspection ABI. Mirrors
 * `IdentityProjectorService.IdentityAudience` so the helpers stay decoupled
 * from the projector module. Keep in sync if that contract changes.
 */
export type IdentityAudienceLike = 'public' | 'technical' | 'origin' | 'internal';

const IDENTITY_AUDIENCES: readonly IdentityAudienceLike[] = [
  'public',
  'technical',
  'origin',
  'internal',
];

/**
 * Coerce an arbitrary value into one of the known identity audiences.
 * Anything that is not a recognised audience resolves to `'internal'` —
 * the safest default for self-introspection.
 */
export function normalizeIdentityAudience(value: unknown): IdentityAudienceLike {
  return IDENTITY_AUDIENCES.includes(value as IdentityAudienceLike)
    ? (value as IdentityAudienceLike)
    : 'internal';
}

/**
 * Minimal shape of a dissolution gap consumed by the work-queue builder.
 * Kept structural so callers don't need to import the substrate types.
 */
export interface DissolutionGapLike {
  readonly surface: string;
  readonly status: 'dissolved' | 'partial' | 'silent';
}

/**
 * Combine cognitive `gaps` with dissolution surface statuses into the
 * `workQueue` surfaced by `inspect_self`. Silent surfaces become
 * `dissolve_surface:<surface>` entries; partial surfaces become
 * `emit_canonical_events:<surface>` entries; dissolved surfaces are
 * skipped. The relative order is preserved: gaps first, then silent
 * surfaces, then partial surfaces.
 */
export function buildInspectSelfWorkQueue(
  gaps: readonly string[],
  dissolution: readonly DissolutionGapLike[],
): string[] {
  return [
    ...gaps,
    ...dissolution.filter((d) => d.status === 'silent').map((d) => `dissolve_surface:${d.surface}`),
    ...dissolution
      .filter((d) => d.status === 'partial')
      .map((d) => `emit_canonical_events:${d.surface}`),
  ];
}

/**
 * Surfaces that have NOT yet reached the `dissolved` status. Mirrors the
 * derivation used to decide the `emergent` flag in `inspect_self`.
 */
export function selectSilentSurfaces(dissolution: readonly DissolutionGapLike[]): string[] {
  return dissolution.filter((d) => d.status !== 'dissolved').map((d) => d.surface);
}

/**
 * Inputs to the revenue-summary helper — already-aggregated Prisma values.
 * Keeping the math here ensures the rounding contract (whole cents,
 * conversion rounded to two decimals) is unit-testable without Prisma.
 */
export interface RevenueSummaryInput {
  readonly sumTotalInCents: number | null;
  readonly avgTotalInCents: number | null;
  readonly totalCount: number;
  readonly paidCount: number;
  readonly periodDays: number;
}

/** Canonical revenue summary surfaced by `query_revenue_summary`. */
export interface RevenueSummary {
  readonly totalRevenue: number;
  readonly ticketMedio: number;
  readonly totalCount: number;
  readonly paidCount: number;
  readonly conversao: number;
  readonly periodDays: number;
}

/**
 * Derive the canonical revenue summary from raw Prisma aggregate counts.
 * `ticketMedio` is rounded to a whole cent; `conversao` is the paid/total
 * ratio expressed as a percentage with two decimals, or `0` when there
 * are no orders. Both totals fall back to `0` when Prisma returns `null`.
 */
export function computeRevenueSummary(input: RevenueSummaryInput): RevenueSummary {
  const totalRevenue = input.sumTotalInCents ?? 0;
  const ticketMedio = Math.round(input.avgTotalInCents ?? 0);
  const conversao =
    input.totalCount > 0 ? Math.round((input.paidCount / input.totalCount) * 10000) / 100 : 0;
  return {
    totalRevenue,
    ticketMedio,
    totalCount: input.totalCount,
    paidCount: input.paidCount,
    conversao,
    periodDays: input.periodDays,
  };
}

/**
 * Build the `[startDate, days]` window used by `query_revenue_summary`.
 * The number of days is clamped to `[1, 365]` and the start date is
 * normalised to midnight local time. Returns both the clamped days
 * value and the resolved start `Date` so callers can reuse them for
 * Prisma filters and the response shape.
 */
export function buildRevenueWindow(
  rawDays: unknown,
  defaultDays = 30,
  maxDays = 365,
  now: Date = new Date(),
): { days: number; start: Date } {
  const days = Math.min(readOptionalNum(rawDays, defaultDays), maxDays);
  const start = new Date(now);
  start.setDate(start.getDate() - days);
  start.setHours(0, 0, 0, 0);
  return { days, start };
}

/**
 * Optional case-insensitive `name`-contains clause for product listings.
 * Returns `undefined` when no usable search term is supplied so callers
 * can spread the result into a Prisma `where` without polluting it with
 * empty filters.
 */
export function buildProductSearchClause(
  search: string | undefined,
): { name: { contains: string; mode: 'insensitive' } } | undefined {
  if (!search) {
    return undefined;
  }
  return { name: { contains: search, mode: 'insensitive' } };
}

/**
 * Build the OR clause used by `search_contact`. Matches name and email
 * case-insensitively and phone case-sensitively (phones never have
 * casing). The shape mirrors the inline Prisma filter so the service
 * can keep its `select` and `orderBy` clauses unchanged.
 */
export function buildContactSearchOr(query: string): Array<Record<string, unknown>> {
  return [
    { name: { contains: query, mode: 'insensitive' } },
    { phone: { contains: query } },
    { email: { contains: query, mode: 'insensitive' } },
  ];
}

/**
 * Translate the `status` argument accepted by `list_conversations` into
 * the matching Prisma `status` filter. `'open'` excludes closed
 * conversations; `'closed'` matches only closed; anything else (the
 * default `'all'`) returns an empty fragment so the service spreads it
 * harmlessly.
 */
export function buildConversationStatusFilter(
  statusFilter: string | undefined,
): { status: { not: 'closed' } } | { status: 'closed' } | Record<string, never> {
  if (statusFilter === 'open') {
    return { status: { not: 'closed' } };
  }
  if (statusFilter === 'closed') {
    return { status: 'closed' };
  }
  return {};
}
