import {
  assertProductionStartupSecrets,
  productionStartupRequiredSecrets,
} from './production-startup-guard';

describe('assertProductionStartupSecrets', () => {
  function completeProductionEnv(): Record<string, string> {
    return {
      ...Object.fromEntries(
        productionStartupRequiredSecrets.map((name) => [name, `${name.toLowerCase()}-secret`]),
      ),
      STRIPE_SECRET_KEY: 'sk_live_x',
      STRIPE_PUBLISHABLE_KEY: 'pk_live_x',
    };
  }

  it('does nothing outside production', () => {
    expect(() => assertProductionStartupSecrets({ NODE_ENV: 'test' })).not.toThrow();
    expect(() => assertProductionStartupSecrets({ NODE_ENV: 'development' })).not.toThrow();
  });

  it('throws in production when webhook/token secrets are missing', () => {
    expect(() => assertProductionStartupSecrets({ NODE_ENV: 'production' })).toThrow(
      /META_APP_SECRET/,
    );
  });

  it('requires ads token encryption keys in production', () => {
    expect(productionStartupRequiredSecrets).toEqual(
      expect.arrayContaining([
        'GOOGLE_ADS_TOKEN_ENCRYPTION_KEY',
        'TIKTOK_TOKEN_ENCRYPTION_KEY',
        'STRIPE_SECRET_KEY',
        'STRIPE_PUBLISHABLE_KEY',
      ]),
    );
  });

  it('accepts production when all required secrets are configured', () => {
    expect(() =>
      assertProductionStartupSecrets({
        NODE_ENV: 'production',
        ...completeProductionEnv(),
      }),
    ).not.toThrow();
  });

  it('trims empty configured values', () => {
    expect(() =>
      assertProductionStartupSecrets({
        NODE_ENV: 'production',
        ...completeProductionEnv(),
        TIKTOK_CLIENT_SECRET: '   ',
      }),
    ).toThrow(/TIKTOK_CLIENT_SECRET/);
  });

  it('rejects Stripe test keys in production', () => {
    expect(() =>
      assertProductionStartupSecrets({
        NODE_ENV: 'production',
        ...completeProductionEnv(),
        STRIPE_SECRET_KEY: 'sk_test_x',
      }),
    ).toThrow(/STRIPE_SECRET_KEY \(expected prefix sk_live_\)/);

    expect(() =>
      assertProductionStartupSecrets({
        NODE_ENV: 'production',
        ...completeProductionEnv(),
        STRIPE_PUBLISHABLE_KEY: 'pk_test_x',
      }),
    ).toThrow(/STRIPE_PUBLISHABLE_KEY \(expected prefix pk_live_\)/);
  });
});
