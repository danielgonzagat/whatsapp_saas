/**
 * Tests focused on the timing-attack-safe Redis lock release in
 * WhatsAppWatchdogRecoveryService. The full service has many collaborators;
 * here we only exercise releaseLock, which is what the security fix touches.
 */

import { WhatsAppWatchdogRecoveryService } from './whatsapp-watchdog-recovery.service';

type RedisMock = {
  get: jest.Mock<Promise<string | null>, [string]>;
  del: jest.Mock<Promise<number>, [string]>;
};

function buildService(redis: RedisMock): WhatsAppWatchdogRecoveryService {
  // Cast to the real Redis type — collaborators not used by releaseLock are
  // passed as `null as never as ...` to keep the test surface minimal.
  return new WhatsAppWatchdogRecoveryService(
    null as never as ConstructorParameters<typeof WhatsAppWatchdogRecoveryService>[0],
    null as never as ConstructorParameters<typeof WhatsAppWatchdogRecoveryService>[1],
    null as never as ConstructorParameters<typeof WhatsAppWatchdogRecoveryService>[2],
    null as never as ConstructorParameters<typeof WhatsAppWatchdogRecoveryService>[3],
    redis as never as ConstructorParameters<typeof WhatsAppWatchdogRecoveryService>[4],
  );
}

describe('WhatsAppWatchdogRecoveryService.releaseLock (constant-time)', () => {
  const KEY = 'whatsapp:watchdog:reconnect:ws_1';

  let redis: RedisMock;
  let service: WhatsAppWatchdogRecoveryService;

  beforeEach(() => {
    redis = {
      get: jest.fn(),
      del: jest.fn().mockResolvedValue(1),
    };
    service = buildService(redis);
  });

  it('deletes the key when stored token equals provided token (equal strings)', async () => {
    const token = 'tok-stub-1';
    redis.get.mockResolvedValue(token);

    await service.releaseLock(KEY, token);

    expect(redis.get).toHaveBeenCalledWith(KEY);
    expect(redis.del).toHaveBeenCalledWith(KEY);
  });

  it('does NOT delete when tokens differ but have the same length', async () => {
    const stored = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const provided = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    expect(stored.length).toBe(provided.length);
    redis.get.mockResolvedValue(stored);

    await service.releaseLock(KEY, provided);

    expect(redis.del).not.toHaveBeenCalled();
  });

  it('does NOT delete and does not throw when tokens have different lengths', async () => {
    redis.get.mockResolvedValue('short-token');
    const provided = 'a-much-longer-token-value-that-differs-in-length';

    await expect(service.releaseLock(KEY, provided)).resolves.toBeUndefined();
    expect(redis.del).not.toHaveBeenCalled();
  });

  it('does NOT delete when the stored value is null (lock already expired)', async () => {
    redis.get.mockResolvedValue(null);

    await service.releaseLock(KEY, 'recovery-stub-token');

    expect(redis.del).not.toHaveBeenCalled();
  });

  it('does NOT delete when both stored and provided are empty strings', async () => {
    redis.get.mockResolvedValue('');

    await service.releaseLock(KEY, '');

    expect(redis.del).not.toHaveBeenCalled();
  });

  it('does NOT delete when provided token is empty but stored is not', async () => {
    redis.get.mockResolvedValue('real-token');

    await service.releaseLock(KEY, '');

    expect(redis.del).not.toHaveBeenCalled();
  });
});
