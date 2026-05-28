import {
  buildConversationStatusFilter,
  buildContactSearchOr,
  buildInspectSelfWorkQueue,
  buildProductSearchClause,
  buildRailwayDeploymentsQuery,
  buildRevenueWindow,
  buildSelfRuntimeSnapshot,
  buildVercelDeploymentsUrl,
  computeCognitiveGaps,
  computeRevenueSummary,
  getRailwayRuntimeConfig,
  getVercelRuntimeConfig,
  normalizeIdentityAudience,
  parseRailwayDeploymentResponse,
  parseVercelDeploymentResponse,
  readOptionalNum,
  readOptionalStr,
  runtimeErrorMessage,
  selectSilentSurfaces,
  type DissolutionGapLike,
} from './mind-capability-executor.helpers';

describe('mind-capability-executor.helpers', () => {
  describe('readOptionalNum', () => {
    it('returns floored integer when value is a positive finite number', () => {
      expect(readOptionalNum(12.7, 1)).toBe(12);
      expect(readOptionalNum(3, 1)).toBe(3);
    });

    it('parses numeric strings', () => {
      expect(readOptionalNum('25', 1)).toBe(25);
      expect(readOptionalNum('25.9', 1)).toBe(25);
    });

    it('falls back when value is zero, negative, NaN, Infinity, or undefined', () => {
      expect(readOptionalNum(0, 7)).toBe(7);
      expect(readOptionalNum(-5, 7)).toBe(7);
      expect(readOptionalNum(Number.NaN, 7)).toBe(7);
      expect(readOptionalNum(Number.POSITIVE_INFINITY, 7)).toBe(7);
      expect(readOptionalNum(undefined, 7)).toBe(7);
      expect(readOptionalNum(null, 7)).toBe(7);
    });

    it('falls back when value is a non-numeric string or non-coercible type', () => {
      expect(readOptionalNum('abc', 9)).toBe(9);
      expect(readOptionalNum({}, 9)).toBe(9);
      // Number([]) === 0 falls back, Number([5]) === 5 does not.
      expect(readOptionalNum(['x', 'y'], 9)).toBe(9);
    });

    it('coerces JS-truthy primitives via Number() (documents the contract)', () => {
      // Number(true) === 1 and Number([5]) === 5 — both positive finite, so
      // they are accepted. This is the documented behavior of readOptionalNum:
      // it trusts the Number() coercion. Callers must validate type first if
      // they need stricter input.
      expect(readOptionalNum(true, 9)).toBe(1);
      expect(readOptionalNum([5], 9)).toBe(5);
    });
  });

  describe('readOptionalStr', () => {
    it('returns the trimmed string when value is a non-empty string', () => {
      expect(readOptionalStr('  hello  ')).toBe('hello');
      expect(readOptionalStr('keep')).toBe('keep');
    });

    it('falls back to empty string by default for empty, whitespace, or non-string values', () => {
      expect(readOptionalStr('')).toBe('');
      expect(readOptionalStr('   ')).toBe('');
      expect(readOptionalStr(undefined)).toBe('');
      expect(readOptionalStr(null)).toBe('');
      expect(readOptionalStr(42)).toBe('');
      expect(readOptionalStr({})).toBe('');
    });

    it('respects an explicit fallback', () => {
      expect(readOptionalStr('', 'default')).toBe('default');
      expect(readOptionalStr(undefined, 'default')).toBe('default');
      expect(readOptionalStr('   ', 'default')).toBe('default');
    });
  });

  describe('computeCognitiveGaps', () => {
    it('returns cognitive_state_unavailable when abi is null, undefined, or non-object', () => {
      expect(computeCognitiveGaps(null)).toEqual(['cognitive_state_unavailable']);
      expect(computeCognitiveGaps(undefined)).toEqual(['cognitive_state_unavailable']);
      expect(computeCognitiveGaps('a string')).toEqual(['cognitive_state_unavailable']);
      expect(computeCognitiveGaps(42)).toEqual(['cognitive_state_unavailable']);
    });

    it('returns an empty list when every checked array is populated and lineage is intact', () => {
      const abi = {
        capabilities: { available: [{ id: 'x' }] },
        beliefs: [{ id: 'b' }],
        memory: {
          workingMemory: [{ id: 'w' }],
          episodicRefs: [{ id: 'e' }],
          consolidatedRefs: [{ id: 'c' }],
        },
        predictions: { active: [{ id: 'p' }] },
        perception: { recentSalientEvents: [{ id: 's' }] },
        lineage: { status: 'intact' },
        pulseTruth: { certificationVerdict: 'PASS' },
      };
      // top-level capabilities is the array form; with the nested-array seeded
      // above the top-level still needs to be a non-empty array for the
      // `[capabilities]` check.
      // Replace with combined fixture covering both branches:
      const populated = {
        ...abi,
        capabilities: [{ id: 'top' }, { id: 'top-2' }],
      };
      expect(computeCognitiveGaps(populated)).toEqual([]);
    });

    it('flags every empty-array path with its canonical label', () => {
      const abi = {
        capabilities: [],
        beliefs: [],
        memory: { workingMemory: [], episodicRefs: [], consolidatedRefs: [] },
        predictions: { active: [] },
        perception: { recentSalientEvents: [] },
      };
      const gaps = computeCognitiveGaps(abi);
      expect(gaps).toEqual(
        expect.arrayContaining([
          'no_capabilities_declared',
          'no_beliefs_formed',
          'working_memory_empty',
          'no_episodic_memory',
          'no_consolidated_memory',
          'no_active_predictions',
          'perception_loop_silent',
        ]),
      );
    });

    it('flags nested capabilities.available emptiness independently of top-level capabilities', () => {
      const abi = {
        capabilities: { available: [] },
      };
      const gaps = computeCognitiveGaps(abi);
      expect(gaps).toContain('no_capabilities_available');
    });

    it('skips paths that simply do not exist on the abi object', () => {
      const abi = { capabilities: [{ id: 'x' }] };
      const gaps = computeCognitiveGaps(abi);
      // Paths that don't exist are not flagged (only empty arrays are).
      expect(gaps).not.toContain('no_capabilities_declared');
    });

    it('appends a lineage_<status> gap when lineage.status is a non-intact string', () => {
      expect(computeCognitiveGaps({ lineage: { status: 'compromised' } })).toContain(
        'lineage_compromised',
      );
      expect(computeCognitiveGaps({ lineage: { status: 'fractured' } })).toContain(
        'lineage_fractured',
      );
    });

    it('does not append a lineage gap when lineage.status is intact or non-string', () => {
      const gapsIntact = computeCognitiveGaps({ lineage: { status: 'intact' } });
      expect(gapsIntact.some((g) => g.startsWith('lineage_'))).toBe(false);

      const gapsNumeric = computeCognitiveGaps({ lineage: { status: 7 } });
      expect(gapsNumeric.some((g) => g.startsWith('lineage_'))).toBe(false);
    });

    it('appends a lowercased pulse gap when pulseTruth.certificationVerdict is non-PASS', () => {
      expect(
        computeCognitiveGaps({ pulseTruth: { certificationVerdict: 'NOT_CERTIFIED' } }),
      ).toContain('pulse_not_certified');
      expect(computeCognitiveGaps({ pulseTruth: { certificationVerdict: 'FAIL' } })).toContain(
        'pulse_fail',
      );
    });

    it('does not append a pulse gap when verdict is PASS or non-string', () => {
      const gapsPass = computeCognitiveGaps({ pulseTruth: { certificationVerdict: 'PASS' } });
      expect(gapsPass.some((g) => g.startsWith('pulse_'))).toBe(false);

      const gapsMissing = computeCognitiveGaps({ pulseTruth: { certificationVerdict: 42 } });
      expect(gapsMissing.some((g) => g.startsWith('pulse_'))).toBe(false);
    });

    it('combines empty-array flags with lineage and pulse flags into a single list', () => {
      const gaps = computeCognitiveGaps({
        beliefs: [],
        lineage: { status: 'broken' },
        pulseTruth: { certificationVerdict: 'CRITICAL' },
      });
      expect(gaps).toEqual(
        expect.arrayContaining(['no_beliefs_formed', 'lineage_broken', 'pulse_critical']),
      );
    });
  });

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

    it('returns null when any required env var is missing or empty', () => {
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

  describe('normalizeIdentityAudience', () => {
    it('returns each known audience unchanged', () => {
      expect(normalizeIdentityAudience('public')).toBe('public');
      expect(normalizeIdentityAudience('technical')).toBe('technical');
      expect(normalizeIdentityAudience('origin')).toBe('origin');
      expect(normalizeIdentityAudience('internal')).toBe('internal');
    });

    it('falls back to "internal" for unknown or non-string values', () => {
      expect(normalizeIdentityAudience('admin')).toBe('internal');
      expect(normalizeIdentityAudience('')).toBe('internal');
      expect(normalizeIdentityAudience(undefined)).toBe('internal');
      expect(normalizeIdentityAudience(null)).toBe('internal');
      expect(normalizeIdentityAudience(42)).toBe('internal');
      expect(normalizeIdentityAudience({})).toBe('internal');
    });
  });

  describe('buildInspectSelfWorkQueue', () => {
    const dissolution: readonly DissolutionGapLike[] = [
      { surface: 'alpha', status: 'silent' },
      { surface: 'beta', status: 'dissolved' },
      { surface: 'gamma', status: 'partial' },
      { surface: 'delta', status: 'silent' },
    ];

    it('preserves gaps first, then silent dissolves, then partial emits', () => {
      expect(buildInspectSelfWorkQueue(['gap_a', 'gap_b'], dissolution)).toEqual([
        'gap_a',
        'gap_b',
        'dissolve_surface:alpha',
        'dissolve_surface:delta',
        'emit_canonical_events:gamma',
      ]);
    });

    it('returns just the gaps when nothing in dissolution needs work', () => {
      expect(buildInspectSelfWorkQueue(['x'], [{ surface: 'beta', status: 'dissolved' }])).toEqual([
        'x',
      ]);
    });

    it('returns an empty queue when both inputs are empty', () => {
      expect(buildInspectSelfWorkQueue([], [])).toEqual([]);
    });
  });

  describe('selectSilentSurfaces', () => {
    it('returns surfaces that are not yet dissolved', () => {
      const dissolution: readonly DissolutionGapLike[] = [
        { surface: 'alpha', status: 'silent' },
        { surface: 'beta', status: 'dissolved' },
        { surface: 'gamma', status: 'partial' },
      ];
      expect(selectSilentSurfaces(dissolution)).toEqual(['alpha', 'gamma']);
    });

    it('returns empty when every surface has dissolved', () => {
      expect(
        selectSilentSurfaces([
          { surface: 'alpha', status: 'dissolved' },
          { surface: 'beta', status: 'dissolved' },
        ]),
      ).toEqual([]);
    });

    it('returns empty for an empty input', () => {
      expect(selectSilentSurfaces([])).toEqual([]);
    });
  });

  describe('computeRevenueSummary', () => {
    it('derives totals, rounded ticket and conversion for a typical period', () => {
      expect(
        computeRevenueSummary({
          sumTotalInCents: 12_345,
          avgTotalInCents: 411.5,
          totalCount: 30,
          paidCount: 9,
          periodDays: 7,
        }),
      ).toEqual({
        totalRevenue: 12_345,
        ticketMedio: 412,
        totalCount: 30,
        paidCount: 9,
        conversao: 30,
        periodDays: 7,
      });
    });

    it('falls back to zero when Prisma returns null aggregates', () => {
      expect(
        computeRevenueSummary({
          sumTotalInCents: null,
          avgTotalInCents: null,
          totalCount: 0,
          paidCount: 0,
          periodDays: 30,
        }),
      ).toEqual({
        totalRevenue: 0,
        ticketMedio: 0,
        totalCount: 0,
        paidCount: 0,
        conversao: 0,
        periodDays: 30,
      });
    });

    it('rounds conversion to two decimals', () => {
      const summary = computeRevenueSummary({
        sumTotalInCents: 1000,
        avgTotalInCents: 100,
        totalCount: 3,
        paidCount: 1,
        periodDays: 1,
      });
      expect(summary.conversao).toBe(33.33);
    });
  });

  describe('buildRevenueWindow', () => {
    const now = new Date('2026-05-15T12:34:56.000Z');

    it('clamps absurd values within [1, 365] and normalises midnight', () => {
      const window = buildRevenueWindow(10_000, 30, 365, now);
      expect(window.days).toBe(365);
      expect(window.start.getHours()).toBe(0);
      expect(window.start.getMinutes()).toBe(0);
      expect(window.start.getSeconds()).toBe(0);
      expect(window.start.getMilliseconds()).toBe(0);
    });

    it('uses the default when the input is missing or invalid', () => {
      expect(buildRevenueWindow(undefined, 30, 365, now).days).toBe(30);
      expect(buildRevenueWindow('not-a-number', 30, 365, now).days).toBe(30);
      expect(buildRevenueWindow(-5, 30, 365, now).days).toBe(30);
    });

    it('honours small positive values', () => {
      expect(buildRevenueWindow(7, 30, 365, now).days).toBe(7);
    });
  });

  describe('buildProductSearchClause', () => {
    it('returns undefined when no search term is supplied', () => {
      expect(buildProductSearchClause(undefined)).toBeUndefined();
      expect(buildProductSearchClause('')).toBeUndefined();
    });

    it('builds a case-insensitive contains clause when a term is supplied', () => {
      expect(buildProductSearchClause('Curso')).toEqual({
        name: { contains: 'Curso', mode: 'insensitive' },
      });
    });
  });

  describe('buildContactSearchOr', () => {
    it('builds matchers for name, phone and email', () => {
      expect(buildContactSearchOr('joao')).toEqual([
        { name: { contains: 'joao', mode: 'insensitive' } },
        { phone: { contains: 'joao' } },
        { email: { contains: 'joao', mode: 'insensitive' } },
      ]);
    });
  });

  describe('buildConversationStatusFilter', () => {
    it('matches open conversations when "open"', () => {
      expect(buildConversationStatusFilter('open')).toEqual({ status: { not: 'closed' } });
    });

    it('matches closed conversations when "closed"', () => {
      expect(buildConversationStatusFilter('closed')).toEqual({ status: 'closed' });
    });

    it('returns an empty fragment for "all" or unknown values', () => {
      expect(buildConversationStatusFilter('all')).toEqual({});
      expect(buildConversationStatusFilter(undefined)).toEqual({});
      expect(buildConversationStatusFilter('mystery')).toEqual({});
    });
  });
});
