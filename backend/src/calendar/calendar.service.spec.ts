import { ConfigService } from '@nestjs/config';
import { encryptString } from '../lib/crypto';
import { CalendarService } from './calendar.service';

describe('CalendarService', () => {
  let prisma: any;
  let configService: ConfigService;
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
    } as unknown as ConfigService;
    service = new CalendarService(configService, prisma);
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

  it('decrypts encrypted calendar credentials when reading workspace config', async () => {
    const key =
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    process.env.ENCRYPTION_KEY = key;
    prisma.workspace.findUnique.mockResolvedValue({
      providerSettings: {
        calendar: {
          provider: 'google',
          credentials: {
            clientId: 'client-id',
            clientSecret: encryptString('client-secret', key),
            refreshToken: encryptString('refresh-token', key),
            accessToken: encryptString('access-token', key),
          },
        },
      },
    });

    await expect(service.getCalendarConfig('ws-1')).resolves.toEqual({
      provider: 'google',
      credentials: {
        clientId: 'client-id',
        clientSecret: 'client-secret',
        refreshToken: 'refresh-token',
        accessToken: 'access-token',
      },
    });
    delete process.env.ENCRYPTION_KEY;
  });
});
