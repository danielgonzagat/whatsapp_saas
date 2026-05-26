import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mutateMock = vi.fn();
const apiFetchMock = vi.fn();

vi.mock('swr', () => ({
  default: vi.fn(() => ({ data: undefined, error: undefined, isLoading: true, mutate: vi.fn() })),
  mutate: (arg: unknown) => mutateMock(arg),
}));

vi.mock('@/lib/fetcher', () => ({
  swrFetcher: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

import useSWR from 'swr';

import {
  approveAffiliate,
  createAffiliate,
  inviteCollaborator,
  removeCollaborator,
  revokeAffiliate,
  revokeInvite,
  sendPartnerMessage,
  updateCollaboratorRole,
  useAffiliateDetail,
  useAffiliates,
  useAffiliateStats,
  useCollaborators,
  useCollaboratorStats,
  usePartnerChatContacts,
  usePartnerMessages,
} from '../usePartnerships';

function mockSWR(overrides: Record<string, unknown> = {}) {
  vi.mocked(useSWR).mockReturnValue({
    data: undefined,
    error: undefined,
    isLoading: true,
    mutate: vi.fn(),
    isValidating: false,
    ...overrides,
  });
}

/* ─── useCollaborators ─────────────────────────────────────────────────── */

describe('useCollaborators', () => {
  beforeEach(() => {
    mockSWR();
  });

  it('returns empty arrays when loading', () => {
    const { result } = renderHook(() => useCollaborators());
    expect(result.current.agents).toEqual([]);
    expect(result.current.invites).toEqual([]);
    expect(result.current.isLoading).toBe(true);
  });

  it('returns agents and invites from data', () => {
    mockSWR({
      data: {
        agents: [{ id: 'a1', name: 'Agent 1' }],
        invites: [{ id: 'i1', email: 'invite@test.com' }],
      },
      isLoading: false,
    });

    const { result } = renderHook(() => useCollaborators());
    expect(result.current.agents).toEqual([{ id: 'a1', name: 'Agent 1' }]);
    expect(result.current.invites).toEqual([{ id: 'i1', email: 'invite@test.com' }]);
    expect(result.current.isLoading).toBe(false);
  });
});

/* ─── useCollaboratorStats ─────────────────────────────────────────────── */

describe('useCollaboratorStats', () => {
  it('returns default stats when data is undefined', () => {
    mockSWR({ data: undefined });
    const { result } = renderHook(() => useCollaboratorStats());
    expect(result.current.stats).toEqual({ total: 0, online: 0, pendingInvites: 0 });
  });

  it('returns actual stats data', () => {
    mockSWR({
      data: { total: 5, online: 3, pendingInvites: 2 },
      isLoading: false,
    });
    const { result } = renderHook(() => useCollaboratorStats());
    expect(result.current.stats).toEqual({ total: 5, online: 3, pendingInvites: 2 });
  });
});

/* ─── useAffiliates ────────────────────────────────────────────────────── */

describe('useAffiliates', () => {
  beforeEach(() => {
    mockSWR();
  });

  it('normalizes backend affiliate records into the UI shape', () => {
    mockSWR({
      data: {
        affiliates: [
          {
            id: 'partner-1',
            partnerName: 'Ana',
            partnerEmail: 'ana@example.com',
            type: 'AFFILIATE',
            status: 'PENDING',
            totalRevenue: 1250,
            commissionRate: 30,
            temperature: 72,
            totalSales: 9,
            productIds: ['prod_1'],
            createdAt: '2026-04-22T00:00:00.000Z',
          },
        ],
      },
      isLoading: false,
    });

    const { result } = renderHook(() => useAffiliates());

    expect(result.current.affiliates).toEqual([
      {
        id: 'partner-1',
        name: 'Ana',
        email: 'ana@example.com',
        type: 'affiliate',
        status: 'pending',
        revenue: 1250,
        commission: 30,
        temperature: 72,
        totalSales: 9,
        products: ['prod_1'],
        joined: '2026-04-22T00:00:00.000Z',
      },
    ]);
  });

  it('handles empty affiliates array', () => {
    mockSWR({
      data: { affiliates: [] },
      isLoading: false,
    });

    const { result } = renderHook(() => useAffiliates());
    expect(result.current.affiliates).toEqual([]);
  });

  it('handles missing data', () => {
    mockSWR({ data: undefined });
    const { result } = renderHook(() => useAffiliates());
    expect(result.current.affiliates).toEqual([]);
  });

  it('passes type filter as query param', () => {
    mockSWR();
    renderHook(() => useAffiliates({ type: 'affiliate' }));

    const swrCall = vi.mocked(useSWR).mock.calls.at(-1);
    const key = swrCall?.[0];
    expect(key).toContain('type=affiliate');
  });

  it('skips type filter when value is "todos"', () => {
    mockSWR();
    renderHook(() => useAffiliates({ type: 'todos' }));

    const swrCall = vi.mocked(useSWR).mock.calls.at(-1);
    const key = swrCall?.[0];
    expect(key).not.toContain('type=');
  });

  it('passes search param', () => {
    mockSWR();
    renderHook(() => useAffiliates({ search: 'ana' }));

    const swrCall = vi.mocked(useSWR).mock.calls.at(-1);
    const key = swrCall?.[0];
    expect(key).toContain('search=ana');
  });

  it('handles undefined params', () => {
    mockSWR();
    renderHook(() => useAffiliates());

    const swrCall = vi.mocked(useSWR).mock.calls.at(-1);
    const key = swrCall?.[0];
    expect(key).toBe('/partnerships/affiliates');
  });
});

/* ─── useAffiliateStats ────────────────────────────────────────────────── */

describe('useAffiliateStats', () => {
  it('normalizes the topPartner object into a string label', () => {
    mockSWR({
      data: {
        activeAffiliates: 3,
        producers: 1,
        totalRevenue: 8000,
        totalCommissions: 2400,
        topPartner: { name: 'Ana', revenue: 5000 },
      },
      isLoading: false,
    });

    const { result } = renderHook(() => useAffiliateStats());

    expect(result.current.stats).toEqual({
      activeAffiliates: 3,
      producers: 1,
      totalRevenue: 8000,
      totalCommissions: 2400,
      topPartner: 'Ana',
    });
  });

  it('returns zeroed stats when data is undefined', () => {
    mockSWR({ data: undefined });
    const { result } = renderHook(() => useAffiliateStats());
    expect(result.current.stats).toEqual({
      activeAffiliates: 0,
      producers: 0,
      totalRevenue: 0,
      totalCommissions: 0,
      topPartner: null,
    });
  });

  it('handles topPartner as string', () => {
    mockSWR({
      data: {
        activeAffiliates: 1,
        producers: 1,
        totalRevenue: 1000,
        totalCommissions: 200,
        topPartner: 'Maria',
      },
      isLoading: false,
    });

    const { result } = renderHook(() => useAffiliateStats());
    expect(result.current.stats.topPartner).toBe('Maria');
  });

  it('returns null when topPartner has empty name', () => {
    mockSWR({
      data: {
        activeAffiliates: 1,
        producers: 0,
        totalRevenue: 0,
        totalCommissions: 0,
        topPartner: { name: '' },
      },
      isLoading: false,
    });

    const { result } = renderHook(() => useAffiliateStats());
    expect(result.current.stats.topPartner).toBeNull();
  });
});

/* ─── useAffiliateDetail ───────────────────────────────────────────────── */

describe('useAffiliateDetail', () => {
  it('returns null affiliate when loading', () => {
    mockSWR();
    const { result } = renderHook(() => useAffiliateDetail('aff-1'));
    expect(result.current.affiliate).toBeNull();
    expect(result.current.isLoading).toBe(true);
  });

  it('returns affiliate data when loaded', () => {
    mockSWR({
      data: { affiliate: { id: 'aff-1', name: 'Ana' } },
      isLoading: false,
    });

    const { result } = renderHook(() => useAffiliateDetail('aff-1'));
    expect(result.current.affiliate).toEqual({ id: 'aff-1', name: 'Ana' });
  });

  it('does not fetch when id is null', () => {
    mockSWR();
    renderHook(() => useAffiliateDetail(null));

    const swrCall = vi.mocked(useSWR).mock.calls.at(-1);
    expect(swrCall?.[0]).toBeNull();
  });
});

/* ─── usePartnerChatContacts ───────────────────────────────────────────── */

describe('usePartnerChatContacts', () => {
  it('returns empty contacts when loading', () => {
    mockSWR();
    const { result } = renderHook(() => usePartnerChatContacts());
    expect(result.current.contacts).toEqual([]);
    expect(result.current.isLoading).toBe(true);
  });

  it('normalizes contact time', () => {
    mockSWR({
      data: {
        contacts: [
          {
            id: 'c1',
            name: 'Partner 1',
            lastMessageTime: '2026-01-15T14:30:00.000Z',
            lastMessage: 'Oi',
          },
        ],
      },
      isLoading: false,
    });

    const { result } = renderHook(() => usePartnerChatContacts());
    expect(result.current.contacts[0]).toHaveProperty('time');
    expect(result.current.contacts[0].lastMessageTime).toBe('2026-01-15T14:30:00.000Z');
  });

  it('handles contacts without lastMessageTime', () => {
    mockSWR({
      data: {
        contacts: [{ id: 'c1', name: 'No Time' }],
      },
      isLoading: false,
    });

    const { result } = renderHook(() => usePartnerChatContacts());
    expect(result.current.contacts[0].time).toBe('');
  });
});

/* ─── usePartnerMessages ───────────────────────────────────────────────── */

describe('usePartnerMessages', () => {
  it('returns empty messages when loading', () => {
    mockSWR();
    const { result } = renderHook(() => usePartnerMessages('partner-1'));
    expect(result.current.messages).toEqual([]);
  });

  it('normalizes messages', () => {
    mockSWR({
      data: {
        messages: [
          {
            id: 'm1',
            senderName: 'Joao',
            content: 'Hello',
            createdAt: '2026-01-15T14:30:00.000Z',
            senderType: 'OWNER',
          },
          {
            id: 'm2',
            senderName: 'Maria',
            content: 'Hi!',
            createdAt: '2026-01-15T14:32:00.000Z',
            senderType: 'AGENT',
          },
        ],
      },
      isLoading: false,
    });

    const { result } = renderHook(() => usePartnerMessages('partner-1'));
    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[0].isMe).toBe(true);
    expect(result.current.messages[1].isMe).toBe(false);
    expect(result.current.messages[0]).toHaveProperty('time');
    expect(result.current.messages[0].sender).toBe('Joao');
  });

  it('does not fetch when partnerId is null', () => {
    mockSWR();
    renderHook(() => usePartnerMessages(null));

    const swrCall = vi.mocked(useSWR).mock.calls.at(-1);
    expect(swrCall?.[0]).toBeNull();
  });

  it('handles messages without createdAt', () => {
    mockSWR({
      data: {
        messages: [{ id: 'm1', senderName: 'Joao', content: 'Hi', senderType: 'AGENT' }],
      },
      isLoading: false,
    });

    const { result } = renderHook(() => usePartnerMessages('partner-1'));
    expect(result.current.messages[0].time).toBe('');
  });
});

/* ─── inviteCollaborator ───────────────────────────────────────────────── */

describe('inviteCollaborator', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    mutateMock.mockReset();
    apiFetchMock.mockResolvedValue({ ok: true });
  });

  it('calls apiFetch with correct args and invalidates collaborators', async () => {
    await inviteCollaborator({ email: 'test@example.com', role: 'ADMIN' });

    expect(apiFetchMock).toHaveBeenCalledWith('/partnerships/collaborators/invite', {
      method: 'POST',
      body: { email: 'test@example.com', role: 'ADMIN' },
    });
    expect(mutateMock).toHaveBeenCalled();
  });
});

/* ─── revokeInvite ─────────────────────────────────────────────────────── */

describe('revokeInvite', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    mutateMock.mockReset();
    apiFetchMock.mockResolvedValue({ ok: true });
  });

  it('calls apiFetch with DELETE method', async () => {
    await revokeInvite('inv-1');

    expect(apiFetchMock).toHaveBeenCalledWith('/partnerships/collaborators/invite/inv-1', {
      method: 'DELETE',
    });
    expect(mutateMock).toHaveBeenCalled();
  });
});

/* ─── updateCollaboratorRole ───────────────────────────────────────────── */

describe('updateCollaboratorRole', () => {
  it('sends PUT request with role', async () => {
    apiFetchMock.mockResolvedValue({ ok: true });
    await updateCollaboratorRole('agent-1', 'VIEWER');

    expect(apiFetchMock).toHaveBeenCalledWith('/partnerships/collaborators/agent-1/role', {
      method: 'PUT',
      body: { role: 'VIEWER' },
    });
  });
});

/* ─── removeCollaborator ───────────────────────────────────────────────── */

describe('removeCollaborator', () => {
  it('sends DELETE request', async () => {
    apiFetchMock.mockResolvedValue({ ok: true });
    await removeCollaborator('agent-1');

    expect(apiFetchMock).toHaveBeenCalledWith('/partnerships/collaborators/agent-1', {
      method: 'DELETE',
    });
  });
});

/* ─── createAffiliate ──────────────────────────────────────────────────── */

describe('createAffiliate', () => {
  it('sends POST request and invalidates affiliates', async () => {
    apiFetchMock.mockResolvedValue({ ok: true });
    await createAffiliate({ name: 'New Affiliate', email: 'new@test.com' });

    expect(apiFetchMock).toHaveBeenCalledWith('/partnerships/affiliates', {
      method: 'POST',
      body: { name: 'New Affiliate', email: 'new@test.com' },
    });
    expect(mutateMock).toHaveBeenCalled();
  });
});

/* ─── approveAffiliate ─────────────────────────────────────────────────── */

describe('approveAffiliate', () => {
  it('sends POST to approve endpoint', async () => {
    apiFetchMock.mockResolvedValue({ ok: true });
    await approveAffiliate('aff-1');

    expect(apiFetchMock).toHaveBeenCalledWith('/partnerships/affiliates/aff-1/approve', {
      method: 'POST',
    });
  });
});

/* ─── revokeAffiliate ──────────────────────────────────────────────────── */

describe('revokeAffiliate', () => {
  it('sends POST to revoke endpoint', async () => {
    apiFetchMock.mockResolvedValue({ ok: true });
    await revokeAffiliate('aff-1');

    expect(apiFetchMock).toHaveBeenCalledWith('/partnerships/affiliates/aff-1/revoke', {
      method: 'POST',
    });
  });
});

/* ─── sendPartnerMessage ───────────────────────────────────────────────── */

describe('sendPartnerMessage', () => {
  it('sends POST with content and invalidates chat', async () => {
    apiFetchMock.mockResolvedValue({ ok: true });
    await sendPartnerMessage('partner-1', 'Hello!');

    expect(apiFetchMock).toHaveBeenCalledWith('/partnerships/chat/partner-1/messages', {
      method: 'POST',
      body: { content: 'Hello!' },
    });
    expect(mutateMock).toHaveBeenCalled();
  });
});
