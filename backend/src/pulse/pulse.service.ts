import { InjectRedis } from '@nestjs-modules/ioredis';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import os from 'os';
import type { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { SystemHealthService } from '../health/system-health.service';
import { PulseFrontendHeartbeatDto } from './dto/frontend-heartbeat.dto';
import { PulseInternalHeartbeatDto } from './dto/internal-heartbeat.dto';

type PulseOrganismRole = 'backend' | 'worker' | 'frontend' | 'scanner';
type PulseOrganismStatus = 'UP' | 'DEGRADED' | 'DOWN' | 'STALE';
type PulseAdviceLevel = 'nominal' | 'watch' | 'critical';

interface PulseHeartbeatRecord {
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

interface PulseOrganismNode extends Omit<PulseHeartbeatRecord, 'status'> {
  status: PulseOrganismStatus;
  stale: boolean;
  staleMs?: number;
}

interface PulseIncident {
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

const REGISTRY_KEY = 'pulse:organism:registry';
const INCIDENTS_KEY = 'pulse:organism:incidents';
const DEFAULT_BACKEND_TTL_MS = 45_000;
const DEFAULT_WORKER_TTL_MS = 60_000;
const DEFAULT_FRONTEND_TTL_MS = 90_000;
const DEFAULT_HEARTBEAT_INTERVAL_MS = 15_000;
const DEFAULT_STALE_SWEEP_MS = 60_000;
const FRONTEND_RETENTION_MS = 24 * 60 * 60 * 1000;
const INCIDENT_LIMIT = 60;

function safeJsonParse<T>(value: string | null | undefined): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function compactText(value: string, max = 600) {
  const compact = value.replace(/\s+/g, ' ').trim();
  if (compact.length <= max) return compact;
  return `${compact.slice(0, max - 3)}...`;
}

function toOrganismStatus(input: string): Exclude<PulseOrganismStatus, 'STALE'> {
  if (input === 'UP' || input === 'DEGRADED' || input === 'DOWN') {
    return input;
  }
  return 'DEGRADED';
}

@Injectable()
export class PulseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PulseService.name);
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private lastStaleSweepAt = 0;

  constructor(
    @InjectRedis() private readonly redis: Redis,
    private readonly systemHealth: SystemHealthService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID) {
      return;
    }

    const everyMs = this.getBackendHeartbeatEveryMs();
    void this.captureBackendHeartbeat('startup');
    this.heartbeatTimer = setInterval(() => {
      void this.captureBackendHeartbeat('interval');
    }, everyMs);
  }

  onModuleDestroy() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  async recordFrontendHeartbeat(user: JwtPayload, payload: PulseFrontendHeartbeatDto) {
    const workspaceId = String(user?.workspaceId || '').trim();
    const nodeId = `frontend:${workspaceId || 'unknown'}:${payload.sessionId}`;
    const status = !payload.online ? 'DOWN' : payload.visible ? 'UP' : 'DEGRADED';
    const summary =
      status === 'UP'
        ? `Frontend surface active on ${payload.route}.`
        : status === 'DEGRADED'
          ? `Frontend session open but hidden on ${payload.route}.`
          : `Frontend session offline on ${payload.route}.`;

    return this.persistHeartbeat({
      nodeId,
      role: 'frontend',
      status,
      summary,
      source: 'frontend_surface',
      observedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + DEFAULT_FRONTEND_TTL_MS).toISOString(),
      ttlMs: DEFAULT_FRONTEND_TTL_MS,
      critical: false,
      env: process.env.NODE_ENV || 'development',
      workspaceId,
      surface: payload.route,
      signals: {
        visible: payload.visible,
        online: payload.online,
        viewportWidth: payload.viewport?.width ?? null,
        viewportHeight: payload.viewport?.height ?? null,
        connectionType: payload.connectionType ?? null,
      },
    });
  }

  async recordInternalHeartbeat(payload: PulseInternalHeartbeatDto, source = 'internal_runtime') {
    const ttlMs =
      payload.ttlMs ??
      (payload.role === 'frontend'
        ? DEFAULT_FRONTEND_TTL_MS
        : payload.role === 'worker'
          ? DEFAULT_WORKER_TTL_MS
          : DEFAULT_BACKEND_TTL_MS);

    return this.persistHeartbeat({
      nodeId: payload.nodeId,
      role: payload.role,
      status: payload.status,
      summary: compactText(payload.summary),
      source,
      observedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + ttlMs).toISOString(),
      ttlMs,
      critical: payload.critical ?? payload.role !== 'frontend',
      env: process.env.NODE_ENV || 'development',
      version: payload.version,
      workspaceId: payload.workspaceId,
      surface: payload.surface,
      signals: payload.signals || {},
    });
  }

  async captureBackendHeartbeat(trigger: 'startup' | 'interval' | 'manual') {
    try {
      const health = await this.systemHealth.check();
      const detail = (health?.details || {}) as Record<string, { status?: string } | undefined>;
      const status = toOrganismStatus(String(health?.status || 'DEGRADED'));
      const nodeId = `backend:${this.getNodeSuffix()}`;
      const memory = process.memoryUsage();
      const summary =
        status === 'UP'
          ? 'Backend heartbeat healthy.'
          : status === 'DOWN'
            ? 'Backend heartbeat detected a hard dependency down.'
            : 'Backend heartbeat detected degraded integrations.';

      await this.persistHeartbeat({
        nodeId,
        role: 'backend',
        status,
        summary,
        source: 'backend_runtime',
        observedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + DEFAULT_BACKEND_TTL_MS).toISOString(),
        ttlMs: DEFAULT_BACKEND_TTL_MS,
        critical: true,
        env: process.env.NODE_ENV || 'development',
        version: String(process.env.RAILWAY_GIT_COMMIT_SHA || '').slice(0, 12) || undefined,
        signals: {
          trigger,
          uptimeSec: Math.round(process.uptime()),
          memoryRssMb: Math.round(memory.rss / 1024 / 1024),
          memoryHeapUsedMb: Math.round(memory.heapUsed / 1024 / 1024),
          databaseStatus: String(detail.database?.status || 'unknown'),
          redisStatus: String(detail.redis?.status || 'unknown'),
          whatsappStatus: String(detail.whatsapp?.status || 'unknown'),
          workerStatus: String(detail.worker?.status || 'unknown'),
          storageStatus: String(detail.storage?.status || 'unknown'),
        },
      });

      await this.detectStaleNodesIfDue();
    } catch (error) {
      this.logger.error(
        `Failed to capture backend heartbeat: ${(error as Error)?.message || 'unknown error'}`,
      );
    }
  }

  async getOrganismState() {
    const registry = await this.redis.hgetall(REGISTRY_KEY);
    const nodeIds = Object.keys(registry);
    const nodes = await this.hydrateNodes(registry);
    const incidents = await this.getRecentIncidents();

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
      nodeIds.length === 0
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
    const advice = this.buildAdvice(status, {
      criticalDown: criticalDown.length,
      criticalDegraded: criticalDegraded.length,
      surfaceProblems: surfaceProblems.length,
      staleNodes: staleNodes.length,
      incidentCount: incidents.length,
    });

    return {
      status,
      summary,
      generatedAt: new Date().toISOString(),
      authorityMode: 'advisory-only',
      circulation: {
        registeredNodes: nodeIds.length,
        freshNodes: freshNodes.length,
        staleNodes: staleNodes.length,
        incidentCount: incidents.length,
        roleCounts,
      },
      freshness,
      advice,
      nodes,
      incidents,
    };
  }

  private buildAdvice(
    status: PulseOrganismStatus,
    counters: {
      criticalDown: number;
      criticalDegraded: number;
      surfaceProblems: number;
      staleNodes: number;
      incidentCount: number;
    },
  ): {
    level: PulseAdviceLevel;
    summary: string;
    recommendedActions: string[];
  } {
    if (status === 'DOWN') {
      return {
        level: 'critical',
        summary: `Critical organism nodes are down or stale (${counters.criticalDown} affected). Prioritize restoration before expanding the mutation surface.`,
        recommendedActions: [
          'Inspect the affected backend/worker nodes first.',
          'Re-run runtime probes after restoring the failing heartbeat.',
          'Avoid unrelated high-risk edits until the organism is stable again.',
        ],
      };
    }

    if (status === 'DEGRADED' || status === 'STALE') {
      return {
        level: 'watch',
        summary:
          status === 'STALE'
            ? `Live circulation is missing or stale (${counters.staleNodes} stale nodes). Treat runtime certainty as low until fresh heartbeats return.`
            : `Organism is degraded (${counters.criticalDegraded} critical degraded nodes, ${counters.surfaceProblems} impaired surfaces). Continue with caution and validate the affected surfaces before broad changes.`,
        recommendedActions: [
          'Check stale or degraded nodes and refresh their heartbeat.',
          'Validate the impacted surface before touching adjacent domains.',
          'Use PULSE as guidance, not as a blocker, until live evidence is fresh again.',
        ],
      };
    }

    return {
      level: 'nominal',
      summary: `Organism is live with ${counters.incidentCount} recent incident(s) and no current critical degradation.`,
      recommendedActions: [
        'Follow the top convergence actions from the latest PULSE directive.',
        'Keep heartbeats flowing while modifying adjacent domains.',
        'Re-run PULSE after meaningful changes to refresh the organism map.',
      ],
    };
  }

  private async persistHeartbeat(record: PulseHeartbeatRecord) {
    const liveKey = this.getLiveKey(record.nodeId);
    const previous = safeJsonParse<PulseHeartbeatRecord>(await this.redis.get(liveKey));

    await this.redis
      .multi()
      .set(liveKey, JSON.stringify(record), 'PX', record.ttlMs)
      .hset(REGISTRY_KEY, record.nodeId, JSON.stringify(record))
      .del(this.getStaleAlertKey(record.nodeId))
      .exec();

    if (record.critical && record.status !== 'UP' && previous?.status !== record.status) {
      await this.emitIncident({
        nodeId: record.nodeId,
        role: record.role,
        status: record.status,
        summary: record.summary,
        observedAt: record.observedAt,
        source: record.source,
        critical: record.critical,
        workspaceId: record.workspaceId,
        surface: record.surface,
      });
    }

    if (record.critical && previous?.status && previous.status !== 'UP' && record.status === 'UP') {
      await this.emitIncident({
        nodeId: record.nodeId,
        role: record.role,
        status: 'UP',
        summary: `${record.role} recovered and is healthy again.`,
        observedAt: record.observedAt,
        source: 'pulse_recovery',
        critical: record.critical,
        workspaceId: record.workspaceId,
        surface: record.surface,
      });
    }

    return {
      ok: true,
      nodeId: record.nodeId,
      status: record.status,
      observedAt: record.observedAt,
      expiresAt: record.expiresAt,
    };
  }

  private async hydrateNodes(registry: Record<string, string>): Promise<PulseOrganismNode[]> {
    const nodeIds = Object.keys(registry);
    if (nodeIds.length === 0) return [];

    const pipeline = this.redis.pipeline();
    nodeIds.forEach((nodeId) => pipeline.get(this.getLiveKey(nodeId)));
    const liveResults = await pipeline.exec();
    const now = Date.now();
    const nodes: PulseOrganismNode[] = [];

    nodeIds.forEach((nodeId, index) => {
      const registryRecord =
        safeJsonParse<PulseHeartbeatRecord>(registry[nodeId]) ||
        ({
          nodeId,
          role: this.inferRole(nodeId),
          status: 'DOWN',
          summary: 'No registry metadata available.',
          source: 'registry_fallback',
          observedAt: new Date(0).toISOString(),
          expiresAt: new Date(0).toISOString(),
          ttlMs: DEFAULT_BACKEND_TTL_MS,
          critical: this.inferRole(nodeId) !== 'frontend',
          env: process.env.NODE_ENV || 'development',
          signals: {},
        } satisfies PulseHeartbeatRecord);

      const [, liveValue] = liveResults?.[index] || [];
      const liveRecord = safeJsonParse<PulseHeartbeatRecord>(String(liveValue || ''));
      const base = liveRecord || registryRecord;
      const observedAtMs = Date.parse(base.observedAt) || 0;
      const stale = !liveRecord;
      const staleMs = stale ? Math.max(now - observedAtMs, 0) : undefined;

      nodes.push({
        ...base,
        status: stale ? 'STALE' : base.status,
        stale,
        staleMs,
      });
    });

    return nodes.sort((left, right) => left.nodeId.localeCompare(right.nodeId));
  }

  private async detectStaleNodes() {
    const registry = await this.redis.hgetall(REGISTRY_KEY);
    const nodes = await this.hydrateNodes(registry);
    const now = Date.now();

    for (const node of nodes) {
      if (!node.stale) continue;

      if (node.role === 'frontend' && (node.staleMs || 0) > FRONTEND_RETENTION_MS) {
        await this.redis.hdel(REGISTRY_KEY, node.nodeId);
        continue;
      }

      if (!node.critical) {
        continue;
      }

      const staleAlertKey = this.getStaleAlertKey(node.nodeId);
      const alreadyAlerted = await this.redis.set(
        staleAlertKey,
        String(now),
        'EX',
        Math.max(Math.round(node.ttlMs / 1000), 60),
        'NX',
      );

      if (alreadyAlerted === 'OK') {
        await this.emitIncident({
          nodeId: node.nodeId,
          role: node.role,
          status: 'STALE',
          summary: `${node.role} heartbeat went stale after ${(node.staleMs || 0) / 1000}s without refresh.`,
          observedAt: new Date().toISOString(),
          source: 'stale_detector',
          critical: node.critical,
          workspaceId: node.workspaceId,
          surface: node.surface,
        });
      }
    }
  }

  private async detectStaleNodesIfDue() {
    const now = Date.now();
    if (now - this.lastStaleSweepAt < this.getStaleSweepEveryMs()) {
      return;
    }

    this.lastStaleSweepAt = now;
    await this.detectStaleNodes();
  }

  private async getRecentIncidents(): Promise<PulseIncident[]> {
    const raw = await this.redis.lrange(INCIDENTS_KEY, 0, INCIDENT_LIMIT - 1);
    return raw
      .map((item) => safeJsonParse<PulseIncident>(item))
      .filter((item): item is PulseIncident => Boolean(item));
  }

  private async emitIncident(input: Omit<PulseIncident, 'incidentId'>) {
    const incident: PulseIncident = {
      incidentId: `${input.nodeId}:${Date.now().toString(36)}`,
      ...input,
    };

    const payload = JSON.stringify(incident);
    await this.redis
      .multi()
      .lpush(INCIDENTS_KEY, payload)
      .ltrim(INCIDENTS_KEY, 0, INCIDENT_LIMIT - 1)
      .publish(
        'alerts',
        JSON.stringify({
          type: 'PULSE_INCIDENT',
          ...incident,
        }),
      )
      .exec();

    await this.sendAlertWebhook(incident);
  }

  private async sendAlertWebhook(incident: PulseIncident) {
    const webhookUrl = this.getAlertWebhookUrl();
    if (!webhookUrl) {
      return;
    }

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Request-ID': incident.incidentId,
        },
        body: JSON.stringify({
          type: 'pulse_incident',
          incident,
          at: new Date().toISOString(),
          environment: process.env.NODE_ENV || 'development',
        }),
        signal: AbortSignal.timeout(8_000),
      });

      if (!response.ok) {
        this.logger.warn(`Pulse alert webhook returned HTTP ${response.status}`);
      }
    } catch (error) {
      this.logger.warn(
        `Pulse alert webhook failed: ${(error as Error)?.message || 'unknown error'}`,
      );
    }
  }

  private getAlertWebhookUrl() {
    return (
      this.config.get<string>('PULSE_ALERT_WEBHOOK_URL') ||
      this.config.get<string>('OPS_WEBHOOK_URL') ||
      this.config.get<string>('AUTOPILOT_ALERT_WEBHOOK_URL') ||
      this.config.get<string>('DLQ_WEBHOOK_URL') ||
      ''
    );
  }

  private getBackendHeartbeatEveryMs() {
    const raw = Number.parseInt(process.env.PULSE_BACKEND_HEARTBEAT_MS || '', 10);
    if (Number.isFinite(raw) && raw >= 5_000) {
      return raw;
    }
    return DEFAULT_HEARTBEAT_INTERVAL_MS;
  }

  private getStaleSweepEveryMs() {
    const raw = Number.parseInt(process.env.PULSE_STALE_SWEEP_MS || '', 10);
    if (Number.isFinite(raw) && raw >= 15_000) {
      return raw;
    }
    return DEFAULT_STALE_SWEEP_MS;
  }

  private getLiveKey(nodeId: string) {
    return `pulse:organism:live:${nodeId}`;
  }

  private getStaleAlertKey(nodeId: string) {
    return `pulse:organism:stale-alert:${nodeId}`;
  }

  private getNodeSuffix() {
    return (
      process.env.RAILWAY_REPLICA_ID ||
      process.env.RAILWAY_SERVICE_ID ||
      process.env.HOSTNAME ||
      os.hostname()
    );
  }

  private inferRole(nodeId: string): PulseOrganismRole {
    if (nodeId.startsWith('backend:')) return 'backend';
    if (nodeId.startsWith('worker:')) return 'worker';
    if (nodeId.startsWith('frontend:')) return 'frontend';
    return 'scanner';
  }
}
