/** Pulse organism role type. */
export type PulseOrganismRole = 'backend' | 'worker' | 'frontend' | 'scanner';
/** Pulse organism status type. */
export type PulseOrganismStatus = 'UP' | 'DEGRADED' | 'DOWN' | 'STALE';
/** Pulse advice level type. */
export type PulseAdviceLevel = 'nominal' | 'watch' | 'critical';
/** Pulse artifact freshness type. */
export type PulseArtifactFreshness = 'fresh' | 'stale' | 'missing';

/** Pulse heartbeat record shape. */
export interface PulseHeartbeatRecord {
  /** Node id property. */
  nodeId: string;
  /** Role property. */
  role: PulseOrganismRole;
  /** Status property. */
  status: Exclude<PulseOrganismStatus, 'STALE'>;
  /** Summary property. */
  summary: string;
  /** Source property. */
  source: string;
  /** Observed at property. */
  observedAt: string;
  /** Expires at property. */
  expiresAt: string;
  /** Ttl ms property. */
  ttlMs: number;
  /** Critical property. */
  critical: boolean;
  /** Env property. */
  env: string;
  /** Version property. */
  version?: string;
  /** Workspace id property. */
  workspaceId?: string;
  /** Surface property. */
  surface?: string;
  /** Signals property. */
  signals: Record<string, string | number | boolean | null>;
}

/** Pulse organism node shape. */
export interface PulseOrganismNode extends Omit<PulseHeartbeatRecord, 'status'> {
  /** Status property. */
  status: PulseOrganismStatus;
  /** Stale property. */
  stale: boolean;
  /** Stale ms property. */
  staleMs?: number;
}

/** Pulse incident shape. */
export interface PulseIncident {
  /** Incident id property. */
  incidentId: string;
  /** Node id property. */
  nodeId: string;
  /** Role property. */
  role: PulseOrganismRole;
  /** Status property. */
  status: PulseOrganismStatus;
  /** Summary property. */
  summary: string;
  /** Observed at property. */
  observedAt: string;
  /** Source property. */
  source: string;
  /** Critical property. */
  critical: boolean;
  /** Workspace id property. */
  workspaceId?: string;
  /** Surface property. */
  surface?: string;
}

/** Pulse artifact payload shape. */
export interface PulseArtifactPayload<T = Record<string, unknown>> {
  /** Artifact property. */
  artifact: string;
  /** Path property. */
  path: string;
  /** Freshness property. */
  freshness: PulseArtifactFreshness;
  /** Generated at property. */
  generatedAt: string | null;
  /** Stale ms property. */
  staleMs: number | null;
  /** Data property. */
  data: T | null;
  /** Error property. */
  error?: string;
}

/** Registry_redis_slot. */
export const REGISTRY_REDIS_SLOT = 'pulse:organism:registry';
/** Critical_registry_redis_slot. */
export const CRITICAL_REGISTRY_REDIS_SLOT = 'pulse:organism:registry:critical';
/** Frontend_registry_redis_slot. */
export const FRONTEND_REGISTRY_REDIS_SLOT = 'pulse:organism:registry:frontend';
/** Incidents_redis_slot. */
export const INCIDENTS_REDIS_SLOT = 'pulse:organism:incidents';
/** Default_backend_ttl_ms. */
export const DEFAULT_BACKEND_TTL_MS = 45_000;
/** Default_worker_ttl_ms. */
export const DEFAULT_WORKER_TTL_MS = 60_000;
/** Default_frontend_ttl_ms. */
export const DEFAULT_FRONTEND_TTL_MS = 90_000;
/** Default_heartbeat_interval_ms. */
export const DEFAULT_HEARTBEAT_INTERVAL_MS = 15_000;
/** Default_stale_sweep_ms. */
export const DEFAULT_STALE_SWEEP_MS = 60_000;
/** Default_frontend_prune_sweep_ms. */
export const DEFAULT_FRONTEND_PRUNE_SWEEP_MS = 15 * 60_000;
/** Frontend_retention_ms. */
export const FRONTEND_RETENTION_MS = 24 * 60 * 60 * 1000;
/** Incident_limit. */
export const INCIDENT_LIMIT = 60;
/** Default_artifact_max_age_ms. */
export const DEFAULT_ARTIFACT_MAX_AGE_MS = 15 * 60_000;
