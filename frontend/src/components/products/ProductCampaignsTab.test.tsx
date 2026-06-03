import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type CampaignRow = {
  id: string;
  name: string;
  status: string;
  [key: string]: unknown;
};

const apiMocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  apiFetch: apiMocks.apiFetch,
}));

vi.mock('./ProductCampaignList', () => ({
  ProductCampaignList: ({
    campaigns,
    onDelete,
  }: {
    campaigns: CampaignRow[];
    onDelete: (campaign: CampaignRow) => void;
  }) => (
    <div data-testid="campaign-list">
      {campaigns.length === 0 ? (
        <span>SEM CAMPANHAS</span>
      ) : (
        campaigns.map((campaign) => (
          <div key={campaign.id}>
            <span>{campaign.name}</span>
            <button
              type="button"
              aria-label={`Excluir ${campaign.name}`}
              onClick={() => onDelete(campaign)}
            >
              X
            </button>
          </div>
        ))
      )}
    </div>
  ),
}));

vi.mock('./ProductCampaignDeleteModal', () => ({
  ProductCampaignDeleteModal: ({
    campaignPendingDelete,
    onConfirm,
    onCancel,
  }: {
    campaignPendingDelete: CampaignRow | null;
    onConfirm: () => void;
    onCancel: () => void;
  }) =>
    campaignPendingDelete ? (
      <div role="dialog">
        <span>{campaignPendingDelete.name}</span>
        <button type="button" onClick={onConfirm}>
          Excluir
        </button>
        <button type="button" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    ) : null,
}));

vi.mock('./ProductCampaignLinkModal', () => ({
  ProductCampaignLinkModal: () => null,
}));

vi.mock('./ProductCampaignCreateModal', () => ({
  ProductCampaignCreateModal: () => null,
}));

import { ProductCampaignsTab } from './ProductCampaignsTab';

const campaign = {
  id: 'campaign-1',
  name: 'Campanha Real',
  status: 'ACTIVE',
  sentCount: 3,
  deliveredCount: 2,
  readCount: 1,
  failedCount: 0,
  repliedCount: 0,
};

beforeEach(() => {
  apiMocks.apiFetch.mockReset();
});

describe('ProductCampaignsTab', () => {
  it('surfaces invalid campaign payloads instead of rendering a fake empty campaign list', async () => {
    apiMocks.apiFetch.mockResolvedValueOnce({ data: { campaigns: [] } });

    render(<ProductCampaignsTab productId="prod-1" />);

    await waitFor(() =>
      expect(screen.queryByText('Payload de campanhas invalido.')).not.toBeNull(),
    );

    expect(screen.queryByText('SEM CAMPANHAS')).toBeNull();
  });

  it('keeps loaded campaigns visible when a post-delete refresh returns a backend error', async () => {
    apiMocks.apiFetch
      .mockResolvedValueOnce({ data: [campaign] })
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ error: 'refresh failed' });

    render(<ProductCampaignsTab productId="prod-1" />);

    expect(await screen.findByText('Campanha Real')).not.toBeNull();
    fireEvent.click(screen.getByLabelText('Excluir Campanha Real'));
    fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));

    await waitFor(() => expect(screen.queryByText('refresh failed')).not.toBeNull());

    expect(screen.queryByText('Campanha Real')).not.toBeNull();
  });
});
