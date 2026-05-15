import { resolveWorkspaceId } from '../auth/workspace-access';
import { CalendarController } from './calendar.controller';

jest.mock('../auth/workspace-access', () => ({
  resolveWorkspaceId: jest.fn(),
}));

const mockedResolveWorkspaceId = resolveWorkspaceId as jest.Mock;

describe('CalendarController', () => {
  const listEvents = jest.fn();
  const createEvent = jest.fn();
  const cancelEvent = jest.fn();

  let controller: CalendarController;

  const authReq = {
    user: { sub: 'user-1', email: 'a@test.com', workspaceId: 'ws-test', role: 'admin' },
    params: {},
    body: {},
    query: {},
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockedResolveWorkspaceId.mockReturnValue('ws-test');

    controller = new CalendarController({
      listEvents,
      createEvent,
      cancelEvent,
    } as never);
  });

  describe('GET /calendar/events', () => {
    it('invokes service.listEvents with workspaceId and date range', async () => {
      const events = [
        {
          id: 'ev-1',
          summary: 'Meeting',
          startTime: new Date('2026-06-01T10:00:00Z'),
          endTime: new Date('2026-06-01T11:00:00Z'),
        },
      ];
      listEvents.mockResolvedValue(events);

      const result = await controller.listEvents(authReq as never, {
        startDate: '2026-06-01T00:00:00Z',
        endDate: '2026-06-07T23:59:59Z',
      });

      expect(mockedResolveWorkspaceId).toHaveBeenCalledWith(authReq);
      expect(listEvents).toHaveBeenCalledWith(
        'ws-test',
        new Date('2026-06-01T00:00:00Z'),
        new Date('2026-06-07T23:59:59Z'),
      );
      expect(result).toEqual(events);
    });

    it('passes undefined dates when query params are missing', async () => {
      listEvents.mockResolvedValue([]);

      await controller.listEvents(authReq as never, {});

      expect(listEvents).toHaveBeenCalledWith('ws-test', undefined, undefined);
    });
  });

  describe('POST /calendar/events', () => {
    it('invokes service.createEvent with body and workspaceId', async () => {
      const created = {
        id: 'ev-2',
        summary: 'Demo',
        startTime: new Date('2026-06-01T14:00:00Z'),
        endTime: new Date('2026-06-01T15:00:00Z'),
      };
      createEvent.mockResolvedValue(created);

      const dto = {
        summary: 'Demo',
        startTime: '2026-06-01T14:00:00Z',
        endTime: '2026-06-01T15:00:00Z',
        attendees: ['guest@test.com'],
        location: 'Office',
      };

      const result = await controller.createEvent(authReq as never, dto);

      expect(mockedResolveWorkspaceId).toHaveBeenCalledWith(authReq);
      expect(createEvent).toHaveBeenCalledWith('ws-test', {
        summary: 'Demo',
        startTime: new Date('2026-06-01T14:00:00Z'),
        endTime: new Date('2026-06-01T15:00:00Z'),
        attendees: ['guest@test.com'],
        location: 'Office',
      });
      expect(result).toEqual(created);
    });
  });

  describe('DELETE /calendar/events/:eventId', () => {
    it('invokes service.cancelEvent with eventId and workspaceId', async () => {
      cancelEvent.mockResolvedValue(true);

      const result = await controller.cancelEvent(authReq as never, 'ev-3');

      expect(mockedResolveWorkspaceId).toHaveBeenCalledWith(authReq);
      expect(cancelEvent).toHaveBeenCalledWith('ws-test', 'ev-3');
      expect(result).toEqual({ success: true });
    });

    it('returns success false when cancelEvent returns false', async () => {
      cancelEvent.mockResolvedValue(false);

      const result = await controller.cancelEvent(authReq as never, 'ev-99');

      expect(result).toEqual({ success: false });
    });
  });

  describe('tenant isolation', () => {
    it('scopes workspaceId consistently across endpoints', async () => {
      mockedResolveWorkspaceId.mockReturnValue('ws-alpha');
      listEvents.mockResolvedValue([]);
      createEvent.mockResolvedValue({
        id: 'ev-4',
        summary: 'X',
        startTime: new Date('2026-01-01T00:00:00Z'),
        endTime: new Date('2026-01-01T01:00:00Z'),
      });
      cancelEvent.mockResolvedValue(true);

      await controller.listEvents(authReq as never, {
        startDate: '2026-01-01T00:00:00Z',
        endDate: '2026-01-31T23:59:59Z',
      });
      await controller.createEvent(authReq as never, {
        summary: 'X',
        startTime: '2026-01-01T00:00:00Z',
        endTime: '2026-01-01T01:00:00Z',
      });
      await controller.cancelEvent(authReq as never, 'ev-4');

      for (const call of listEvents.mock.calls) {
        expect(call[0]).toBe('ws-alpha');
      }
      for (const call of createEvent.mock.calls) {
        expect(call[0]).toBe('ws-alpha');
      }
      for (const call of cancelEvent.mock.calls) {
        expect(call[0]).toBe('ws-alpha');
      }
    });
  });
});
