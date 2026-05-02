import { mutate } from 'swr';
import { apiFetch } from './core';

export interface CalendarEvent {
  id?: string;
  summary: string;
  description?: string;
  startTime: string;
  endTime: string;
  attendees?: string[];
  location?: string;
  meetingLink?: string;
}

export async function listCalendarEvents(
  startDate?: string,
  endDate?: string,
  _token?: string,
): Promise<CalendarEvent[]> {
  const params = new URLSearchParams();
  if (startDate) {
    params.append('startDate', startDate);
  }
  if (endDate) {
    params.append('endDate', endDate);
  }

  const res = await apiFetch<CalendarEvent[]>(`/calendar/events?${params.toString()}`);
  if (res.error) {
    return [];
  }
  return res.data ?? [];
}

export async function createCalendarEvent(
  event: Omit<CalendarEvent, 'id'>,
  _token?: string,
): Promise<CalendarEvent> {
  const res = await apiFetch<CalendarEvent>(`/calendar/events`, {
    method: 'POST',
    body: event,
  });
  if (res.error) {
    throw new Error(res.error || 'Erro ao criar evento');
  }
  mutate((key: string) => typeof key === 'string' && key.startsWith('/calendar'));
  return res.data as CalendarEvent;
}

export async function cancelCalendarEvent(
  eventId: string,
  _token?: string,
): Promise<{ success: boolean }> {
  const res = await apiFetch<{ success: boolean }>(`/calendar/events/${eventId}`, {
    method: 'DELETE',
  });
  if (res.error) {
    throw new Error(res.error || 'Erro ao cancelar evento');
  }
  mutate((key: string) => typeof key === 'string' && key.startsWith('/calendar'));
  return res.data as { success: boolean };
}
