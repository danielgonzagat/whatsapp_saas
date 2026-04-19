import { createHash } from 'node:crypto';
import { Logger } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { encryptString } from '../lib/crypto';
import { NotificationsService } from './notifications.service';

function hashDeviceToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

describe('NotificationsService', () => {
  let prisma: any;
  let auditService: any;
  let config: any;
  let service: NotificationsService;

  beforeEach(() => {
    process.env.ENCRYPTION_KEY = 'a'.repeat(64);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    prisma = {
      deviceToken: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        deleteMany: jest.fn(),
        findMany: jest.fn(),
      },
      agent: {
        findMany: jest.fn(),
      },
    };
    auditService = {
      log: jest.fn().mockResolvedValue(undefined),
    };
    config = {
      get: jest.fn().mockReturnValue(undefined),
    };
    service = new NotificationsService(prisma, auditService, config);
  });

  afterEach(() => {
    delete process.env.ENCRYPTION_KEY;
    jest.restoreAllMocks();
  });

  it('stores only a hashed device token and encrypted ciphertext when registering a new device', async () => {
    prisma.deviceToken.findFirst.mockResolvedValue(null);
    prisma.deviceToken.create.mockResolvedValue({
      id: 'device-1',
      token: hashDeviceToken('raw-device-token'),
      tokenCiphertext: 'ciphertext',
      platform: 'ios',
      agentId: 'agent-1',
    });

    await expect(service.registerDevice('agent-1', 'raw-device-token', 'ios')).resolves.toEqual({
      deviceId: 'device-1',
    });

    expect(prisma.deviceToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        token: hashDeviceToken('raw-device-token'),
        tokenCiphertext: expect.any(String),
        platform: 'ios',
        agentId: 'agent-1',
      }),
    });

    const storedCiphertext = prisma.deviceToken.create.mock.calls[0][0].data.tokenCiphertext;
    expect(storedCiphertext).not.toBe('raw-device-token');
  });

  it('migrates a legacy plaintext token row to hashed storage on re-registration', async () => {
    prisma.deviceToken.findFirst.mockResolvedValue({
      id: 'device-1',
      token: 'raw-device-token',
    });
    prisma.deviceToken.update.mockResolvedValue({
      id: 'device-1',
      token: hashDeviceToken('raw-device-token'),
      tokenCiphertext: 'ciphertext',
      platform: 'ios',
      agentId: 'agent-1',
    });

    await expect(service.registerDevice('agent-1', 'raw-device-token', 'ios')).resolves.toEqual({
      deviceId: 'device-1',
    });

    expect(prisma.deviceToken.update).toHaveBeenCalledWith({
      where: { id: 'device-1' },
      data: expect.objectContaining({
        token: hashDeviceToken('raw-device-token'),
        tokenCiphertext: expect.any(String),
        platform: 'ios',
        agentId: 'agent-1',
      }),
    });
  });

  it('deletes device rows by legacy or hashed token value during unregister', async () => {
    prisma.deviceToken.findFirst.mockResolvedValue({
      id: 'device-1',
      agentId: 'agent-1',
    });
    prisma.deviceToken.deleteMany.mockResolvedValue({ count: 1 });

    await service.unregisterDevice('raw-device-token');

    expect(prisma.deviceToken.findFirst).toHaveBeenCalledWith({
      where: {
        OR: [{ token: hashDeviceToken('raw-device-token') }, { token: 'raw-device-token' }],
      },
      select: { id: true, agentId: true },
    });
    expect(prisma.deviceToken.deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [{ token: hashDeviceToken('raw-device-token') }, { token: 'raw-device-token' }],
      },
    });
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: 'DeviceToken',
        resourceId: 'device-1',
        agentId: 'agent-1',
      }),
    );
  });

  it('decrypts stored device ciphertext for delivery and removes invalid registrations by id', async () => {
    const key = process.env.ENCRYPTION_KEY as string;
    prisma.deviceToken.findMany.mockResolvedValue([
      {
        id: 'device-1',
        token: hashDeviceToken('first-raw-token'),
        tokenCiphertext: encryptString('first-raw-token', key),
      },
      {
        id: 'device-2',
        token: 'legacy-raw-token',
        tokenCiphertext: null,
      },
    ]);
    prisma.deviceToken.deleteMany.mockResolvedValue({ count: 1 });

    const sendEachForMulticast = jest.fn().mockResolvedValue({
      successCount: 1,
      failureCount: 1,
      responses: [
        { success: true },
        { success: false, error: { code: 'messaging/registration-token-not-registered' } },
      ],
    });
    jest.spyOn(admin, 'messaging').mockReturnValue({
      sendEachForMulticast,
    } as any);
    (service as any).firebaseApp = {} as admin.app.App;

    await expect(service.sendPushNotification('agent-1', 'Title', 'Body')).resolves.toEqual({
      sent: 1,
      failed: 1,
    });

    expect(sendEachForMulticast).toHaveBeenCalledWith(
      expect.objectContaining({
        tokens: ['first-raw-token', 'legacy-raw-token'],
      }),
    );
    expect(prisma.deviceToken.deleteMany).toHaveBeenCalledWith({
      where: {
        id: {
          in: ['device-2'],
        },
      },
    });
  });
});
