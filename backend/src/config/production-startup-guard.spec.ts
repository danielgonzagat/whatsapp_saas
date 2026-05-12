import {
  assertProductionStartupSecrets,
  productionStartupRequiredSecrets,
} from './production-startup-guard';

describe('assertProductionStartupSecrets', () => {
  it('does nothing outside production', () => {
    expect(() => assertProductionStartupSecrets({ NODE_ENV: 'test' })).not.toThrow();
    expect(() => assertProductionStartupSecrets({ NODE_ENV: 'development' })).not.toThrow();
  });

  it('throws in production when webhook/token secrets are missing', () => {
    expect(() => assertProductionStartupSecrets({ NODE_ENV: 'production' })).toThrow(
      /META_APP_SECRET/,
    );
  });

  it('accepts production when all required secrets are configured', () => {
    const env = Object.fromEntries(
      productionStartupRequiredSecrets.map((name) => [name, `${name.toLowerCase()}-secret`]),
    );

    expect(() =>
      assertProductionStartupSecrets({
        NODE_ENV: 'production',
        ...env,
      }),
    ).not.toThrow();
  });

  it('trims empty configured values', () => {
    const env = Object.fromEntries(
      productionStartupRequiredSecrets.map((name) => [name, `${name.toLowerCase()}-secret`]),
    );

    expect(() =>
      assertProductionStartupSecrets({
        NODE_ENV: 'production',
        ...env,
        TIKTOK_CLIENT_SECRET: '   ',
      }),
    ).toThrow(/TIKTOK_CLIENT_SECRET/);
  });
});
