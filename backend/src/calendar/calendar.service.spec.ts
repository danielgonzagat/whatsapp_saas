import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CalendarService, type CalendarEvent } from './calendar.service';
import { createPartialPrismaMock } from '../../test/helpers/prisma.mock';

describe('CalendarService', () => {
  let prisma: ReturnType<typeof createPartialPrismaMock>;
  let configService: Pick<ConfigService, 'get'>;
  let service: CalendarService;

  beforeEach(() => {
    prisma = createPartialPrismaMock({
      workspace: ['findUnique'],
      contact: ['findFirst'],
      appointment: ['create', 'findMany', 'update'],
    });
    configService = {
      get: jest.fn(),
    };
    service = new CalendarService(
      configService as never as ConstructorParameters<typeof CalendarService>[0],
      prisma as never as ConstructorParameters<typeof CalendarService>[1],
    );
  });

  it('returns null when the stored calendar config is malformed', async () => {
    prisma.workspace.findUnique.mockResolvedValue({
      providerSettings: {
        calendar: 'broken',
      },
    });

    await expect(service.getCalendarConfig('ws-1')).resolves.toBeNull();
  });

  it('returns a normalized calendar config when the stored shape is valid', async () => {
    prisma.workspace.findUnique.mockResolvedValue({
      providerSettings: {
        calendar: {
          provider: 'google',
          credentials: {
            refreshToken: 'refresh-token',
            accessToken: 123,
          },
        },
      },
    });

    await expect(service.getCalendarConfig('ws-1')).resolves.toEqual({
      provider: 'google',
      credentials: {
        refreshToken: 'refresh-token',
      },
    });
  });

  describe('createEvent honest persistence', () => {
    const sampleEvent: CalendarEvent = {
      summary: 'Reunião de teste',
      startTime: new Date('2026-06-01T10:00:00.000Z'),
      endTime: new Date('2026-06-01T10:30:00.000Z'),
    };

    it('throws ServiceUnavailableException (no fabricated id) when the appointment model is missing', async () => {
      // No appointment model registered -> getAppointmentModel() resolves to null.
      const noAppointmentPrisma = createPartialPrismaMock({
        workspace: ['findUnique'],
      });
      noAppointmentPrisma.workspace.findUnique.mockResolvedValue({ providerSettings: {} });
      const localService = new CalendarService(
        configService as never as ConstructorParameters<typeof CalendarService>[0],
        noAppointmentPrisma as never as ConstructorParameters<typeof CalendarService>[1],
      );

      await expect(localService.createEvent('ws-1', sampleEvent)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });

    it('persists for real and returns the saved appointment id when the model exists', async () => {
      prisma.workspace.findUnique.mockResolvedValue({ providerSettings: {} });
      prisma.appointment.create.mockResolvedValue({
        id: 'apt-real-1',
        title: 'Reunião de teste',
        startAt: sampleEvent.startTime,
        endAt: sampleEvent.endTime,
      });

      const created = await service.createEvent('ws-1', sampleEvent);

      expect(prisma.appointment.create).toHaveBeenCalledTimes(1);
      expect(created.id).toBe('apt-real-1');
      expect(created.id).not.toMatch(/^local_/);
    });

    it('throws ServiceUnavailableException (no fabricated id) when the real create fails', async () => {
      prisma.workspace.findUnique.mockResolvedValue({ providerSettings: {} });
      prisma.appointment.create.mockRejectedValue(new Error('db_down'));

      await expect(service.createEvent('ws-1', sampleEvent)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });
  });
});
