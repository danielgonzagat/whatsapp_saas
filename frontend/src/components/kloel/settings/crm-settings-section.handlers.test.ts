import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({
  getPresets: vi.fn(),
  getStats: vi.fn(),
  listContacts: vi.fn(),
  listDeals: vi.fn(),
  listPipelines: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  crmApi: {
    listContacts: apiMocks.listContacts,
    listDeals: apiMocks.listDeals,
    listPipelines: apiMocks.listPipelines,
  },
  segmentationApi: {
    getPresets: apiMocks.getPresets,
    getStats: apiMocks.getStats,
  },
}));

import { fetchCrmInitialData } from './crm-settings-section.handlers';

const contact = { id: 'contact-1', phone: '+5511999999999', name: 'Contato Real', tags: [] };
const pipeline = { id: 'pipeline-1', name: 'Pipeline Real', stages: [] };
const deal = { id: 'deal-1', title: 'Deal Real', contactId: 'contact-1', stageId: 'stage-1', value: 9900 };
const preset = { id: 'preset-1', name: 'Preset Real', criteria: {} };
const stats = { totalContacts: 1, segments: [] };

function mockValidResponses() {
  apiMocks.listContacts.mockResolvedValue({ data: { data: [contact] } });
  apiMocks.listPipelines.mockResolvedValue({ data: [pipeline] });
  apiMocks.listDeals.mockResolvedValue({ data: [deal] });
  apiMocks.getPresets.mockResolvedValue({ data: { presets: [preset] } });
  apiMocks.getStats.mockResolvedValue({ data: stats });
}

describe('fetchCrmInitialData', () => {
  beforeEach(() => {
    Object.values(apiMocks).forEach((mock) => mock.mockReset());
    mockValidResponses();
  });

  it('loads valid CRM lists without rewriting their payloads', async () => {
    const data = await fetchCrmInitialData();

    expect(data.contacts).toEqual([contact]);
    expect(data.pipelines).toEqual([pipeline]);
    expect(data.deals).toEqual([deal]);
    expect(data.presets).toEqual([preset]);
    expect(data.stats).toEqual(stats);
  });

  it('rejects malformed contacts payloads instead of returning an empty list', async () => {
    apiMocks.listContacts.mockResolvedValue({ data: { data: { id: 'contact-1' } } });

    await expect(fetchCrmInitialData()).rejects.toThrow('Payload de contatos CRM invalido.');
  });

  it('rejects malformed pipeline and deal payloads instead of returning empty lists', async () => {
    apiMocks.listPipelines.mockResolvedValue({ data: { id: 'pipeline-1' } });
    await expect(fetchCrmInitialData()).rejects.toThrow('Payload de pipelines CRM invalido.');

    mockValidResponses();
    apiMocks.listDeals.mockResolvedValue({ data: { id: 'deal-1' } });
    await expect(fetchCrmInitialData()).rejects.toThrow('Payload de deals CRM invalido.');
  });

  it('rejects malformed preset payloads instead of returning an empty list', async () => {
    apiMocks.getPresets.mockResolvedValue({ data: { presets: { id: 'preset-1' } } });

    await expect(fetchCrmInitialData()).rejects.toThrow('Payload de presets CRM invalido.');
  });
});
