import { InjectRedis } from '@nestjs-modules/ioredis';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { forEachSequential } from '../common/async-sequence';
import type { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { SystemHealthService } from '../health/system-health.service';
import { PulseArtifactService } from './pulse-artifact.service';
import {
  getBackendHeartbeatEveryMs,
  getFrontendPruneSweepEveryMs,
  getLiveKey,
  getStaleAlertKey,
  getStaleSweepEveryMs,
  sendAlertWebhook,
} from './pulse-webhook.helpers';
import { PulseFrontendHeartbeatDto } from './dto/frontend-heartbeat.dto';
import { PulseInternalHeartbeatDto } from './dto/internal-heartbeat.dto';
import {
  CRITICAL_REGISTRY_REDIS_SLOT,
  DEFAULT_BACKEND_TTL_MS,
  DEFAULT_FRONTEND_TTL_MS,
  DEFAULT_WORKER_TTL_MS,
  FRONTEND_REGISTRY_REDIS_SLOT,
  FRONTEND_RETENTION_MS,
  INCIDENTS_REDIS_SLOT,
  INCIDENT_LIMIT,
  REGISTRY_REDIS_SLOT,
  type PulseHeartbeatRecord,
  type PulseIncident,
  type PulseOrganismNode,
} from './pulse.service.contract';
import {
  buildOrganismAdvice,
  compactText,
  safeJsonParse,
  toOrganismStatus,
} from './pulse.service.utils';
import {
  buildIncidentExtras,
  buildRegistryFallbackRecord,
  deriveOrganismCircuit,
  getNodeSuffix,
  pickNextWork,
} from './pulse.helpers';
/** Pulse service. */
@Injectable()
export class PulseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PulseService.name);
  private readonly captureStartupHeartbeatTask = () => this.captureBackendHeartbeat('startup');
  private readonly captureIntervalHeartbeatTask = () => this.captureBackendHeartbeat('interval');
  private readonly emitIntervalHeartbeat = () =>
    this.runBackgroundTask('backend heartbeat interval', this.captureIntervalHeartbeatTask);
  private readonly emitCriticalStaleSweep = () =>
    this.runBackgroundTask('critical stale sweep', () => this.detectStaleNodes());
  private readonly emitFrontendPrune = () =>
    this.runBackgroundTask('frontend stale prune', () => this.pruneExpiredFrontendNodes());
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private staleSweepTimer: ReturnType<typeof setInterval> | null = null;
  private frontendPruneTimer: ReturnType<typeof setInterval> | null = null;
  constructor(
    @InjectRedis() private readonly redis: Redis,
    private readonly systemHealth: SystemHealthService,
    private readonly config: ConfigService,
    private readonly artifacts: PulseArtifactService,
  ) {}
  /** On module init. */
  onModuleInit() {
    if (process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID) {
      return;
    }
    const everyMs = getBackendHeartbeatEveryMs();
    const frontendPruneEveryMs = getFrontendPruneSweepEveryMs();
    this.runBackgroundTask('backend heartbeat startup', this.captureStartupHeartbeatTask);
    this.heartbeatTimer = setInterval(this.emitIntervalHeartbeat, everyMs);
    this.staleSweepTimer = setInterval(this.emitCriticalStaleSweep, getStaleSweepEveryMs());
    this.frontendPruneTimer = setInterval(this.emitFrontendPrune, frontendPruneEveryMs);
  }
  /** On module destroy. */
  onModuleDestroy() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.staleSweepTimer) {
      clearInterval(this.staleSweepTimer);
      this.staleSweepTimer = null;
    }
    if (this.frontendPruneTimer) {
      clearInterval(this.frontendPruneTimer);
      this.frontendPruneTimer = null;
    }
  }
  /** Record frontend heartbeat. */
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
  /** Record internal heartbeat. */
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
      signals: payload.signals || {},
      ...(payload.version !== undefined ? { version: payload.version } : {}),
      ...(payload.workspaceId !== undefined ? { workspaceId: payload.workspaceId } : {}),
      ...(payload.surface !== undefined ? { surface: payload.surface } : {}),
    });
  }
  /** Capture backend heartbeat. */
  async captureBackendHeartbeat(trigger: 'startup' | 'interval' | 'manual') {
    try {
      const health = await this.systemHealth.check();
      const detail = (health?.details || {}) as Record<string, { status?: string } | undefined>;
      const status = toOrganismStatus(String(health?.status || 'DEGRADED'));
      const nodeId = `backend:${getNodeSuffix()}`;
      const memory = process.memoryUsage();
      const versionValue =
        String(process.env.RAILWAY_GIT_COMMIT_SHA || '').slice(0, 12) || undefined;
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
        ...(versionValue !== undefined ? { version: versionValue } : {}),
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
    } catch (error: unknown) {
      this.logger.error(
        `Failed to capture backend heartbeat: ${(error as Error)?.message || 'unknown error'}`,
      );
    }
  }
  /** Get organism state. */
  async getOrganismState() {
    const registry = await this.redis.hgetall(REGISTRY_REDIS_SLOT);
    const nodeIds = Object.keys(registry);
    const nodes = await this.hydrateNodes(registry);
    const incidents = await this.getRecentIncidents();
    const circuit = deriveOrganismCircuit(nodes, nodeIds.length);
    const advice = buildOrganismAdvice(circuit.status, {
      criticalDown: circuit.criticalDown,
      criticalDegraded: circuit.criticalDegraded,
      surfaceProblems: circuit.surfaceProblems,
      staleNodes: circuit.staleNodes,
      incidentCount: incidents.length,
    });
    const productionSnapshot = this.getProductionSnapshot();
    const nextWork = pickNextWork(productionSnapshot);
    return {
      status: circuit.status,
      summary: circuit.summary,
      generatedAt: new Date().toISOString(),
      authorityMode: productionSnapshot.authorityMode,
      circulation: {
        registeredNodes: nodeIds.length,
        freshNodes: circuit.freshNodes,
        staleNodes: circuit.staleNodes,
        incidentCount: incidents.length,
        roleCounts: circuit.roleCounts,
      },
      freshness: circuit.freshness,
      advice,
      productionSnapshot: {
        status: productionSnapshot.status,
        machineReadiness: productionSnapshot.machineReadiness,
        canonicalDir: productionSnapshot.canonicalDir,
        missingArtifacts: productionSnapshot.missingArtifacts,
        staleArtifacts: productionSnapshot.staleArtifacts,
        directiveGeneratedAt: productionSnapshot.directive.generatedAt,
        certificateGeneratedAt: productionSnapshot.certificate.generatedAt,
        convergenceGeneratedAt: productionSnapshot.convergencePlan.generatedAt,
        topActions: nextWork,
      },
      nodes,
      incidents,
    };
  }
  /** Get latest PULSE directive artifact. */
  getLatestDirective() {
    return this.artifacts.getLatestDirective();
  }
  /** Get latest PULSE certificate artifact. */
  getLatestCertificate() {
    return this.artifacts.getLatestCertificate();
  }
  /** Get latest PULSE product vision artifact. */
  getLatestProductVision() {
    return this.artifacts.getLatestProductVision();
  }
  /** Get latest PULSE parity gaps artifact. */
  getLatestParityGaps() {
    return this.artifacts.getLatestParityGaps();
  }
  /** Get latest PULSE scope state artifact. */
  getLatestScopeState() {
    return this.artifacts.getLatestScopeState();
  }
  /** Get latest PULSE codacy evidence artifact. */
  getLatestCodacyEvidence() {
    return this.artifacts.getLatestCodacyEvidence();
  }
  /** Get latest PULSE capability state artifact. */
  getLatestCapabilityState() {
    return this.artifacts.getLatestCapabilityState();
  }
  /** Get latest PULSE flow projection artifact. */
  getLatestFlowProjection() {
    return this.artifacts.getLatestFlowProjection();
  }
  /** Get latest PULSE execution matrix artifact. */
  getLatestExecutionMatrix() {
    return this.artifacts.getLatestExecutionMatrix();
  }
  /** Get canonical PULSE machine-readiness state. */
  getMachineReadiness() {
    return this.artifacts.getMachineReadiness();
  }
  /** Get latest PULSE convergence plan artifact. */
  getLatestConvergencePlan() {
    return this.artifacts.getLatestConvergencePlan();
  }
  /** Get latest PULSE external signal artifact. */
  getLatestExternalSignalState() {
    return this.artifacts.getLatestExternalSignalState();
  }
  /** Get latest PULSE autonomy-state artifact. */
  getLatestAutonomyState() {
    return this.artifacts.getLatestAutonomyState();
  }
  /** Get latest PULSE agent-orchestration-state artifact. */
  getLatestAgentOrchestrationState() {
    return this.artifacts.getLatestAgentOrchestrationState();
  }
  /** Get latest production-oriented PULSE snapshot. */
  getProductionSnapshot() {
    return this.artifacts.getProductionSnapshot();
  }
  private async persistHeartbeat(record: PulseHeartbeatRecord) {
    const liveKey = getLiveKey(record.nodeId);
    const previous = safeJsonParse<PulseHeartbeatRecord>(await this.redis.get(liveKey));
    const pipeline = this.redis.multi();
    pipeline
      .set(liveKey, JSON.stringify(record), 'PX', record.ttlMs)
      .hset(REGISTRY_REDIS_SLOT, record.nodeId, JSON.stringify(record))
      .del(getStaleAlertKey(record.nodeId));
    if (record.critical) {
      pipeline.hset(CRITICAL_REGISTRY_REDIS_SLOT, record.nodeId, JSON.stringify(record));
    } else {
      pipeline.hdel(CRITICAL_REGISTRY_REDIS_SLOT, record.nodeId);
    }
    if (record.role === 'frontend') {
      pipeline.hset(FRONTEND_REGISTRY_REDIS_SLOT, record.nodeId, JSON.stringify(record));
    } else {
      pipeline.hdel(FRONTEND_REGISTRY_REDIS_SLOT, record.nodeId);
    }
    await pipeline.exec();
    if (record.critical && record.status !== 'UP' && previous?.status !== record.status) {
      await this.emitIncident({
        nodeId: record.nodeId,
        role: record.role,
        status: record.status,
        summary: record.summary,
        observedAt: record.observedAt,
        source: record.source,
        critical: record.critical,
        ...buildIncidentExtras(record),
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
        ...buildIncidentExtras(record),
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
    if (nodeIds.length === 0) {
      return [];
    }
    const pipeline = this.redis.pipeline();
    nodeIds.forEach((nodeId) => pipeline.get(getLiveKey(nodeId)));
    const liveResults = await pipeline.exec();
    const now = Date.now();
    const nodes: PulseOrganismNode[] = [];
    nodeIds.forEach((nodeId, index) => {
      const registryRecord =
        safeJsonParse<PulseHeartbeatRecord>(registry[nodeId]) ||
        buildRegistryFallbackRecord(nodeId);
      const [, liveValue] = liveResults?.[index] || [];
      const liveRecord =
        typeof liveValue === 'string' ? safeJsonParse<PulseHeartbeatRecord>(liveValue) : null;
      const base = liveRecord || registryRecord;
      const observedAtMs = Date.parse(base.observedAt) || 0;
      const stale = !liveRecord;
      const staleMs = stale ? Math.max(now - observedAtMs, 0) : undefined;
      nodes.push({
        ...base,
        status: stale ? 'STALE' : base.status,
        stale,
        ...(staleMs !== undefined ? { staleMs } : {}),
      });
    });
    return nodes.sort((left, right) => left.nodeId.localeCompare(right.nodeId));
  }
  private async detectStaleNodes() {
    const registry = await this.redis.hgetall(CRITICAL_REGISTRY_REDIS_SLOT);
    const nodes = await this.hydrateNodes(registry);
    const now = Date.now();
    await forEachSequential(nodes, async (node) => {
      if (!node.stale) {
        return;
      }
      const staleAlertKey = getStaleAlertKey(node.nodeId);
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
          ...buildIncidentExtras(node),
        });
      }
    });
  }
  private async pruneExpiredFrontendNodes() {
    const registry = await this.redis.hgetall(FRONTEND_REGISTRY_REDIS_SLOT);
    const nodes = await this.hydrateNodes(registry);
    await forEachSequential(nodes, async (node) => {
      if (!node.stale) {
        return;
      }
      if ((node.staleMs || 0) <= FRONTEND_RETENTION_MS) {
        return;
      }
      await this.redis
        .multi()
        .hdel(FRONTEND_REGISTRY_REDIS_SLOT, node.nodeId)
        .hdel(REGISTRY_REDIS_SLOT, node.nodeId)
        .del(getLiveKey(node.nodeId))
        .exec();
    });
  }
  private readonly logBackgroundTaskFailure = (label: string, error: unknown) => {
    const message = error instanceof Error ? error.message : 'unknown error';
    this.logger.warn(`Pulse background task failed (${label}): ${message}`);
  };
  private readonly runBackgroundTask = (label: string, task: () => Promise<void>) => {
    void task().catch((error: unknown) => this.logBackgroundTaskFailure(label, error));
  };
  private async getRecentIncidents(): Promise<PulseIncident[]> {
    const raw = await this.redis.lrange(INCIDENTS_REDIS_SLOT, 0, INCIDENT_LIMIT - 1);
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
      .lpush(INCIDENTS_REDIS_SLOT, payload)
      .ltrim(INCIDENTS_REDIS_SLOT, 0, INCIDENT_LIMIT - 1)
      .publish(
        'alerts',
        JSON.stringify({
          type: 'PULSE_INCIDENT',
          ...incident,
        }),
      )
      .exec();
    await sendAlertWebhook(this.config, this.logger, incident);
  }
}
