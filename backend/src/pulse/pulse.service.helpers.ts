import type { PulseFrontendHeartbeatDto } from './dto/frontend-heartbeat.dto';
import type { PulseInternalHeartbeatDto } from './dto/internal-heartbeat.dto';
import {
  DEFAULT_BACKEND_TTL_MS,
  DEFAULT_FRONTEND_TTL_MS,
  DEFAULT_WORKER_TTL_MS,
  type PulseHeartbeatRecord,
  type PulseIncident,
  type PulseOrganismRole,
  type PulseOrganismStatus,
} from './pulse.service.contract';

/** Status alias for non-stale runtime heartbeats. */
export type PulseLiveStatus = Exclude<PulseOrganismStatus, 'STALE'>;

/** Derive the runtime status for a frontend heartbeat from its raw payload. */
export function deriveFrontendHeartbeatStatus(payload: {
  online?: boolean;
  visible?: boolean;
}): PulseLiveStatus {
  if (!payload.online) {
    return 'DOWN';
  }
  return payload.visible ? 'UP' : 'DEGRADED';
}

/** Format the human-readable summary for a frontend heartbeat. */
export function buildFrontendHeartbeatSummary(status: PulseLiveStatus, route: string): string {
  if (status === 'UP') {
    return `Frontend surface active on ${route}.`;
  }
  if (status === 'DEGRADED') {
    return `Frontend session open but hidden on ${route}.`;
  }
  return `Frontend session offline on ${route}.`;
}

/** Resolve the TTL applied to an internal heartbeat payload. */
export function resolveInternalHeartbeatTtlMs(
  payload: Pick<PulseInternalHeartbeatDto, 'role' | 'ttlMs'>,
): number {
  if (payload.ttlMs !== undefined && payload.ttlMs !== null) {
    return payload.ttlMs;
  }
  if (payload.role === 'frontend') {
    return DEFAULT_FRONTEND_TTL_MS;
  }
  if (payload.role === 'worker') {
    return DEFAULT_WORKER_TTL_MS;
  }
  return DEFAULT_BACKEND_TTL_MS;
}

/** Compose the deterministic frontend nodeId for a session. */
export function buildFrontendNodeId(workspaceId: string, sessionId: string): string {
  const trimmed = workspaceId.trim();
  return `frontend:${trimmed || 'unknown'}:${sessionId}`;
}

/** Format the human-readable summary for a backend heartbeat. */
export function buildBackendHeartbeatSummary(status: PulseLiveStatus): string {
  if (status === 'UP') {
    return 'Backend heartbeat healthy.';
  }
  if (status === 'DOWN') {
    return 'Backend heartbeat detected a hard dependency down.';
  }
  return 'Backend heartbeat detected degraded integrations.';
}

interface BackendHealthDetailShape {
  database?: { status?: string };
  redis?: { status?: string };
  whatsapp?: { status?: string };
  worker?: { status?: string };
  storage?: { status?: string };
}

interface BackendMemoryUsageShape {
  rss: number;
  heapUsed: number;
}

/** Categorize raw system health + memory into the signals payload PULSE persists. */
export function buildBackendHeartbeatSignals(input: {
  trigger: 'startup' | 'interval' | 'manual';
  uptimeSec: number;
  memory: BackendMemoryUsageShape;
  detail: BackendHealthDetailShape;
}): Record<string, string | number | boolean | null> {
  const { trigger, uptimeSec, memory, detail } = input;
  return {
    trigger,
    uptimeSec: Math.round(uptimeSec),
    memoryRssMb: Math.round(memory.rss / 1024 / 1024),
    memoryHeapUsedMb: Math.round(memory.heapUsed / 1024 / 1024),
    databaseStatus: String(detail.database?.status || 'unknown'),
    redisStatus: String(detail.redis?.status || 'unknown'),
    whatsappStatus: String(detail.whatsapp?.status || 'unknown'),
    workerStatus: String(detail.worker?.status || 'unknown'),
    storageStatus: String(detail.storage?.status || 'unknown'),
  };
}

/** Build the recovery incident emitted when a critical node transitions back to UP. */
export function buildRecoveryIncidentInput(
  record: Pick<
    PulseHeartbeatRecord,
    'nodeId' | 'role' | 'observedAt' | 'critical' | 'workspaceId' | 'surface'
  >,
): Omit<PulseIncident, 'incidentId'> {
  const base: Omit<PulseIncident, 'incidentId'> = {
    nodeId: record.nodeId,
    role: record.role,
    status: 'UP',
    summary: `${record.role} recovered and is healthy again.`,
    observedAt: record.observedAt,
    source: 'pulse_recovery',
    critical: record.critical,
  };
  if (record.workspaceId !== undefined) {
    base.workspaceId = record.workspaceId;
  }
  if (record.surface !== undefined) {
    base.surface = record.surface;
  }
  return base;
}

/** Compose the incident summary emitted when a critical heartbeat goes stale. */
export function buildStaleIncidentSummary(role: PulseOrganismRole, staleMs: number): string {
  return `${role} heartbeat went stale after ${staleMs / 1000}s without refresh.`;
}

/** Generate the deterministic incident identifier for an emitted PULSE incident. */
export function buildIncidentId(nodeId: string, now = Date.now()): string {
  return `${nodeId}:${now.toString(36)}`;
}

interface OrganismCircuitInputs {
  status: PulseOrganismStatus;
  summary: string;
  freshNodes: number;
  staleNodes: number;
  roleCounts: Record<string, number>;
  freshness: {
    newestObservedAt: string | null;
    oldestObservedAt: string | null;
    maxStaleMs: number;
  };
}

interface ProductionSnapshotShape {
  status: string;
  machineReadiness: unknown;
  canonicalDir: string;
  missingArtifacts: unknown;
  staleArtifacts: unknown;
  authorityMode: string;
  directive: { generatedAt: string | null };
  certificate: { generatedAt: string | null };
  convergencePlan: { generatedAt: string | null };
}

/** Project the production snapshot to the shape exposed by getOrganismState. */
export function projectProductionSnapshot(
  snapshot: ProductionSnapshotShape,
  topActions: unknown[],
) {
  return {
    status: snapshot.status,
    machineReadiness: snapshot.machineReadiness,
    canonicalDir: snapshot.canonicalDir,
    missingArtifacts: snapshot.missingArtifacts,
    staleArtifacts: snapshot.staleArtifacts,
    directiveGeneratedAt: snapshot.directive.generatedAt,
    certificateGeneratedAt: snapshot.certificate.generatedAt,
    convergenceGeneratedAt: snapshot.convergencePlan.generatedAt,
    topActions,
  };
}

/** Compose the canonical organism-state response from already-computed parts. */
export function buildOrganismStateResponse(input: {
  circuit: OrganismCircuitInputs;
  registeredNodes: number;
  incidentCount: number;
  authorityMode: string;
  advice: unknown;
  productionSnapshot: ReturnType<typeof projectProductionSnapshot>;
  nodes: unknown[];
  incidents: unknown[];
  generatedAt?: string;
}) {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  return {
    status: input.circuit.status,
    summary: input.circuit.summary,
    generatedAt,
    authorityMode: input.authorityMode,
    circulation: {
      registeredNodes: input.registeredNodes,
      freshNodes: input.circuit.freshNodes,
      staleNodes: input.circuit.staleNodes,
      incidentCount: input.incidentCount,
      roleCounts: input.circuit.roleCounts,
    },
    freshness: input.circuit.freshness,
    advice: input.advice,
    productionSnapshot: input.productionSnapshot,
    nodes: input.nodes,
    incidents: input.incidents,
  };
}

/** Pick the short git SHA used as the backend heartbeat version, when available. */
export function pickBackendHeartbeatVersion(railwayCommitSha: string | undefined): string | undefined {
  const value = String(railwayCommitSha || '').slice(0, 12);
  return value || undefined;
}

/** Build the frontend signals payload PULSE persists from a frontend heartbeat DTO. */
export function buildFrontendHeartbeatSignals(
  payload: Pick<PulseFrontendHeartbeatDto, 'visible' | 'online' | 'viewport' | 'connectionType'>,
): Record<string, string | number | boolean | null> {
  return {
    visible: payload.visible,
    online: payload.online,
    viewportWidth: payload.viewport?.width ?? null,
    viewportHeight: payload.viewport?.height ?? null,
    connectionType: payload.connectionType ?? null,
  };
}
