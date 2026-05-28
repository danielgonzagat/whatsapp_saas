import {
  buildRailwayDeploymentsQuery,
  buildSelfRuntimeSnapshot,
  buildVercelDeploymentsUrl,
  getRailwayRuntimeConfig,
  getVercelRuntimeConfig,
  parseRailwayDeploymentResponse,
  parseVercelDeploymentResponse,
  runtimeErrorMessage,
} from './mind-capability-executor.helpers';

describe('mind-capability-executor.helpers (runtime)', () => {
  describe('buildSelfRuntimeSnapshot', () => {
    it('rounds memory to whole MB and uptime to whole seconds', () => {
      const snapshot = buildSelfRuntimeSnapshot({
        memoryUsage: { rss: 1048576 * 25 + 100, heapUsed: 1048576 * 10 - 100 },
        nodeVersion: 'v20.10.0',
        uptimeSeconds: 12.6,
        nodeEnv: 'production',
      });
      expect(snapshot).toEqual({
        nodeVersion: 'v20.10.0',
        uptimeSeconds: 13,
        rssMb: 25,
        heapUsedMb: 10,
        env: 'production',
      });
    });

    it('falls back to "unknown" when nodeEnv is undefined', () => {
      const snapshot = buildSelfRuntimeSnapshot({
        memoryUsage: { rss: 0, heapUsed: 0 },
        nodeVersion: 'v20.0.0',
        uptimeSeconds: 0,
        nodeEnv: undefined,
      });
      expect(snapshot.env).toBe('unknown');
    });
  });

  describe('getRailwayRuntimeConfig', () => {
    it('returns the full config when every required env var is present', () => {
      const config = getRailwayRuntimeConfig({
        RAILWAY_TOKEN: 't',
        RAILWAY_PROJECT_ID: 'p',
        RAILWAY_ENV_ID: 'e',
        RAILWAY_BACKEND_SERVICE_ID: 's',
      });
      expect(config).toEqual({ token: 't', projectId: 'p', envId: 'e', serviceId: 's' });
    });

    it('returns null when each required env var is missing or empty', () => {
      expect(getRailwayRuntimeConfig({})).toBeNull();
      expect(
        getRailwayRuntimeConfig({
          RAILWAY_TOKEN: 't',
          RAILWAY_PROJECT_ID: 'p',
          RAILWAY_ENV_ID: 'e',
        }),
      ).toBeNull();
      expect(
        getRailwayRuntimeConfig({
          RAILWAY_TOKEN: '',
          RAILWAY_PROJECT_ID: 'p',
          RAILWAY_ENV_ID: 'e',
          RAILWAY_BACKEND_SERVICE_ID: 's',
        }),
      ).toBeNull();
    });
  });

  describe('buildRailwayDeploymentsQuery', () => {
    it('embeds the project/env/service ids into a single-line GraphQL query', () => {
      const q = buildRailwayDeploymentsQuery({ projectId: 'p1', envId: 'e1', serviceId: 's1' });
      expect(q.query).toContain('projectId:"p1"');
      expect(q.query).toContain('environmentId:"e1"');
      expect(q.query).toContain('serviceId:"s1"');
      expect(q.query).toContain('first:1');
    });
  });

  describe('parseRailwayDeploymentResponse', () => {
    it('returns status+createdAt when an edge node is present', () => {
      const result = parseRailwayDeploymentResponse({
        data: {
          deployments: {
            edges: [{ node: { status: 'SUCCESS', createdAt: '2026-05-28T00:00:00Z' } }],
          },
        },
      });
      expect(result).toEqual({
        configured: true,
        status: 'SUCCESS',
        createdAt: '2026-05-28T00:00:00Z',
      });
    });

    it('returns status:"unknown" when the edges array is empty or missing', () => {
      expect(parseRailwayDeploymentResponse({ data: { deployments: { edges: [] } } })).toEqual({
        configured: true,
        status: 'unknown',
      });
      expect(parseRailwayDeploymentResponse({})).toEqual({
        configured: true,
        status: 'unknown',
      });
      expect(parseRailwayDeploymentResponse(null)).toEqual({
        configured: true,
        status: 'unknown',
      });
    });
  });

  describe('getVercelRuntimeConfig', () => {
    it('returns config with teamId when present', () => {
      const config = getVercelRuntimeConfig({
        VERCEL_TOKEN: 't',
        VERCEL_PROJECT_ID: 'p',
        VERCEL_TEAM_ID: 'team',
      });
      expect(config).toEqual({ token: 't', projectId: 'p', teamId: 'team' });
    });

    it('returns config without teamId when team is absent', () => {
      const config = getVercelRuntimeConfig({
        VERCEL_TOKEN: 't',
        VERCEL_PROJECT_ID: 'p',
      });
      expect(config).toEqual({ token: 't', projectId: 'p' });
    });

    it('returns null when token or projectId is missing', () => {
      expect(getVercelRuntimeConfig({})).toBeNull();
      expect(getVercelRuntimeConfig({ VERCEL_TOKEN: 't' })).toBeNull();
      expect(getVercelRuntimeConfig({ VERCEL_PROJECT_ID: 'p' })).toBeNull();
    });
  });

  describe('buildVercelDeploymentsUrl', () => {
    it('builds a production-scoped url with limit=1', () => {
      const url = buildVercelDeploymentsUrl({ projectId: 'p1' });
      expect(url).toBe(
        'https://api.vercel.com/v6/deployments?projectId=p1&target=production&limit=1',
      );
    });

    it('appends teamId when provided', () => {
      const url = buildVercelDeploymentsUrl({ projectId: 'p1', teamId: 'team-x' });
      expect(url).toContain('&teamId=team-x');
    });
  });

  describe('parseVercelDeploymentResponse', () => {
    it('returns state+createdAt aliased from `created` when a deployment is present', () => {
      const result = parseVercelDeploymentResponse({
        deployments: [{ state: 'READY', created: 1234567 }],
      });
      expect(result).toEqual({ configured: true, state: 'READY', createdAt: 1234567 });
    });

    it('returns state:"unknown" when no deployment is present', () => {
      expect(parseVercelDeploymentResponse({ deployments: [] })).toEqual({
        configured: true,
        state: 'unknown',
      });
      expect(parseVercelDeploymentResponse({})).toEqual({
        configured: true,
        state: 'unknown',
      });
      expect(parseVercelDeploymentResponse(null)).toEqual({
        configured: true,
        state: 'unknown',
      });
    });
  });

  describe('runtimeErrorMessage', () => {
    it('returns the message when the value is an Error', () => {
      expect(runtimeErrorMessage(new Error('boom'), 'fallback')).toBe('boom');
    });

    it('returns the fallback for non-Error values', () => {
      expect(runtimeErrorMessage('boom', 'fallback')).toBe('fallback');
      expect(runtimeErrorMessage(null, 'fb')).toBe('fb');
      expect(runtimeErrorMessage(undefined, 'fb')).toBe('fb');
      expect(runtimeErrorMessage({ message: 'x' }, 'fb')).toBe('fb');
    });
  });
});
