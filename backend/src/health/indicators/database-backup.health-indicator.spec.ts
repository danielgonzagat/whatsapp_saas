import { HealthCheckError } from '@nestjs/terminus';
import { access, readFile } from 'fs/promises';
import { DatabaseBackupHealthIndicator } from './database-backup.health-indicator';

jest.mock('fs/promises', () => ({
  access: jest.fn(),
  readFile: jest.fn(),
}));

const mockedAccess = access as jest.MockedFunction<typeof access>;
const mockedReadFile = readFile as jest.MockedFunction<typeof readFile>;

function manifest(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    lastBackup: new Date(Date.now() - 10 * 60_000).toISOString(),
    lastVerifiedAt: new Date(Date.now() - 10 * 60_000).toISOString(),
    targetRpoMinutes: 60,
    frequencyMinutes: 60,
    stores: [
      {
        name: 'PostgreSQL (Railway)',
        type: 'database',
        rpoMinutes: 60,
        configured: true,
        tested: true,
        lastTestEvidence: '.dr-test.log',
      },
    ],
    ...overrides,
  });
}

describe('DatabaseBackupHealthIndicator', () => {
  let indicator: DatabaseBackupHealthIndicator;

  beforeEach(() => {
    jest.clearAllMocks();
    indicator = new DatabaseBackupHealthIndicator();
  });

  it('returns healthy when backup is within RPO window', async () => {
    mockedAccess.mockResolvedValue(undefined);
    mockedReadFile.mockResolvedValue(manifest());

    const result = await indicator.isHealthy('backup');

    expect(result.backup.status).toBe('up');
    expect(result.backup.ageMinutes).toBeLessThanOrEqual(60);
    expect(typeof result.backup.checkDurationMs).toBe('number');
  });

  it('returns unhealthy when manifest is not readable', async () => {
    mockedAccess.mockRejectedValue(new Error('not found'));

    await expect(indicator.isHealthy('backup')).rejects.toThrow(HealthCheckError);
    await expect(indicator.isHealthy('backup')).rejects.toMatchObject({
      message: 'Backup manifest missing',
    });
  });

  it('returns unhealthy when manifest has no lastBackup field', async () => {
    mockedAccess.mockResolvedValue(undefined);
    mockedReadFile.mockResolvedValue(JSON.stringify({ targetRpoMinutes: 60, stores: [] }));

    await expect(indicator.isHealthy('backup')).rejects.toThrow(HealthCheckError);
    await expect(indicator.isHealthy('backup')).rejects.toMatchObject({
      message: 'Backup manifest missing',
    });
  });

  it('returns unhealthy when backup age exceeds manifest RPO window', async () => {
    mockedAccess.mockResolvedValue(undefined);
    mockedReadFile.mockResolvedValue(
      manifest({ lastBackup: new Date(Date.now() - 120 * 60_000).toISOString() }),
    );

    await expect(indicator.isHealthy('backup')).rejects.toThrow(HealthCheckError);
    await expect(indicator.isHealthy('backup')).rejects.toMatchObject({
      message: expect.stringMatching(/exceeds RPO window/),
    });
  });

  it('validates per-store RPO separately from global manifest RPO', async () => {
    mockedAccess.mockResolvedValue(undefined);
    mockedReadFile.mockResolvedValue(
      manifest({
        targetRpoMinutes: 300,
        stores: [
          {
            name: 'PostgreSQL',
            type: 'database',
            rpoMinutes: 60,
            configured: true,
            tested: true,
          },
          {
            name: 'Files',
            type: 'storage',
            rpoMinutes: 240,
            configured: true,
            tested: true,
          },
        ],
        lastBackup: new Date(Date.now() - 120 * 60_000).toISOString(),
      }),
    );

    await expect(indicator.isHealthy('backup')).rejects.toThrow(HealthCheckError);
    await expect(indicator.isHealthy('backup')).rejects.toMatchObject({
      message: expect.stringMatching(/exceeds RPO window 300min/),
    });
  });

  it('includes store-level RPO details in response', async () => {
    mockedAccess.mockResolvedValue(undefined);
    mockedReadFile.mockResolvedValue(manifest());

    const result = await indicator.isHealthy('backup');

    const stores = result.backup.stores as Array<Record<string, unknown>>;
    expect(stores).toHaveLength(1);
    expect(stores[0].name).toBe('PostgreSQL (Railway)');
    expect(stores[0].withinRpo).toBe(true);
  });

  it('handles malformed JSON in manifest as missing manifest', async () => {
    mockedAccess.mockResolvedValue(undefined);
    mockedReadFile.mockResolvedValue('not json');

    await expect(indicator.isHealthy('backup')).rejects.toThrow(HealthCheckError);
    await expect(indicator.isHealthy('backup')).rejects.toMatchObject({
      message: 'Backup manifest missing',
    });
  });

  it('defaults RPO to 60 when targetRpoMinutes is missing', async () => {
    mockedAccess.mockResolvedValue(undefined);
    mockedReadFile.mockResolvedValue(
      JSON.stringify({
        lastBackup: new Date(Date.now() - 10 * 60_000).toISOString(),
      }),
    );

    const result = await indicator.isHealthy('backup');

    expect(result.backup.status).toBe('up');
    expect(result.backup.rpoMinutes).toBe(60);
  });
});
