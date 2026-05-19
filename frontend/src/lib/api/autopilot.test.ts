import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getAutopilotStatus,
  toggleAutopilot,
  getAutopilotConfig,
  updateAutopilotConfig,
  getAutopilotStats,
  getAutopilotImpact,
  getAutopilotPipeline,
  runAutopilotSmokeTest,
  getSystemHealth,
  getAutopilotActions,
  retryAutopilotContact,
  markAutopilotConversion,
  runAutopilot,
  activateMoneyMachine,
  askAutopilotInsights,
  sendAutopilotDirectMessage,
  getAutopilotRuntimeConfig,
} from './autopilot';

const { apiFetch } = vi.hoisted(() => ({
  apiFetch: vi.fn(),
}));

vi.mock('./core', () => ({
  apiFetch,
  authHeaders: vi.fn((token?: string) => (token ? { authorization: `Bearer ${token}` } : {})),
  buildQuery: vi.fn((params: Record<string, string | number | boolean | undefined | null>) => {
    const qs = Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]) => `${k}=${String(v)}`)
      .join('&');
    return qs ? `?${qs}` : '';
  }),
}));

vi.mock('swr', () => ({
  mutate: vi.fn(),
}));

const statusMock = { active: true, running: false };
const configMock = { conversionFlowId: 'f1', currencyDefault: 'BRL' };
const statsMock = { contacts: 100, conversions: 5 };
const impactMock = { revenue: 5000 };
const pipelineMock = { stages: [] };
const smokeMock = { passed: true };
const healthMock = { status: 'UP' };
const actionsMock = [{ createdAt: '2026-01-01', contactId: 'c1', intent: 'purchase' }];

describe('getAutopilotStatus', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns status on success', async () => {
    apiFetch.mockResolvedValueOnce({ data: statusMock, status: 200 });
    const result = await getAutopilotStatus('ws1');
    expect(result).toEqual(statusMock);
    expect(apiFetch).toHaveBeenCalledWith(expect.stringContaining('/autopilot/status'));
  });

  it('throws on failure', async () => {
    apiFetch.mockResolvedValueOnce({ error: 'Down', status: 503 });
    await expect(getAutopilotStatus('ws1')).rejects.toThrow('Failed to fetch autopilot status');
  });
});

describe('toggleAutopilot', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sends toggle and returns status on success', async () => {
    apiFetch.mockResolvedValueOnce({ data: statusMock, status: 200 });
    const result = await toggleAutopilot('ws1', true);
    expect(result).toEqual(statusMock);
    expect(apiFetch).toHaveBeenCalledWith('/autopilot/toggle', {
      method: 'POST',
      body: { workspaceId: 'ws1', enabled: true },
    });
  });

  it('throws on failure', async () => {
    apiFetch.mockResolvedValueOnce({ error: 'Forbidden', status: 403 });
    await expect(toggleAutopilot('ws1', false)).rejects.toThrow('Failed to toggle autopilot');
  });
});

describe('getAutopilotConfig', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns config on success', async () => {
    apiFetch.mockResolvedValueOnce({ data: configMock, status: 200 });
    const result = await getAutopilotConfig('ws1');
    expect(result).toEqual(configMock);
  });

  it('throws on failure', async () => {
    apiFetch.mockResolvedValueOnce({ error: 'Error', status: 500 });
    await expect(getAutopilotConfig('ws1')).rejects.toThrow('Failed to fetch autopilot config');
  });
});

describe('updateAutopilotConfig', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sends update and returns config on success', async () => {
    apiFetch.mockResolvedValueOnce({ data: configMock, status: 200 });
    const result = await updateAutopilotConfig('ws1', configMock);
    expect(result).toEqual(configMock);
    expect(apiFetch).toHaveBeenCalledWith('/autopilot/config', {
      method: 'POST',
      body: { workspaceId: 'ws1', ...configMock },
    });
  });

  it('throws on failure', async () => {
    apiFetch.mockResolvedValueOnce({ error: 'Bad Request', status: 400 });
    await expect(updateAutopilotConfig('ws1', {})).rejects.toThrow(
      'Failed to update autopilot config',
    );
  });
});

describe('getAutopilotStats', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns stats on success', async () => {
    apiFetch.mockResolvedValueOnce({ data: statsMock, status: 200 });
    const result = await getAutopilotStats('ws1');
    expect(result).toEqual(statsMock);
  });

  it('throws on failure', async () => {
    apiFetch.mockResolvedValueOnce({ error: 'Error', status: 500 });
    await expect(getAutopilotStats('ws1')).rejects.toThrow('Failed to fetch autopilot stats');
  });
});

describe('getAutopilotImpact', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns impact on success', async () => {
    apiFetch.mockResolvedValueOnce({ data: impactMock, status: 200 });
    const result = await getAutopilotImpact('ws1');
    expect(result).toEqual(impactMock);
  });

  it('throws on failure', async () => {
    apiFetch.mockResolvedValueOnce({ error: 'Error', status: 500 });
    await expect(getAutopilotImpact('ws1')).rejects.toThrow('Failed to fetch autopilot impact');
  });
});

describe('getAutopilotPipeline', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns pipeline on success', async () => {
    apiFetch.mockResolvedValueOnce({ data: pipelineMock, status: 200 });
    const result = await getAutopilotPipeline('ws1');
    expect(result).toEqual(pipelineMock);
  });

  it('throws on failure', async () => {
    apiFetch.mockResolvedValueOnce({ error: 'Error', status: 500 });
    await expect(getAutopilotPipeline('ws1')).rejects.toThrow('Failed to fetch autopilot pipeline');
  });
});

describe('runAutopilotSmokeTest', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sends test params and returns result on success', async () => {
    apiFetch.mockResolvedValueOnce({ data: smokeMock, status: 200 });
    const result = await runAutopilotSmokeTest({
      workspaceId: 'ws1',
      phone: '+55119',
      message: 'test',
      waitMs: 3000,
      liveSend: false,
    });
    expect(result).toEqual(smokeMock);
  });

  it('throws on failure', async () => {
    apiFetch.mockResolvedValueOnce({ error: 'Error', status: 500 });
    await expect(runAutopilotSmokeTest({ workspaceId: 'ws1' })).rejects.toThrow(
      'Failed to run autopilot smoke test',
    );
  });
});

describe('getSystemHealth', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns health on success', async () => {
    apiFetch.mockResolvedValueOnce({ data: healthMock, status: 200 });
    const result = await getSystemHealth();
    expect(result).toEqual(healthMock);
  });

  it('throws on failure', async () => {
    apiFetch.mockResolvedValueOnce({ error: 'Error', status: 500 });
    await expect(getSystemHealth()).rejects.toThrow('Failed to fetch system health');
  });
});

describe('getAutopilotActions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns actions on success', async () => {
    apiFetch.mockResolvedValueOnce({ data: actionsMock, status: 200 });
    const result = await getAutopilotActions('ws1');
    expect(result).toEqual(actionsMock);
  });

  it('returns empty array when data is nullish', async () => {
    apiFetch.mockResolvedValueOnce({ data: undefined, status: 200 });
    const result = await getAutopilotActions('ws1');
    expect(result).toEqual([]);
  });

  it('passes limit and status params', async () => {
    apiFetch.mockResolvedValueOnce({ data: [], status: 200 });
    await getAutopilotActions('ws1', { limit: 10, status: 'failed' });
    expect(apiFetch).toHaveBeenCalledWith(expect.stringContaining('limit=10'));
    expect(apiFetch).toHaveBeenCalledWith(expect.stringContaining('status=failed'));
  });

  it('throws on failure', async () => {
    apiFetch.mockResolvedValueOnce({ error: 'Error', status: 500 });
    await expect(getAutopilotActions('ws1')).rejects.toThrow('Failed to fetch autopilot actions');
  });
});

describe('retryAutopilotContact', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sends retry and returns result on success', async () => {
    apiFetch.mockResolvedValueOnce({ data: { ok: true }, status: 200 });
    const result = await retryAutopilotContact('ws1', 'c1');
    expect(result).toEqual({ ok: true });
  });

  it('throws on failure', async () => {
    apiFetch.mockResolvedValueOnce({ error: 'Error', status: 500 });
    await expect(retryAutopilotContact('ws1', 'c1')).rejects.toThrow(
      'Failed to retry autopilot contact',
    );
  });
});

describe('markAutopilotConversion', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sends conversion and returns result on success', async () => {
    apiFetch.mockResolvedValueOnce({ data: { ok: true }, status: 200 });
    const result = await markAutopilotConversion({
      workspaceId: 'ws1',
      contactId: 'c1',
      reason: 'purchased',
    });
    expect(result).toEqual({ ok: true });
  });

  it('throws on failure', async () => {
    apiFetch.mockResolvedValueOnce({ error: 'Error', status: 500 });
    await expect(markAutopilotConversion({ workspaceId: 'ws1' })).rejects.toThrow(
      'Failed to mark conversion',
    );
  });
});

describe('runAutopilot', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sends run and returns result on success', async () => {
    apiFetch.mockResolvedValueOnce({ data: { ok: true }, status: 200 });
    const result = await runAutopilot({ workspaceId: 'ws1', phone: '+55119' });
    expect(result).toEqual({ ok: true });
  });

  it('throws on failure', async () => {
    apiFetch.mockResolvedValueOnce({ error: 'Error', status: 500 });
    await expect(runAutopilot({ workspaceId: 'ws1' })).rejects.toThrow('Failed to run autopilot');
  });
});

describe('activateMoneyMachine', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sends money machine activation and returns result', async () => {
    apiFetch.mockResolvedValueOnce({ data: { processed: 10 }, status: 200 });
    const result = await activateMoneyMachine({ workspaceId: 'ws1' });
    expect(result).toEqual({ processed: 10 });
  });

  it('uses defaults for optional params', async () => {
    apiFetch.mockResolvedValueOnce({ data: {}, status: 200 });
    await activateMoneyMachine({ workspaceId: 'ws1' });
    expect(apiFetch).toHaveBeenCalledWith('/autopilot/money-machine', {
      method: 'POST',
      body: { workspaceId: 'ws1', topN: 200, autoSend: false, smartTime: false },
    });
  });

  it('throws on failure', async () => {
    apiFetch.mockResolvedValueOnce({ error: 'Error', status: 500 });
    await expect(activateMoneyMachine({ workspaceId: 'ws1' })).rejects.toThrow('Error');
  });
});

describe('askAutopilotInsights', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sends question and returns answer on success', async () => {
    apiFetch.mockResolvedValueOnce({ data: { answer: 'Yes', question: '?' }, status: 200 });
    const result = await askAutopilotInsights('ws1', 'How many?');
    expect(result).toEqual({ answer: 'Yes', question: '?' });
  });

  it('throws on failure', async () => {
    apiFetch.mockResolvedValueOnce({ error: 'Error', status: 500 });
    await expect(askAutopilotInsights('ws1', '?')).rejects.toThrow('Error');
  });
});

describe('sendAutopilotDirectMessage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sends direct message and returns result on success', async () => {
    apiFetch.mockResolvedValueOnce({ data: { success: true, messageId: 'm1' }, status: 200 });
    const result = await sendAutopilotDirectMessage({
      workspaceId: 'ws1',
      contactId: 'c1',
      message: 'Hello',
    });
    expect(result).toEqual({ success: true, messageId: 'm1' });
  });

  it('throws on failure', async () => {
    apiFetch.mockResolvedValueOnce({ error: 'Error', status: 500 });
    await expect(
      sendAutopilotDirectMessage({ workspaceId: 'ws1', contactId: 'c1', message: 'x' }),
    ).rejects.toThrow('Error');
  });
});

describe('getAutopilotRuntimeConfig', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns runtime config on success', async () => {
    apiFetch.mockResolvedValueOnce({
      data: { autopilotEnabled: true, maxRetries: 3 },
      status: 200,
    });
    const result = await getAutopilotRuntimeConfig();
    expect(result).toEqual({ autopilotEnabled: true, maxRetries: 3 });
  });

  it('throws on failure', async () => {
    apiFetch.mockResolvedValueOnce({ error: 'Error', status: 500 });
    await expect(getAutopilotRuntimeConfig()).rejects.toThrow('Error');
  });
});

describe('deriveAutopilotMissions', () => {
  let deriveAutopilotMissions: (bundle: {
    status: { workspaceId: string; enabled: boolean; billingSuspended?: boolean } | null;
    stats: {
      errorsLast7d?: number;
      contactsTracked?: number;
      conversionsLast7d?: number;
      actionsLast7d?: number;
    } | null;
    impact: { replyRate?: number } | null;
    pipeline: {
      workspaceId: string;
      autonomy?: { whatsappStatus?: string; connected?: boolean };
    } | null;
    insights: { id?: string; createdAt?: string }[];
  }) => { id: string; title: string; severity: string; priority: boolean }[];

  beforeAll(async () => {
    const mod = await vi.importActual<typeof import('../../app/(main)/autopilot/page.helpers')>(
      '../../app/(main)/autopilot/page.helpers',
    );
    deriveAutopilotMissions = mod.deriveAutopilotMissions as typeof deriveAutopilotMissions;
  });

  it('returns empty array when all data is null', () => {
    const result = deriveAutopilotMissions({
      status: null,
      stats: null,
      impact: null,
      pipeline: null,
      insights: [],
    });
    expect(result).toEqual([]);
  });

  it('returns activation mission when autopilot is disabled', () => {
    const result = deriveAutopilotMissions({
      status: { workspaceId: 'ws1', enabled: false },
      stats: null,
      impact: null,
      pipeline: null,
      insights: [],
    });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('activate-autopilot');
    expect(result[0].priority).toBe(true);
    expect(result[0].severity).toBe('warning');
  });

  it('returns billing mission when billing is suspended', () => {
    const result = deriveAutopilotMissions({
      status: { workspaceId: 'ws1', enabled: true, billingSuspended: true },
      stats: null,
      impact: null,
      pipeline: null,
      insights: [],
    });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('resolve-billing');
    expect(result[0].severity).toBe('critical');
  });

  it('returns connect-whatsapp mission when whatsapp is down', () => {
    const result = deriveAutopilotMissions({
      status: null,
      stats: null,
      impact: null,
      pipeline: { workspaceId: 'ws1', autonomy: { whatsappStatus: 'DOWN', connected: false } },
      insights: [],
    });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('connect-whatsapp');
    expect(result[0].severity).toBe('critical');
  });

  it('returns check-whatsapp mission when whatsapp is degraded', () => {
    const result = deriveAutopilotMissions({
      status: null,
      stats: null,
      impact: null,
      pipeline: { workspaceId: 'ws1', autonomy: { whatsappStatus: 'DEGRADED', connected: true } },
      insights: [],
    });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('check-whatsapp');
    expect(result[0].severity).toBe('warning');
  });

  it('returns error review mission when errors exceed threshold', () => {
    const result = deriveAutopilotMissions({
      status: null,
      stats: { errorsLast7d: 5, contactsTracked: 0, conversionsLast7d: 0, actionsLast7d: 0 },
      impact: null,
      pipeline: null,
      insights: [],
    });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('review-errors');
  });

  it('does not return error mission when errors are few', () => {
    const result = deriveAutopilotMissions({
      status: null,
      stats: { errorsLast7d: 2, contactsTracked: 0, conversionsLast7d: 0, actionsLast7d: 0 },
      impact: null,
      pipeline: null,
      insights: [],
    });
    expect(result.find((m: { id: string }) => m.id === 'review-errors')).toBeUndefined();
  });

  it('returns conversion check mission when tracked contacts exist but no conversions', () => {
    const result = deriveAutopilotMissions({
      status: null,
      stats: { errorsLast7d: 0, contactsTracked: 10, conversionsLast7d: 0, actionsLast7d: 0 },
      impact: null,
      pipeline: null,
      insights: [],
    });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('check-conversion');
  });

  it('does not return conversion mission with fewer than 5 tracked contacts', () => {
    const result = deriveAutopilotMissions({
      status: null,
      stats: { errorsLast7d: 0, contactsTracked: 3, conversionsLast7d: 0, actionsLast7d: 0 },
      impact: null,
      pipeline: null,
      insights: [],
    });
    expect(result.find((m: { id: string }) => m.id === 'check-conversion')).toBeUndefined();
  });

  it('returns reply rate mission when rate is low with contacts tracked', () => {
    const result = deriveAutopilotMissions({
      status: null,
      stats: { errorsLast7d: 0, contactsTracked: 5, conversionsLast7d: 1, actionsLast7d: 0 },
      impact: { replyRate: 0.15 },
      pipeline: null,
      insights: [],
    });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('improve-reply-rate');
  });

  it('returns stale insights mission when latest insight is older than 2h', () => {
    const oldDate = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    const result = deriveAutopilotMissions({
      status: null,
      stats: null,
      impact: null,
      pipeline: null,
      insights: [{ createdAt: oldDate, id: 'i1' }],
    });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('insights-stale');
  });

  it('returns multiple missions when multiple conditions are met', () => {
    const result = deriveAutopilotMissions({
      status: { workspaceId: 'ws1', enabled: false },
      stats: { errorsLast7d: 7, contactsTracked: 0, conversionsLast7d: 0, actionsLast7d: 0 },
      impact: null,
      pipeline: null,
      insights: [],
    });
    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(result.map((m: { id: string }) => m.id).sort()).toEqual(
      ['activate-autopilot', 'review-errors'].sort(),
    );
  });
});
