import { describe, it, expect, vi, beforeEach } from 'vitest';
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
  authHeaders: vi.fn((token?: string) =>
    token ? { authorization: `Bearer ${token}` } : {},
  ),
  buildQuery: vi.fn(
    (params: Record<string, string | number | boolean | undefined | null>) => {
      const qs = Object.entries(params)
        .filter(([, v]) => v !== undefined && v !== null)
        .map(([k, v]) => `${k}=${String(v)}`)
        .join('&');
      return qs ? `?${qs}` : '';
    },
  ),
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
    await expect(getAutopilotPipeline('ws1')).rejects.toThrow(
      'Failed to fetch autopilot pipeline',
    );
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
    await expect(getAutopilotActions('ws1')).rejects.toThrow(
      'Failed to fetch autopilot actions',
    );
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
    await expect(runAutopilot({ workspaceId: 'ws1' })).rejects.toThrow(
      'Failed to run autopilot',
    );
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
