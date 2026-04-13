import { MODULE_METADATA } from '@nestjs/common/constants';
import { HealthModule } from './health.module';
import { SystemHealthService } from './system-health.service';

describe('HealthModule', () => {
  it('exports SystemHealthService for dependent modules', () => {
    const exportedProviders =
      Reflect.getMetadata(MODULE_METADATA.EXPORTS, HealthModule) || [];

    expect(exportedProviders).toContain(SystemHealthService);
  });
});
