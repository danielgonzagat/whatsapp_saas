const CI_TEST_FALLBACK = 'kloel-admin-ci-test-secret-not-for-production';

/** Resolve the required admin JWT secret from config/environment.
 *
 * In CI / test environments (NODE_ENV=test or CI=true) a deterministic
 * fallback is used so the boot-smoke and unit tests can run without
 * provisioning secrets.  Any real deploy sets NODE_ENV=production and
 * must supply ADMIN_JWT_SECRET explicitly.
 */
export function resolveRequiredAdminJwtSecret(secret: string | null | undefined): string {
  const value = secret?.trim();
  if (value) {
    return value;
  }

  if (process.env.NODE_ENV === 'test' || process.env.CI === 'true') {
    return CI_TEST_FALLBACK;
  }

  throw new Error('ADMIN_JWT_SECRET must be set to boot or verify the admin module');
}
