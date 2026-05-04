import { ConfigService } from '@nestjs/config';
import { StorageDriversService } from './storage-drivers.service';
import { StorageService } from './storage.service';

function createConfig(values: Record<string, unknown>) {
  return {
    get(key: string, defaultValue?: unknown) {
      return key in values ? values[key] : defaultValue;
    },
  } as ConfigService;
}

describe('StorageService', () => {
  it('uses the configured public R2 URL when available', () => {
    const config = createConfig({
      STORAGE_DRIVER: 'r2',
      APP_URL: 'https://api.kloel.test',
      R2_PUBLIC_URL: 'https://pub-example.r2.dev',
    });
    const service = new StorageService(config, new StorageDriversService(config));

    expect(service.getPublicUrl('uploads/ws/file.png')).toBe(
      'https://pub-example.r2.dev/uploads/ws/file.png',
    );
  });

  it('falls back to signed backend access when R2 has no public URL', () => {
    const config = createConfig({
      STORAGE_DRIVER: 'r2',
      APP_URL: 'https://api.kloel.test',
      JWT_SECRET: 'test-secret',
    });
    const service = new StorageService(config, new StorageDriversService(config));

    const url = service.getPublicUrl('uploads/ws/file.png');

    expect(url).toMatch(/^https:\/\/api\.kloel\.test\/storage\/access\//);
  });
});
