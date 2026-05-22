import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  listCalendarEvents,
  createCalendarEvent,
  cancelCalendarEvent,
} from './calendar';

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
    expect(apiFetch).toHaveBeenCalledWith(
      expect.stringContaining('startDate=2026-01-01'),
    );
    expect(apiFetch).toHaveBeenCalledWith(
      expect.stringContaining('endDate=2026-01-31'),
    );
  });

  it('returns empty array on API error (graceful)', async () => {
    apiFetch.mockResolvedValueOnce({ error: 'Service down', status: 503 });
    const result = await listCalendarEvents();
    expect(result).toEqual([]);
  });

  it('returns empty array when data is nullish', async () => {
    apiFetch.mockResolvedValueOnce({ data: null, status: 200 });
    const result = await listCalendarEvents();
    expect(result).toEqual([]);
  });
});

describe('createCalendarEvent', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sends POST and returns created event on success', async () => {
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
  });

  it('throws on API error', async () => {
    apiFetch.mockResolvedValueOnce({ error: 'Conflict', status: 409 });
    await expect(
      createCalendarEvent({ summary: 'X', startTime: 't1', endTime: 't2' }),
    ).rejects.toThrow('Conflict');
  });
});

describe('cancelCalendarEvent', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sends DELETE and returns success on success', async () => {
    apiFetch.mockResolvedValueOnce({ data: { success: true }, status: 200 });
    const result = await cancelCalendarEvent('ev1');
    expect(result).toEqual({ success: true });
    expect(apiFetch).toHaveBeenCalledWith('/calendar/events/ev1', {
      method: 'DELETE',
    });
  });

  it('throws on API error', async () => {
    apiFetch.mockResolvedValueOnce({ error: 'Not Found', status: 404 });
    await expect(cancelCalendarEvent('missing')).rejects.toThrow('Not Found');
  });
});
