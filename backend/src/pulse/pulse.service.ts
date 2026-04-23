import * as os from 'node:os';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { InjectRedis } from '@nestjs-modules/ioredis';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { forEachSequential } from '../common/async-sequence';
import type { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { validateNoInternalAccess } from '../common/utils/url-validator';
import { SystemHealthService } from '../health/system-health.service';
import { PulseFrontendHeartbeatDto } from './dto/frontend-heartbeat.dto';
import { PulseInternalHeartbeatDto } from './dto/internal-heartbeat.dto';
import {
  CRITICAL_REGISTRY_REDIS_SLOT,
  DEFAULT_ARTIFACT_MAX_AGE_MS,
  DEFAULT_BACKEND_TTL_MS,
  DEFAULT_FRONTEND_PRUNE_SWEEP_MS,
  DEFAULT_FRONTEND_TTL_MS,
  DEFAULT_HEARTBEAT_INTERVAL_MS,
  DEFAULT_STALE_SWEEP_MS,
  DEFAULT_WORKER_TTL_MS,
  FRONTEND_REGISTRY_REDIS_SLOT,
  FRONTEND_RETENTION_MS,
  INCIDENTS_REDIS_SLOT,
  INCIDENT_LIMIT,
  REGISTRY_REDIS_SLOT,
  type PulseAdviceLevel,
  type PulseArtifactPayload,
  type PulseHeartbeatRecord,
  type PulseIncident,
  type PulseOrganismNode,
  type PulseOrganismRole,
  type PulseOrganismStatus,
} from './pulse.service.contract';
import { compactText, safeJsonParse, toOrganismStatus } from './pulse.service.utils';
/** Pulse service. */
@Injectable()
export class PulseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PulseService.name);
  private readonly captureStartupHeartbeatTask = () => this.captureBackendHeartbeat('startup');
  private readonly captureIntervalHeartbeatTask = () => this.captureBackendHeartbeat('interval');
  private readonly detectCriticalStaleNodesTask = () => this.detectStaleNodes();
  private readonly pruneExpiredFrontendNodesTask = () => this.pruneExpiredFrontendNodes();
  private readonly emitIntervalHeartbeat = () =>
    this.runBackgroundTask('backend heartbeat interval', this.captureIntervalHeartbeatTask);
  private readonly emitCriticalStaleSweep = () =>
    this.runBackgroundTask('critical stale sweep', this.detectCriticalStaleNodesTask);
  private readonly emitFrontendPrune = () =>
    this.runBackgroundTask('frontend stale prune', this.pruneExpiredFrontendNodesTask);
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private staleSweepTimer: ReturnType<typeof setInterval> | null = null;
  private frontendPruneTimer: ReturnType<typeof setInterval> | null = null;
  constructor(
    @InjectRedis() private readonly redis: Redis,
    private readonly systemHealth: SystemHealthService,
    private readonly config: ConfigService,
  ) {}
  /** On module init. */
  onModuleInit() {
    if (process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID) {
      return;
    }
    const everyMs = this.getBackendHeartbeatEveryMs();
    const frontendPruneEveryMs = this.getFrontendPruneSweepEveryMs();
    this.runBackgroundTask('backend heartbeat startup', this.captureStartupHeartbeatTask);
    this.heartbeatTimer = setInterval(this.emitIntervalHeartbeat, everyMs);
    this.staleSweepTimer = setInterval(this.emitCriticalStaleSweep, this.getStaleSweepEveryMs());
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
      version: payload.version,
      workspaceId: payload.workspaceId,
      surface: payload.surface,
      signals: payload.signals || {},
    });
  }
  /** Capture backend heartbeat. */
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
    } catch (error) {
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
    const productionSnapshot = this.getProductionSnapshot();
    const directiveData = productionSnapshot.directive.data as { nextWork?: unknown[] } | null;
    const convergenceData = productionSnapshot.convergencePlan.data as { queue?: unknown[] } | null;
    const nextWork =
      Array.isArray(directiveData?.nextWork) && directiveData.nextWork.length > 0
        ? directiveData.nextWork.slice(0, 5)
        : Array.isArray(convergenceData?.queue)
          ? convergenceData.queue.slice(0, 5)
          : [];
    return {
      status,
      summary,
      generatedAt: new Date().toISOString(),
      authorityMode: productionSnapshot.authorityMode,
      circulation: {
        registeredNodes: nodeIds.length,
        freshNodes: freshNodes.length,
        staleNodes: staleNodes.length,
        incidentCount: incidents.length,
        roleCounts,
      },
      freshness,
      advice,
      productionSnapshot: {
        status: productionSnapshot.status,
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
    return this.readArtifactJson('PULSE_CLI_DIRECTIVE.json');
  }
  /** Get latest PULSE certificate artifact. */
  getLatestCertificate() {
    return this.readArtifactJson('PULSE_CERTIFICATE.json');
  }
  /** Get latest PULSE product vision artifact. */
  getLatestProductVision() {
    return this.readArtifactJson('PULSE_PRODUCT_VISION.json');
  }
  /** Get latest PULSE parity gaps artifact. */
  getLatestParityGaps() {
    return this.readArtifactJson('PULSE_PARITY_GAPS.json');
  }
  /** Get latest PULSE scope state artifact. */
  getLatestScopeState() {
    return this.readArtifactJson('PULSE_SCOPE_STATE.json');
  }
  /** Get latest PULSE codacy evidence artifact. */
  getLatestCodacyEvidence() {
    return this.readArtifactJson('PULSE_CODACY_EVIDENCE.json');
  }
  /** Get latest PULSE capability state artifact. */
  getLatestCapabilityState() {
    return this.readArtifactJson('PULSE_CAPABILITY_STATE.json');
  }
  /** Get latest PULSE flow projection artifact. */
  getLatestFlowProjection() {
    return this.readArtifactJson('PULSE_FLOW_PROJECTION.json');
  }
  /** Get latest PULSE convergence plan artifact. */
  getLatestConvergencePlan() {
    return this.readArtifactJson('PULSE_CONVERGENCE_PLAN.json');
  }
  /** Get latest PULSE external signal artifact. */
  getLatestExternalSignalState() {
    return this.readArtifactJson('PULSE_EXTERNAL_SIGNAL_STATE.json');
  }
  /** Get latest PULSE autonomy-state artifact. */
  getLatestAutonomyState() {
    return this.readArtifactJson('PULSE_AUTONOMY_STATE.json');
  }
  /** Get latest PULSE agent-orchestration-state artifact. */
  getLatestAgentOrchestrationState() {
    return this.readArtifactJson('PULSE_AGENT_ORCHESTRATION_STATE.json');
  }
  /** Get latest production-oriented PULSE snapshot. */
  getProductionSnapshot() {
    const directive = this.getLatestDirective();
    const certificate = this.getLatestCertificate();
    const productVision = this.getLatestProductVision();
    const parityGaps = this.getLatestParityGaps();
    const scopeState = this.getLatestScopeState();
    const codacyEvidence = this.getLatestCodacyEvidence();
    const capabilityState = this.getLatestCapabilityState();
    const flowProjection = this.getLatestFlowProjection();
    const externalSignalState = this.getLatestExternalSignalState();
    const autonomyState = this.getLatestAutonomyState();
    const agentOrchestrationState = this.getLatestAgentOrchestrationState();
    const convergencePlan = this.getLatestConvergencePlan();
    const artifactIndex = this.readArtifactJson('PULSE_ARTIFACT_INDEX.json');
    const artifacts = [
      directive,
      certificate,
      productVision,
      parityGaps,
      scopeState,
      codacyEvidence,
      capabilityState,
      flowProjection,
      externalSignalState,
      autonomyState,
      agentOrchestrationState,
      convergencePlan,
      artifactIndex,
    ];
    const missingArtifacts = artifacts
      .filter((artifact) => artifact.freshness === 'missing')
      .map((artifact) => artifact.artifact);
    const staleArtifacts = artifacts
      .filter((artifact) => artifact.freshness === 'stale')
      .map((artifact) => artifact.artifact);
    const status: 'ready' | 'degraded' | 'empty' = artifacts.every(
      (artifact) => artifact.freshness === 'missing',
    )
      ? 'empty'
      : missingArtifacts.length > 0 || staleArtifacts.length > 0
        ? 'degraded'
        : 'ready';
    const certData = certificate.data as { humanReplacementStatus?: string } | null;
    const authorityMode: 'advisory-only' | 'autonomous' =
      certData?.humanReplacementStatus === 'READY' ? 'autonomous' : 'advisory-only';
    return {
      status,
      authorityMode,
      generatedAt: new Date().toISOString(),
      canonicalDir: this.getArtifactCanonicalDir(),
      summary:
        status === 'ready'
          ? 'PULSE runtime snapshot is fresh and ready for production consumption.'
          : status === 'empty'
            ? 'No canonical PULSE artifacts were found for runtime consumption yet.'
            : `PULSE runtime snapshot is degraded: missing=${missingArtifacts.length}, stale=${staleArtifacts.length}.`,
      missingArtifacts,
      staleArtifacts,
      directive,
      certificate,
      productVision,
      parityGaps,
      scopeState,
      codacyEvidence,
      capabilityState,
      flowProjection,
      externalSignalState,
      autonomyState,
      agentOrchestrationState,
      convergencePlan,
      artifactIndex,
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
    const pipeline = this.redis.multi();
    pipeline
      .set(liveKey, JSON.stringify(record), 'PX', record.ttlMs)
      .hset(REGISTRY_REDIS_SLOT, record.nodeId, JSON.stringify(record))
      .del(this.getStaleAlertKey(record.nodeId));
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
    if (nodeIds.length === 0) {
      return [];
    }
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
        staleMs,
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
        .del(this.getLiveKey(node.nodeId))
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
    await this.sendAlertWebhook(incident);
  }
  private async sendAlertWebhook(incident: PulseIncident) {
    const webhookUrl = this.getAlertWebhookUrl();
    if (!webhookUrl) {
      return;
    }
    try {
      // SSRF protection: validate env-configured webhook URL before use
      validateNoInternalAccess(webhookUrl);
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
  private getFrontendPruneSweepEveryMs() {
    const raw = Number.parseInt(process.env.PULSE_FRONTEND_PRUNE_MS || '', 10);
    if (Number.isFinite(raw) && raw >= 60_000) {
      return raw;
    }
    return DEFAULT_FRONTEND_PRUNE_SWEEP_MS;
  }
  private getLiveKey(nodeId: string) {
    return `pulse:organism:live:${nodeId}`;
  }
  private getStaleAlertKey(nodeId: string) {
    return `pulse:organism:stale-alert:${nodeId}`;
  }
  private getNodeSuffix() {
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
  private inferRole(nodeId: string): PulseOrganismRole {
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
  private getArtifactRootDir() {
    const configured =
      this.config.get<string>('PULSE_ARTIFACT_ROOT') || this.config.get<string>('APP_ROOT_DIR');
    if (configured) {
      return configured;
    }
    return this.detectArtifactRootDir(process.cwd());
  }
  private getArtifactCanonicalDir() {
    return path.join(this.getArtifactRootDir(), '.pulse', 'current');
  }
  private detectArtifactRootDir(startDir: string) {
    let current = path.resolve(startDir);
    while (true) {
      const hasPulseRunner = fs.existsSync(path.join(current, 'scripts', 'pulse', 'run.js'));
      const hasRootPackage = fs.existsSync(path.join(current, 'package.json'));
      const hasBackendDir = fs.existsSync(path.join(current, 'backend'));
      if (hasPulseRunner && hasRootPackage && hasBackendDir) {
        return current;
      }
      const parent = path.dirname(current);
      if (parent === current) {
        return path.resolve(startDir);
      }
      current = parent;
    }
  }
  private getArtifactMaxAgeMs() {
    const configured = Number.parseInt(
      String(this.config.get<string>('PULSE_ARTIFACT_MAX_AGE_MS') || ''),
      10,
    );
    if (Number.isFinite(configured) && configured >= 60_000) {
      return configured;
    }
    return DEFAULT_ARTIFACT_MAX_AGE_MS;
  }
  private readArtifactJson<T = Record<string, unknown>>(
    artifactName: string,
  ): PulseArtifactPayload<T> {
    const targetPath = path.join(this.getArtifactCanonicalDir(), artifactName);
    if (!fs.existsSync(targetPath)) {
      return {
        artifact: artifactName,
        path: targetPath,
        freshness: 'missing',
        generatedAt: null,
        staleMs: null,
        data: null,
        error: 'artifact_not_found',
      };
    }
    try {
      const raw = fs.readFileSync(targetPath, 'utf8');
      const data = JSON.parse(raw) as T & { generatedAt?: string; timestamp?: string };
      const generatedAt = String(data.generatedAt || data.timestamp || '').trim() || null;
      const generatedAtMs = generatedAt ? Date.parse(generatedAt) : Number.NaN;
      const staleMs = Number.isFinite(generatedAtMs)
        ? Math.max(Date.now() - generatedAtMs, 0)
        : null;
      const freshness =
        generatedAt && staleMs !== null && staleMs <= this.getArtifactMaxAgeMs()
          ? 'fresh'
          : 'stale';
      return {
        artifact: artifactName,
        path: targetPath,
        freshness,
        generatedAt,
        staleMs,
        data,
      };
    } catch (error) {
      return {
        artifact: artifactName,
        path: targetPath,
        freshness: 'missing',
        generatedAt: null,
        staleMs: null,
        data: null,
        error: error instanceof Error ? error.message : 'artifact_read_failed',
      };
    }
  }
}
