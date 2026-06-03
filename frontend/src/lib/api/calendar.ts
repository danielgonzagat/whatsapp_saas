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

type CalendarApiEnvelope<T> = {
  data?: T | undefined;
  error?: string | undefined;
  status: number;
};

function confirmCalendarPayload<T>(
  response: CalendarApiEnvelope<T>,
  fallbackMessage: string,
  missingPayloadMessage: string,
): T {
  if (response.error || response.status >= 400) {
    throw new Error(response.error ?? fallbackMessage);
  }

  if (response.data === undefined || response.data === null) {
    throw new Error(missingPayloadMessage);
  }

  return response.data;
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

  const query = params.toString();
  const endpoint = query ? `/calendar/events?${query}` : '/calendar/events';
  const res = await apiFetch<CalendarEvent[]>(endpoint);
  return confirmCalendarPayload(
    res,
    'Erro ao listar eventos',
    'Calendar event list did not return a confirmed payload',
  );
}

export async function createCalendarEvent(
  event: Omit<CalendarEvent, 'id'>,
  _token?: string,
): Promise<CalendarEvent> {
  const res = await apiFetch<CalendarEvent>(`/calendar/events`, {
    method: 'POST',
    body: event,
  });
  const createdEvent = confirmCalendarPayload(
    res,
    'Erro ao criar evento',
    'Calendar event creation did not return a confirmed payload',
  );
  mutate((key: string) => typeof key === 'string' && key.startsWith('/calendar'));
  return createdEvent;
}

export async function cancelCalendarEvent(
  eventId: string,
  _token?: string,
): Promise<{ success: boolean }> {
  const res = await apiFetch<{ success: boolean }>(`/calendar/events/${eventId}`, {
    method: 'DELETE',
  });
  const cancellation = confirmCalendarPayload(
    res,
    'Erro ao cancelar evento',
    'Calendar event cancellation did not return a confirmed payload',
  );
  if (cancellation.success !== true) {
    throw new Error('Calendar event cancellation was not confirmed');
  }
  mutate((key: string) => typeof key === 'string' && key.startsWith('/calendar'));
  return cancellation;
}
