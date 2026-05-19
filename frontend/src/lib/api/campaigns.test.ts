import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  listCampaigns,
  createCampaign,
  launchCampaign,
  pauseCampaign,
  createCampaignVariants,
  evaluateCampaignDarwin,
} from './campaigns';

const { apiFetch } = vi.hoisted(() => ({
  apiFetch: vi.fn(),
}));

vi.mock('./core', () => ({
  apiFetch,
}));

vi.mock('swr', () => ({
  mutate: vi.fn(),
}));

describe('listCampaigns', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns campaigns array on success', async () => {
    const campaigns = [{ id: 'c1', name: 'Test' }];
    apiFetch.mockResolvedValueOnce({ data: campaigns, status: 200 });
    const result = await listCampaigns('ws1');
    expect(result).toEqual(campaigns);
    expect(apiFetch).toHaveBeenCalledWith('/campaigns?workspaceId=ws1');
  });

  it('unwraps campaigns wrapper when response is wrapped', async () => {
    apiFetch.mockResolvedValueOnce({
      data: { campaigns: [{ id: 'c1', name: 'Wrapped' }] },
      status: 200,
    });
    const result = await listCampaigns('ws1');
    expect(result).toEqual([{ id: 'c1', name: 'Wrapped' }]);
  });

  it('returns empty array when campaigns is missing in wrapped response', async () => {
    apiFetch.mockResolvedValueOnce({ data: {}, status: 200 });
    const result = await listCampaigns('ws1');
    expect(result).toEqual([]);
  });

  it('throws on error', async () => {
    apiFetch.mockResolvedValueOnce({ error: 'Forbidden', status: 403 });
    await expect(listCampaigns('ws1')).rejects.toThrow('Forbidden');
  });
});

describe('createCampaign', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sends POST and returns campaign on success', async () => {
    apiFetch.mockResolvedValueOnce({ data: { id: 'c1', name: 'New' }, status: 201 });
    const result = await createCampaign('ws1', { name: 'New' });
    expect(result).toEqual({ id: 'c1', name: 'New' });
    expect(apiFetch).toHaveBeenCalledWith('/campaigns', {
      method: 'POST',
      body: { workspaceId: 'ws1', name: 'New' },
    });
  });

  it('throws on error', async () => {
    apiFetch.mockResolvedValueOnce({ error: 'Validation Error', status: 422 });
    await expect(createCampaign('ws1', {})).rejects.toThrow('Validation Error');
  });
});

describe('launchCampaign', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sends launch POST and returns result on success', async () => {
    apiFetch.mockResolvedValueOnce({ data: { ok: true }, status: 200 });
    const result = await launchCampaign('ws1', 'c1');
    expect(result).toEqual({ ok: true });
    expect(apiFetch).toHaveBeenCalledWith('/campaigns/c1/launch', {
      method: 'POST',
      body: { workspaceId: 'ws1', smartTime: false },
    });
  });

  it('passes smartTime option when enabled', async () => {
    apiFetch.mockResolvedValueOnce({ data: {}, status: 200 });
    await launchCampaign('ws1', 'c1', { smartTime: true });
    expect(apiFetch).toHaveBeenCalledWith('/campaigns/c1/launch', {
      method: 'POST',
      body: { workspaceId: 'ws1', smartTime: true },
    });
  });

  it('throws on error', async () => {
    apiFetch.mockResolvedValueOnce({ error: 'Conflict', status: 409 });
    await expect(launchCampaign('ws1', 'c1')).rejects.toThrow('Conflict');
  });
});

describe('pauseCampaign', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sends pause POST and returns result on success', async () => {
    apiFetch.mockResolvedValueOnce({ data: { ok: true }, status: 200 });
    const result = await pauseCampaign('ws1', 'c1');
    expect(result).toEqual({ ok: true });
    expect(apiFetch).toHaveBeenCalledWith('/campaigns/c1/pause', {
      method: 'POST',
      body: { workspaceId: 'ws1' },
    });
  });

  it('throws on error', async () => {
    apiFetch.mockResolvedValueOnce({ error: 'Not Found', status: 404 });
    await expect(pauseCampaign('ws1', 'missing')).rejects.toThrow('Not Found');
  });
});

describe('createCampaignVariants', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sends variant creation and returns count on success', async () => {
    apiFetch.mockResolvedValueOnce({ data: { created: 3, variantIds: ['v1', 'v2', 'v3'] }, status: 200 });
    const result = await createCampaignVariants('ws1', 'c1', 3);
    expect(result).toEqual({ created: 3, variantIds: ['v1', 'v2', 'v3'] });
    expect(apiFetch).toHaveBeenCalledWith('/campaigns/c1/darwin/variants', {
      method: 'POST',
      body: { workspaceId: 'ws1', variants: 3 },
    });
  });

  it('throws on error', async () => {
    apiFetch.mockResolvedValueOnce({ error: 'Error', status: 500 });
    await expect(createCampaignVariants('ws1', 'c1')).rejects.toThrow('Error');
  });
});

describe('evaluateCampaignDarwin', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sends evaluate POST and returns result on success', async () => {
    apiFetch.mockResolvedValueOnce({ data: { winner: 'v1' }, status: 200 });
    const result = await evaluateCampaignDarwin('ws1', 'c1');
    expect(result).toEqual({ winner: 'v1' });
    expect(apiFetch).toHaveBeenCalledWith('/campaigns/c1/darwin/evaluate', {
      method: 'POST',
      body: { workspaceId: 'ws1' },
    });
  });

  it('throws on error', async () => {
    apiFetch.mockResolvedValueOnce({ error: 'Not Ready', status: 400 });
    await expect(evaluateCampaignDarwin('ws1', 'c1')).rejects.toThrow('Not Ready');
  });
});
