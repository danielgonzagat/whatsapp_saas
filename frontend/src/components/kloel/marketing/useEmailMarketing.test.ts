import { act, renderHook } from '@testing-library/react';
import useSWR, { mutate } from 'swr';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('swr', () => ({
  default: vi.fn(),
  mutate: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from '@/lib/api';

import type { EmailCampaign } from './MarketingTypes';
import { useEmailMarketing } from './useEmailMarketing';

const apiFetchMock = vi.mocked(apiFetch);
const mutateMock = vi.mocked(mutate);
const useSWRMock = vi.mocked(useSWR);

function makeCampaign(id = 'campaign-1'): EmailCampaign {
  return {
    id,
    workspaceId: 'workspace-1',
    name: 'Campanha',
    subject: 'Assunto',
    htmlBody: '<p>Oi</p>',
    fromEmail: null,
    fromName: null,
    replyTo: null,
    status: 'DRAFT',
    totalRecipients: 1,
    sentCount: 0,
    deliveredCount: 0,
    openedCount: 0,
    clickedCount: 0,
    repliedCount: 0,
    failedCount: 0,
    bouncedCount: 0,
    unsubscribedCount: 0,
    provider: null,
    scheduledAt: null,
    startedAt: null,
    completedAt: null,
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
  };
}

beforeEach(() => {
  apiFetchMock.mockReset();
  mutateMock.mockReset();
  useSWRMock.mockReset();
  useSWRMock.mockReturnValue({
    data: [],
    error: undefined,
    isLoading: false,
    mutate: vi.fn(),
    isValidating: false,
  });
});

describe('useEmailMarketing', () => {
  it('surfaces email campaign list backend errors to SWR instead of returning an empty list', async () => {
    useSWRMock.mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: true,
      mutate: vi.fn(),
      isValidating: false,
    });
    apiFetchMock.mockResolvedValue({ error: 'email provider offline', status: 503 });

    renderHook(() => useEmailMarketing({ connectionStatus: null }));

    const [, fetcher] = useSWRMock.mock.calls[0];
    await expect((fetcher as (key: string) => Promise<unknown>)('/marketing/email/campaigns')).rejects.toThrow(
      'email provider offline',
    );
  });

  it('does not refresh campaigns when create campaign returns an API error envelope', async () => {
    const mutateCampaigns = vi.fn();
    useSWRMock.mockReturnValue({
      data: [],
      error: undefined,
      isLoading: false,
      mutate: mutateCampaigns,
      isValidating: false,
    });
    apiFetchMock.mockResolvedValue({ error: 'invalid recipients', status: 400 });

    const { result } = renderHook(() => useEmailMarketing({ connectionStatus: null }));

    await expect(
      result.current.createCampaign({
        name: 'Campanha',
        subject: 'Assunto',
        htmlBody: '<p>Oi</p>',
        recipients: [{ email: 'cliente@example.com' }],
      }),
    ).rejects.toThrow('invalid recipients');
    expect(mutateCampaigns).not.toHaveBeenCalled();
  });

  it('does not refresh campaigns when send campaign returns an API error envelope', async () => {
    const mutateCampaigns = vi.fn();
    useSWRMock.mockReturnValue({
      data: [],
      error: undefined,
      isLoading: false,
      mutate: mutateCampaigns,
      isValidating: false,
    });
    apiFetchMock.mockResolvedValue({ error: 'provider rejected send', status: 502 });

    const { result } = renderHook(() => useEmailMarketing({ connectionStatus: null }));

    await expect(result.current.sendCampaign('campaign-1')).rejects.toThrow('provider rejected send');
    expect(mutateCampaigns).not.toHaveBeenCalled();
  });

  it('refreshes campaigns after a confirmed create campaign mutation', async () => {
    const mutateCampaigns = vi.fn();
    const campaign = makeCampaign();
    useSWRMock.mockReturnValue({
      data: [],
      error: undefined,
      isLoading: false,
      mutate: mutateCampaigns,
      isValidating: false,
    });
    apiFetchMock.mockResolvedValue({ data: { campaign, message: 'created' }, status: 201 });

    const { result } = renderHook(() => useEmailMarketing({ connectionStatus: null }));

    await expect(
      result.current.createCampaign({
        name: 'Campanha',
        subject: 'Assunto',
        htmlBody: '<p>Oi</p>',
        recipients: [{ email: 'cliente@example.com' }],
      }),
    ).resolves.toEqual(campaign);
    expect(mutateCampaigns).toHaveBeenCalledTimes(1);
  });

  it('keeps the composer in failure state and avoids global refresh when quick send creation fails', async () => {
    apiFetchMock.mockResolvedValue({ error: 'invalid recipients', status: 400 });

    const { result } = renderHook(() =>
      useEmailMarketing({
        connectionStatus: { channels: { email: { connected: true } } },
        defaultRecipientEmail: 'cliente@example.com',
      }),
    );

    act(() => {
      result.current.setEmailSubject('Assunto');
      result.current.setEmailBody('<p>Oi</p>');
    });
    await act(async () => {
      await result.current.handleSend();
    });

    expect(result.current.emailResult).toEqual({ sent: 0, failed: 1 });
    expect(mutateMock).not.toHaveBeenCalled();
  });
});
