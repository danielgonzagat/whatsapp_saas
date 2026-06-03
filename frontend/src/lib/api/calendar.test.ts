import { mutate } from 'swr';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cancelCalendarEvent, createCalendarEvent, listCalendarEvents } from './calendar';

const { apiFetch } = vi.hoisted(() => ({
  apiFetch: vi.fn(),
}));

vi.mock('./core', () => ({
  apiFetch,
}));

vi.mock('swr', () => ({
  mutate: vi.fn(),
}));

const baseEvent = {
  id: 'ev1',
  summary: 'Meeting',
  description: 'Discuss project',
  startTime: '2026-01-01T10:00:00Z',
  endTime: '2026-01-01T11:00:00Z',
  attendees: ['a@b.com'],
  location: 'Office',
  meetingLink: 'https://meet.example.com',
};

const mutateMock = vi.mocked(mutate);

describe('listCalendarEvents', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns events on success', async () => {
    apiFetch.mockResolvedValueOnce({ data: [baseEvent], status: 200 });
    const result = await listCalendarEvents();
    expect(result).toEqual([baseEvent]);
  });

  it('passes date params when provided', async () => {
    apiFetch.mockResolvedValueOnce({ data: [], status: 200 });
    await listCalendarEvents('2026-01-01', '2026-01-31');
    expect(apiFetch).toHaveBeenCalledWith(expect.stringContaining('startDate=2026-01-01'));
    expect(apiFetch).toHaveBeenCalledWith(expect.stringContaining('endDate=2026-01-31'));
  });

  it('rejects API errors instead of returning a fake empty calendar', async () => {
    apiFetch.mockResolvedValueOnce({ error: 'Service down', status: 503 });

    await expect(listCalendarEvents()).rejects.toThrow('Service down');
  });

  it('rejects missing payload instead of returning a fake empty calendar', async () => {
    apiFetch.mockResolvedValueOnce({ data: null, status: 200 });

    await expect(listCalendarEvents()).rejects.toThrow(
      'Calendar event list did not return a confirmed payload',
    );
  });
});

describe('createCalendarEvent', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sends POST, returns created event, and invalidates calendar cache on success', async () => {
    apiFetch.mockResolvedValueOnce({ data: baseEvent, status: 201 });
    const result = await createCalendarEvent({
      summary: 'Meeting',
      startTime: '2026-01-01T10:00:00Z',
      endTime: '2026-01-01T11:00:00Z',
    });
    expect(result).toEqual(baseEvent);
    expect(apiFetch).toHaveBeenCalledWith('/calendar/events', {
      method: 'POST',
      body: expect.objectContaining({ summary: 'Meeting' }),
    });
    expect(mutateMock).toHaveBeenCalledTimes(1);
  });

  it('throws on API error without invalidating calendar cache', async () => {
    apiFetch.mockResolvedValueOnce({ error: 'Conflict', status: 409 });

    await expect(
      createCalendarEvent({ summary: 'X', startTime: 't1', endTime: 't2' }),
    ).rejects.toThrow('Conflict');
    expect(mutateMock).not.toHaveBeenCalled();
  });

  it('rejects missing creation payload without invalidating calendar cache', async () => {
    apiFetch.mockResolvedValueOnce({ data: undefined, status: 201 });

    await expect(
      createCalendarEvent({ summary: 'X', startTime: 't1', endTime: 't2' }),
    ).rejects.toThrow('Calendar event creation did not return a confirmed payload');
    expect(mutateMock).not.toHaveBeenCalled();
  });
});

describe('cancelCalendarEvent', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sends DELETE, returns success, and invalidates calendar cache on success', async () => {
    apiFetch.mockResolvedValueOnce({ data: { success: true }, status: 200 });
    const result = await cancelCalendarEvent('ev1');
    expect(result).toEqual({ success: true });
    expect(apiFetch).toHaveBeenCalledWith('/calendar/events/ev1', {
      method: 'DELETE',
    });
    expect(mutateMock).toHaveBeenCalledTimes(1);
  });

  it('throws on API error without invalidating calendar cache', async () => {
    apiFetch.mockResolvedValueOnce({ error: 'Not Found', status: 404 });

    await expect(cancelCalendarEvent('missing')).rejects.toThrow('Not Found');
    expect(mutateMock).not.toHaveBeenCalled();
  });

  it('rejects unconfirmed cancellation without invalidating calendar cache', async () => {
    apiFetch.mockResolvedValueOnce({ data: { success: false }, status: 200 });

    await expect(cancelCalendarEvent('ev1')).rejects.toThrow(
      'Calendar event cancellation was not confirmed',
    );
    expect(mutateMock).not.toHaveBeenCalled();
  });

  it('rejects missing cancellation payload without invalidating calendar cache', async () => {
    apiFetch.mockResolvedValueOnce({ data: undefined, status: 200 });

    await expect(cancelCalendarEvent('ev1')).rejects.toThrow(
      'Calendar event cancellation did not return a confirmed payload',
    );
    expect(mutateMock).not.toHaveBeenCalled();
  });
});
