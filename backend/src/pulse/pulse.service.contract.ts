export type PulseOrganismRole = 'backend' | 'worker' | 'frontend' | 'scanner';
export type PulseOrganismStatus = 'UP' | 'DEGRADED' | 'DOWN' | 'STALE';
export type PulseAdviceLevel = 'nominal' | 'watch' | 'critical';
export type PulseArtifactFreshness = 'fresh' | 'stale' | 'missing';

export interface PulseHeartbeatRecord {
  nodeId: string;
  role: PulseOrganismRole;
  status: Exclude<PulseOrganismStatus, 'STALE'>;
  summary: string;
  source: string;
  observedAt: string;
  expiresAt: string;
  ttlMs: number;
  critical: boolean;
  env: string;
  version?: string;
  workspaceId?: string;
  surface?: string;
  signals: Record<string, string | number | boolean | null>;
}

export interface PulseOrganismNode extends Omit<PulseHeartbeatRecord, 'status'> {
  status: PulseOrganismStatus;
  stale: boolean;
  staleMs?: number;
}

export interface PulseIncident {
  incidentId: string;
  nodeId: string;
  role: PulseOrganismRole;
  status: PulseOrganismStatus;
  summary: string;
  observedAt: string;
  source: string;
  critical: boolean;
  workspaceId?: string;
  surface?: string;
}

export interface PulseArtifactPayload<T = Record<string, unknown>> {
  artifact: string;
  path: string;
  freshness: PulseArtifactFreshness;
  generatedAt: string | null;
  staleMs: number | null;
  data: T | null;
  error?: string;
}

export const REGISTRY_REDIS_SLOT = 'pulse:organism:registry';
export const CRITICAL_REGISTRY_REDIS_SLOT = 'pulse:organism:registry:critical';
export const FRONTEND_REGISTRY_REDIS_SLOT = 'pulse:organism:registry:frontend';
export const INCIDENTS_REDIS_SLOT = 'pulse:organism:incidents';
export const DEFAULT_BACKEND_TTL_MS = 45_000;
export const DEFAULT_WORKER_TTL_MS = 60_000;
export const DEFAULT_FRONTEND_TTL_MS = 90_000;
export const DEFAULT_HEARTBEAT_INTERVAL_MS = 15_000;
export const DEFAULT_STALE_SWEEP_MS = 60_000;
export const DEFAULT_FRONTEND_PRUNE_SWEEP_MS = 15 * 60_000;
export const FRONTEND_RETENTION_MS = 24 * 60 * 60 * 1000;
export const INCIDENT_LIMIT = 60;
export const DEFAULT_ARTIFACT_MAX_AGE_MS = 15 * 60_000;
