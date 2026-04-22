import { ConfigService } from '@nestjs/config';
import { CalendarService } from './calendar.service';

describe('CalendarService', () => {
  let prisma: {
    workspace: {
      findUnique: jest.Mock;
    };
    contact: {
      findFirst: jest.Mock;
    };
    appointment: {
      create: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
    };
  };
  let configService: Pick<ConfigService, 'get'>;
  let service: CalendarService;

  beforeEach(() => {
    prisma = {
      workspace: {
        findUnique: jest.fn(),
      },
      contact: {
        findFirst: jest.fn(),
      },
      appointment: {
        create: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
    };
    configService = {
      get: jest.fn(),
    };
    service = new CalendarService(
      configService as unknown as ConstructorParameters<typeof CalendarService>[0],
      prisma as unknown as ConstructorParameters<typeof CalendarService>[1],
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
