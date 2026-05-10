import { MODULE_METADATA, GLOBAL_MODULE_METADATA } from '@nestjs/common/constants';
import { OpsAlertModule } from './ops-alert.module';
import { OpsAlertService } from './ops-alert.service';

describe('OpsAlertModule', () => {
  it('exports OpsAlertService for global injection', () => {
    const exportedProviders = Reflect.getMetadata(MODULE_METADATA.EXPORTS, OpsAlertModule) ?? [];

    expect(exportedProviders).toContain(OpsAlertService);
  });

  it('registers OpsAlertService as a provider', () => {
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, OpsAlertModule) ?? [];

    expect(providers).toContain(OpsAlertService);
  });

  it('is declared as a global module', () => {
    const isGlobal = Reflect.getMetadata(GLOBAL_MODULE_METADATA, OpsAlertModule);

    expect(isGlobal).toBe(true);
  });
});
