import * as os from 'node:os';
import {
  DEFAULT_BACKEND_TTL_MS,
  type PulseHeartbeatRecord,
  type PulseIncident,
  type PulseOrganismNode,
  type PulseOrganismRole,
  type PulseOrganismStatus,
} from './pulse.service.contract';

/** Infer organism role from a nodeId prefix. */
export function inferRole(nodeId: string): PulseOrganismRole {
  if (nodeId.startsWith('backend:')) {
    return 'backend';
  }
  if (nodeId.startsWith('worker:')) {
    return 'worker';
  }
  if (nodeId.startsWith('frontend:')) {
    return 'frontend';
  }
  return 'scanner';
}

/** Resolve a stable node suffix from the runtime environment. */
export function getNodeSuffix(): string {
  const safeHostname =
    typeof (os as { hostname?: unknown } | undefined)?.hostname === 'function'
      ? os.hostname()
      : 'local';
  return (
    process.env.RAILWAY_REPLICA_ID ||
    process.env.RAILWAY_SERVICE_ID ||
    process.env.HOSTNAME ||
    safeHostname
  );
}

/** Build a fallback heartbeat record used when registry metadata is missing. */
export function buildRegistryFallbackRecord(nodeId: string): PulseHeartbeatRecord {
  const role = inferRole(nodeId);
  return {
    nodeId,
    role,
    status: 'DOWN',
    summary: 'No registry metadata available.',
    source: 'registry_fallback',
    observedAt: new Date(0).toISOString(),
    expiresAt: new Date(0).toISOString(),
    ttlMs: DEFAULT_BACKEND_TTL_MS,
    critical: role !== 'frontend',
    env: process.env.NODE_ENV || 'development',
    signals: {},
  };
}

export interface OrganismCircuitCounts {
  criticalDown: number;
  criticalDegraded: number;
  surfaceProblems: number;
  staleNodes: number;
  freshNodes: number;
  roleCounts: Record<string, number>;
}

export interface OrganismCircuit extends OrganismCircuitCounts {
  status: PulseOrganismStatus;
  summary: string;
  freshness: {
    newestObservedAt: string | null;
    oldestObservedAt: string | null;
    maxStaleMs: number;
  };
}

/** Derive the aggregate organism status + counters from already-hydrated nodes. */
export function deriveOrganismCircuit(
  nodes: PulseOrganismNode[],
  totalRegistered: number,
): OrganismCircuit {
  const freshNodes = nodes.filter((node) => !node.stale);
  const staleNodes = nodes.filter((node) => node.stale);
  const criticalNodes = nodes.filter((node) => node.critical);
  const criticalDown = criticalNodes.filter(
    (node) => node.status === 'DOWN' || node.status === 'STALE',
  );
  const criticalDegraded = criticalNodes.filter((node) => node.status === 'DEGRADED');
  const surfaceProblems = nodes.filter(
    (node) => node.role === 'frontend' && (node.status === 'DOWN' || node.status === 'STALE'),
  );
  const status: PulseOrganismStatus =
    totalRegistered === 0
      ? 'STALE'
      : criticalDown.length > 0
        ? 'DOWN'
        : criticalDegraded.length > 0 || surfaceProblems.length > 0
          ? 'DEGRADED'
          : 'UP';
  const roleCounts = nodes.reduce<Record<string, number>>((acc, node) => {
    acc[node.role] = (acc[node.role] || 0) + 1;
    return acc;
  }, {});
  const summary =
    status === 'UP'
      ? `Organism alive with ${freshNodes.length} fresh nodes across ${Object.keys(roleCounts).length} roles.`
      : status === 'STALE'
        ? 'Organism has no active live nodes yet.'
        : status === 'DOWN'
          ? `Organism has ${criticalDown.length} critical nodes down or stale.`
          : `Organism degraded: ${criticalDegraded.length} critical nodes degraded, ${surfaceProblems.length} surface nodes impaired.`;
  const observedAtMs = nodes
    .map((node) => Date.parse(node.observedAt))
    .filter((value) => Number.isFinite(value));
  const freshness = {
    newestObservedAt:
      observedAtMs.length > 0 ? new Date(Math.max(...observedAtMs)).toISOString() : null,
    oldestObservedAt:
      observedAtMs.length > 0 ? new Date(Math.min(...observedAtMs)).toISOString() : null,
    maxStaleMs: staleNodes.reduce((max, node) => Math.max(max, node.staleMs || 0), 0),
  };
  return {
    status,
    summary,
    criticalDown: criticalDown.length,
    criticalDegraded: criticalDegraded.length,
    surfaceProblems: surfaceProblems.length,
    staleNodes: staleNodes.length,
    freshNodes: freshNodes.length,
    roleCounts,
    freshness,
  };
}

interface ProductionSnapshotShape {
  directive: { data?: Record<string, unknown> | null };
  convergencePlan: { data?: Record<string, unknown> | null };
}

/** Pick the top-of-queue convergence actions from the latest production snapshot. */
export function pickNextWork(snapshot: ProductionSnapshotShape, limit = 5): unknown[] {
  const directiveData = snapshot.directive.data;
  const convergenceData = snapshot.convergencePlan.data;
  const nextWork = directiveData?.nextWork;
  if (Array.isArray(nextWork) && nextWork.length > 0) {
    return nextWork.slice(0, limit);
  }
  const queue = convergenceData?.queue;
  if (Array.isArray(queue)) {
    return queue.slice(0, limit);
  }
  return [];
}

/** Build the optional fields slice copied from a heartbeat onto an emitted incident. */
export function buildIncidentExtras(
  record: Pick<PulseHeartbeatRecord, 'workspaceId' | 'surface'>,
): Partial<Pick<PulseIncident, 'workspaceId' | 'surface'>> {
  return {
    ...(record.workspaceId !== undefined ? { workspaceId: record.workspaceId } : {}),
    ...(record.surface !== undefined ? { surface: record.surface } : {}),
  };
}
