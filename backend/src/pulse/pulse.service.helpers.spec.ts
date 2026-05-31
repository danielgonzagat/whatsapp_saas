import {
  DEFAULT_BACKEND_TTL_MS,
  DEFAULT_FRONTEND_TTL_MS,
  DEFAULT_WORKER_TTL_MS,
} from './pulse.service.contract';
import {
  buildBackendHeartbeatSignals,
  buildBackendHeartbeatSummary,
  buildFrontendHeartbeatSignals,
  buildFrontendHeartbeatSummary,
  buildFrontendNodeId,
  buildIncidentId,
  buildOrganismStateResponse,
  buildRecoveryIncidentInput,
  buildStaleIncidentSummary,
  deriveFrontendHeartbeatStatus,
  pickBackendHeartbeatVersion,
  projectProductionSnapshot,
  resolveInternalHeartbeatTtlMs,
} from './pulse.service.helpers';

describe('pulse.service.helpers', () => {
  describe('deriveFrontendHeartbeatStatus', () => {
    it('returns DOWN when the surface is offline', () => {
      expect(deriveFrontendHeartbeatStatus({ online: false, visible: true })).toBe('DOWN');
      expect(deriveFrontendHeartbeatStatus({ online: false, visible: false })).toBe('DOWN');
    });

    it('returns UP when the surface is online and visible', () => {
      expect(deriveFrontendHeartbeatStatus({ online: true, visible: true })).toBe('UP');
    });

    it('returns DEGRADED when the surface is online but hidden', () => {
      expect(deriveFrontendHeartbeatStatus({ online: true, visible: false })).toBe('DEGRADED');
    });

    it('treats missing online as DOWN', () => {
      expect(deriveFrontendHeartbeatStatus({})).toBe('DOWN');
    });
  });

  describe('buildFrontendHeartbeatSummary', () => {
    it('formats the UP summary with the route', () => {
      expect(buildFrontendHeartbeatSummary('UP', '/inbox')).toBe(
        'Frontend surface active on /inbox.',
      );
    });

    it('formats the DEGRADED summary with the route', () => {
      expect(buildFrontendHeartbeatSummary('DEGRADED', '/dashboard')).toBe(
        'Frontend session open but hidden on /dashboard.',
      );
    });

    it('formats the DOWN summary with the route', () => {
      expect(buildFrontendHeartbeatSummary('DOWN', '/checkout')).toBe(
        'Frontend session offline on /checkout.',
      );
    });
  });

  describe('buildFrontendNodeId', () => {
    it('builds nodeId with trimmed workspace prefix', () => {
      expect(buildFrontendNodeId('  workspace-abc  ', 'sess-1')).toBe(
        'frontend:workspace-abc:sess-1',
      );
    });

    it('falls back to "unknown" for blank workspaceId', () => {
      expect(buildFrontendNodeId('   ', 'sess-2')).toBe('frontend:unknown:sess-2');
      expect(buildFrontendNodeId('', 'sess-3')).toBe('frontend:unknown:sess-3');
    });
  });

  describe('resolveInternalHeartbeatTtlMs', () => {
    it('honors an explicit ttlMs value', () => {
      expect(resolveInternalHeartbeatTtlMs({ role: 'backend', ttlMs: 999 })).toBe(999);
    });

    it('falls back to backend default for backend role', () => {
      expect(resolveInternalHeartbeatTtlMs({ role: 'backend' })).toBe(DEFAULT_BACKEND_TTL_MS);
    });

    it('falls back to worker default for worker role', () => {
      expect(resolveInternalHeartbeatTtlMs({ role: 'worker' })).toBe(DEFAULT_WORKER_TTL_MS);
    });

    it('falls back to frontend default for frontend role', () => {
      expect(resolveInternalHeartbeatTtlMs({ role: 'frontend' })).toBe(DEFAULT_FRONTEND_TTL_MS);
    });

    it('falls back to backend default for scanner role', () => {
      expect(resolveInternalHeartbeatTtlMs({ role: 'scanner' })).toBe(DEFAULT_BACKEND_TTL_MS);
    });
  });

  describe('buildBackendHeartbeatSummary', () => {
    it('formats UP summary', () => {
      expect(buildBackendHeartbeatSummary('UP')).toBe('Backend heartbeat healthy.');
    });

    it('formats DOWN summary', () => {
      expect(buildBackendHeartbeatSummary('DOWN')).toBe(
        'Backend heartbeat detected a hard dependency down.',
      );
    });

    it('formats DEGRADED summary', () => {
      expect(buildBackendHeartbeatSummary('DEGRADED')).toBe(
        'Backend heartbeat detected degraded integrations.',
      );
    });
  });

  describe('buildBackendHeartbeatSignals', () => {
    it('rounds uptime and memory to whole units and surfaces dependency statuses', () => {
      const signals = buildBackendHeartbeatSignals({
        trigger: 'interval',
        uptimeSec: 12.7,
        memory: { rss: 256 * 1024 * 1024, heapUsed: 128 * 1024 * 1024 },
        detail: {
          database: { status: 'UP' },
          redis: { status: 'UP' },
          whatsapp: { status: 'DEGRADED' },
          worker: { status: 'DOWN' },
          storage: { status: 'UP' },
        },
      });
      expect(signals).toEqual({
        trigger: 'interval',
        uptimeSec: 13,
        memoryRssMb: 256,
        memoryHeapUsedMb: 128,
        databaseStatus: 'UP',
        redisStatus: 'UP',
        whatsappStatus: 'DEGRADED',
        workerStatus: 'DOWN',
        storageStatus: 'UP',
      });
    });

    it('coerces missing dependency statuses to "unknown"', () => {
      const signals = buildBackendHeartbeatSignals({
        trigger: 'startup',
        uptimeSec: 0,
        memory: { rss: 0, heapUsed: 0 },
        detail: {},
      });
      expect(signals.databaseStatus).toBe('unknown');
      expect(signals.redisStatus).toBe('unknown');
      expect(signals.whatsappStatus).toBe('unknown');
      expect(signals.workerStatus).toBe('unknown');
      expect(signals.storageStatus).toBe('unknown');
      expect(signals.trigger).toBe('startup');
    });
  });

  describe('buildFrontendHeartbeatSignals', () => {
    it('surfaces visibility, viewport and connection metadata', () => {
      const signals = buildFrontendHeartbeatSignals({
        visible: true,
        online: true,
        viewport: { width: 1280, height: 720 },
        connectionType: 'wifi',
      });
      expect(signals).toEqual({
        visible: true,
        online: true,
        viewportWidth: 1280,
        viewportHeight: 720,
        connectionType: 'wifi',
      });
    });

    it('coerces missing viewport and connectionType to null', () => {
      const signals = buildFrontendHeartbeatSignals({ visible: false, online: false });
      expect(signals).toEqual({
        visible: false,
        online: false,
        viewportWidth: null,
        viewportHeight: null,
        connectionType: null,
      });
    });
  });

  describe('buildRecoveryIncidentInput', () => {
    it('emits an UP recovery incident with the role in the summary', () => {
      const result = buildRecoveryIncidentInput({
        nodeId: 'backend:host-1',
        role: 'backend',
        observedAt: '2026-05-28T10:00:00.000Z',
        critical: true,
      });
      expect(result).toEqual({
        nodeId: 'backend:host-1',
        role: 'backend',
        status: 'UP',
        summary: 'backend recovered and is healthy again.',
        observedAt: '2026-05-28T10:00:00.000Z',
        source: 'pulse_recovery',
        critical: true,
      });
    });

    it('attaches workspaceId and surface only when present', () => {
      const withExtras = buildRecoveryIncidentInput({
        nodeId: 'frontend:ws:sess',
        role: 'frontend',
        observedAt: '2026-05-28T10:00:00.000Z',
        critical: false,
        workspaceId: 'ws-1',
        surface: '/inbox',
      });
      expect(withExtras.workspaceId).toBe('ws-1');
      expect(withExtras.surface).toBe('/inbox');

      const withoutExtras = buildRecoveryIncidentInput({
        nodeId: 'frontend:ws:sess',
        role: 'frontend',
        observedAt: '2026-05-28T10:00:00.000Z',
        critical: false,
      });
      expect('workspaceId' in withoutExtras).toBe(false);
      expect('surface' in withoutExtras).toBe(false);
    });
  });

  describe('buildStaleIncidentSummary', () => {
    it('formats the stale duration in seconds', () => {
      expect(buildStaleIncidentSummary('worker', 90_000)).toBe(
        'worker heartbeat went stale after 90s without refresh.',
      );
    });

    it('handles zero stale duration', () => {
      expect(buildStaleIncidentSummary('backend', 0)).toBe(
        'backend heartbeat went stale after 0s without refresh.',
      );
    });
  });

  describe('buildIncidentId', () => {
    it('encodes the timestamp in base36 suffixed to the nodeId', () => {
      const id = buildIncidentId('backend:host-1', 1_700_000_000_000);
      expect(id).toBe(`backend:host-1:${(1_700_000_000_000).toString(36)}`);
    });

    it('uses Date.now() when no explicit timestamp is provided', () => {
      const before = Date.now();
      const id = buildIncidentId('node:x');
      const after = Date.now();
      const suffix = id.split(':').pop() as string;
      const parsed = parseInt(suffix, 36);
      expect(parsed).toBeGreaterThanOrEqual(before);
      expect(parsed).toBeLessThanOrEqual(after);
    });
  });

  describe('pickBackendHeartbeatVersion', () => {
    it('returns the first 12 chars of a long SHA', () => {
      expect(pickBackendHeartbeatVersion('a'.repeat(40))).toBe('aaaaaaaaaaaa');
    });

    it('returns the full short SHA when shorter than 12 chars', () => {
      expect(pickBackendHeartbeatVersion('abc1234')).toBe('abc1234');
    });

    it('returns undefined for missing or empty SHA', () => {
      expect(pickBackendHeartbeatVersion(undefined)).toBeUndefined();
      expect(pickBackendHeartbeatVersion('')).toBeUndefined();
    });
  });

  describe('projectProductionSnapshot', () => {
    it('projects the snapshot to the response shape used by getOrganismState', () => {
      const snapshot = {
        status: 'READY',
        machineReadiness: { score: 100 },
        canonicalDir: '/path/to/pulse',
        missingArtifacts: [],
        staleArtifacts: ['stale-1'],
        authorityMode: 'autonomous-execution',
        directive: { generatedAt: '2026-05-28T00:00:00.000Z' },
        certificate: { generatedAt: '2026-05-27T00:00:00.000Z' },
        convergencePlan: { generatedAt: '2026-05-26T00:00:00.000Z' },
      };
      const result = projectProductionSnapshot(snapshot, ['action-1', 'action-2']);
      expect(result).toEqual({
        status: 'READY',
        machineReadiness: { score: 100 },
        canonicalDir: '/path/to/pulse',
        missingArtifacts: [],
        staleArtifacts: ['stale-1'],
        directiveGeneratedAt: '2026-05-28T00:00:00.000Z',
        certificateGeneratedAt: '2026-05-27T00:00:00.000Z',
        convergenceGeneratedAt: '2026-05-26T00:00:00.000Z',
        topActions: ['action-1', 'action-2'],
      });
    });
  });

  describe('buildOrganismStateResponse', () => {
    const baseCircuit = {
      status: 'UP' as const,
      summary: 'organism nominal',
      freshNodes: 3,
      staleNodes: 0,
      roleCounts: { backend: 1, worker: 1, frontend: 1 },
      freshness: {
        newestObservedAt: '2026-05-28T10:00:00.000Z',
        oldestObservedAt: '2026-05-28T09:00:00.000Z',
        maxStaleMs: 0,
      },
    };

    const baseProductionSnapshot = {
      status: 'READY',
      machineReadiness: {},
      canonicalDir: '/p',
      missingArtifacts: [],
      staleArtifacts: [],
      directiveGeneratedAt: null,
      certificateGeneratedAt: null,
      convergenceGeneratedAt: null,
      topActions: [],
    };

    it('composes the response object from already-derived parts', () => {
      const response = buildOrganismStateResponse({
        circuit: baseCircuit,
        registeredNodes: 3,
        incidentCount: 1,
        authorityMode: 'autonomous-execution',
        advice: { level: 'nominal' },
        productionSnapshot: baseProductionSnapshot,
        nodes: [{ nodeId: 'backend:1' }],
        incidents: [{ incidentId: 'i:1' }],
        generatedAt: '2026-05-28T11:00:00.000Z',
      });
      expect(response).toEqual({
        status: 'UP',
        summary: 'organism nominal',
        generatedAt: '2026-05-28T11:00:00.000Z',
        authorityMode: 'autonomous-execution',
        circulation: {
          registeredNodes: 3,
          freshNodes: 3,
          staleNodes: 0,
          incidentCount: 1,
          roleCounts: { backend: 1, worker: 1, frontend: 1 },
        },
        freshness: baseCircuit.freshness,
        advice: { level: 'nominal' },
        productionSnapshot: baseProductionSnapshot,
        nodes: [{ nodeId: 'backend:1' }],
        incidents: [{ incidentId: 'i:1' }],
      });
    });

    it('defaults generatedAt to the current time when not provided', () => {
      const before = Date.now();
      const response = buildOrganismStateResponse({
        circuit: baseCircuit,
        registeredNodes: 0,
        incidentCount: 0,
        authorityMode: 'advisory',
        advice: { level: 'watch' },
        productionSnapshot: baseProductionSnapshot,
        nodes: [],
        incidents: [],
      });
      const after = Date.now();
      const generatedMs = Date.parse(response.generatedAt);
      expect(generatedMs).toBeGreaterThanOrEqual(before);
      expect(generatedMs).toBeLessThanOrEqual(after);
    });
  });
});
