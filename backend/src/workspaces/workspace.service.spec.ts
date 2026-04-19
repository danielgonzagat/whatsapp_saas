import { WorkspaceService } from './workspace.service';

describe('WorkspaceService', () => {
  let prisma: any;
  let service: WorkspaceService;

  beforeEach(() => {
    process.env.ENCRYPTION_KEY =
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    prisma = {
      workspace: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };
    service = new WorkspaceService(prisma);
  });

  afterEach(() => {
    delete process.env.ENCRYPTION_KEY;
  });

  it('encrypts calendar secrets before persisting providerSettings', async () => {
    prisma.workspace.findUnique.mockResolvedValue({
      id: 'ws-1',
      providerSettings: {},
    });
    prisma.workspace.update.mockResolvedValue({ id: 'ws-1' });

    await service.patchSettings('ws-1', {
      calendar: {
        provider: 'google',
        credentials: {
          clientId: 'google-client-id',
          clientSecret: 'google-client-secret',
          refreshToken: 'google-refresh-token',
          accessToken: 'google-access-token',
        },
      },
    });

    const persisted =
      prisma.workspace.update.mock.calls[0][0].data.providerSettings as Record<string, any>;
    expect(persisted.calendar.provider).toBe('google');
    expect(persisted.calendar.credentials.clientId).toBe('google-client-id');
    expect(persisted.calendar.credentials.clientSecret).not.toBe('google-client-secret');
    expect(persisted.calendar.credentials.refreshToken).not.toBe('google-refresh-token');
    expect(persisted.calendar.credentials.accessToken).not.toBe('google-access-token');
  });
});
