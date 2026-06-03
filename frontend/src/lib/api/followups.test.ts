import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mutate } from 'swr';
import {
  cancelFollowUp,
  getKloelFollowups,
  listScheduledFollowUps,
  patchFollowup,
  scheduleFollowUp,
} from './followups';

const { apiFetch } = vi.hoisted(() => ({
  apiFetch: vi.fn(),
}));

vi.mock('./core', () => ({
  apiFetch,
}));

vi.mock('swr', () => ({
  mutate: vi.fn(),
}));

describe('followups API', () => {
  beforeEach(() => vi.clearAllMocks());

  it('throws read failures instead of returning a fake empty list', async () => {
    apiFetch.mockResolvedValueOnce({ error: 'Followups offline', status: 503 });

    await expect(listScheduledFollowUps('ws1')).rejects.toThrow('Followups offline');
  });

  it('rejects unconfirmed schedule responses without invalidating cache', async () => {
    apiFetch.mockResolvedValueOnce({
      data: { success: false, message: 'Queue rejected' },
      status: 200,
    });

    await expect(
      scheduleFollowUp('ws1', {
        phone: '+5511999999999',
        message: 'Retomar conversa',
        scheduledAt: '2026-06-01T12:00:00.000Z',
      }),
    ).rejects.toThrow('Queue rejected');
    expect(mutate).not.toHaveBeenCalled();
  });

  it('rejects cancellation errors without invalidating cache', async () => {
    apiFetch.mockResolvedValueOnce({ error: 'Delete failed', status: 409 });

    await expect(cancelFollowUp('ws1', 'fu1')).rejects.toThrow('Delete failed');
    expect(mutate).not.toHaveBeenCalled();
  });

  it('rejects missing patch confirmation without invalidating cache', async () => {
    apiFetch.mockResolvedValueOnce({ data: undefined, status: 200 });

    await expect(patchFollowup('fu1', { status: 'cancelled' })).rejects.toThrow(
      'Follow-up update did not return a confirmed payload',
    );
    expect(mutate).not.toHaveBeenCalled();
  });

  it('rejects missing scheduled follow-up list payloads', async () => {
    apiFetch.mockResolvedValueOnce({ data: undefined, status: 200 });

    await expect(listScheduledFollowUps('ws1')).rejects.toThrow(
      'Follow-up list did not return a confirmed payload',
    );
  });

  it('rejects Kloel follow-up failures instead of returning a fake empty list', async () => {
    apiFetch.mockResolvedValueOnce({ error: 'Kloel followups offline', status: 503 });

    await expect(getKloelFollowups()).rejects.toThrow('Kloel followups offline');
  });

  it('rejects missing Kloel follow-up payloads', async () => {
    apiFetch.mockResolvedValueOnce({ data: undefined, status: 200 });

    await expect(getKloelFollowups('contact-1')).rejects.toThrow(
      'Kloel follow-ups did not return a confirmed payload',
    );
  });

  it('returns Kloel follow-ups from the backend envelope', async () => {
    apiFetch.mockResolvedValueOnce({
      data: { followups: [{ id: 'fu1', contactId: 'contact-1', status: 'pending' }] },
      status: 200,
    });

    await expect(getKloelFollowups('contact-1')).resolves.toEqual([
      { id: 'fu1', contactId: 'contact-1', status: 'pending' },
    ]);
    expect(apiFetch).toHaveBeenCalledWith('/kloel/followups/contact-1');
  });
});
