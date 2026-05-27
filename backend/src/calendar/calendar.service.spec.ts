import { ConfigService } from '@nestjs/config';
import { CalendarService } from './calendar.service';
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
});
