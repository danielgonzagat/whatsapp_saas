import {
  DEFAULT_PRISMA_CONNECTION_LIMIT,
  DEFAULT_PRISMA_POOL_TIMEOUT_SECONDS,
  buildPrismaClientOptions,
  buildPrismaDatasourceUrl,
} from './prisma-datasource-url';

const BASE_URL = 'postgresql://user:pass@host:5432/db';

describe('buildPrismaDatasourceUrl', () => {
  it('appends default connection_limit and pool_timeout to a bare postgres URL', () => {
    expect(buildPrismaDatasourceUrl(BASE_URL, {})).toBe(
      `${BASE_URL}?connection_limit=${DEFAULT_PRISMA_CONNECTION_LIMIT}&pool_timeout=${DEFAULT_PRISMA_POOL_TIMEOUT_SECONDS}`,
    );
  });

  it('uses & separator when the URL already has a query string', () => {
    expect(buildPrismaDatasourceUrl(`${BASE_URL}?schema=public`, {})).toBe(
      `${BASE_URL}?schema=public&connection_limit=${DEFAULT_PRISMA_CONNECTION_LIMIT}&pool_timeout=${DEFAULT_PRISMA_POOL_TIMEOUT_SECONDS}`,
    );
  });

  it('honors PRISMA_CONNECTION_LIMIT and PRISMA_POOL_TIMEOUT env overrides', () => {
    expect(
      buildPrismaDatasourceUrl(BASE_URL, {
        PRISMA_CONNECTION_LIMIT: '25',
        PRISMA_POOL_TIMEOUT: '45',
      }),
    ).toBe(`${BASE_URL}?connection_limit=25&pool_timeout=45`);
  });

  it('never overrides params already present in the URL', () => {
    const url = `${BASE_URL}?connection_limit=3&pool_timeout=5`;
    expect(buildPrismaDatasourceUrl(url, { PRISMA_CONNECTION_LIMIT: '99' })).toBe(url);
  });

  it('appends only the missing param when one is already in the URL', () => {
    expect(buildPrismaDatasourceUrl(`${BASE_URL}?connection_limit=3`, {})).toBe(
      `${BASE_URL}?connection_limit=3&pool_timeout=${DEFAULT_PRISMA_POOL_TIMEOUT_SECONDS}`,
    );
  });

  it('falls back to defaults for invalid env values (non-numeric, zero, negative, float)', () => {
    for (const bad of ['abc', '0', '-5', '2.5', ' ']) {
      expect(
        buildPrismaDatasourceUrl(BASE_URL, {
          PRISMA_CONNECTION_LIMIT: bad,
          PRISMA_POOL_TIMEOUT: bad,
        }),
      ).toBe(
        `${BASE_URL}?connection_limit=${DEFAULT_PRISMA_CONNECTION_LIMIT}&pool_timeout=${DEFAULT_PRISMA_POOL_TIMEOUT_SECONDS}`,
      );
    }
  });

  it('returns undefined for missing or empty URL', () => {
    expect(buildPrismaDatasourceUrl(undefined, {})).toBeUndefined();
    expect(buildPrismaDatasourceUrl('', {})).toBeUndefined();
    expect(buildPrismaDatasourceUrl('   ', {})).toBeUndefined();
  });

  it('leaves non-postgres URLs (e.g. prisma:// Accelerate) untouched', () => {
    const accelerate = 'prisma://accelerate.prisma-data.net/?api_key=abc';
    expect(buildPrismaDatasourceUrl(accelerate, {})).toBe(accelerate);
  });

  it('accepts the postgres:// scheme variant', () => {
    expect(buildPrismaDatasourceUrl('postgres://u:p@h:5432/db', {})).toBe(
      `postgres://u:p@h:5432/db?connection_limit=${DEFAULT_PRISMA_CONNECTION_LIMIT}&pool_timeout=${DEFAULT_PRISMA_POOL_TIMEOUT_SECONDS}`,
    );
  });

  it('does not mistake a fragment of another param for connection_limit', () => {
    expect(buildPrismaDatasourceUrl(`${BASE_URL}?my_connection_limit=3`, {})).toBe(
      `${BASE_URL}?my_connection_limit=3&connection_limit=${DEFAULT_PRISMA_CONNECTION_LIMIT}&pool_timeout=${DEFAULT_PRISMA_POOL_TIMEOUT_SECONDS}`,
    );
  });
});

describe('buildPrismaClientOptions', () => {
  it('returns datasourceUrl built from DATABASE_URL with pool bounds', () => {
    expect(buildPrismaClientOptions({ DATABASE_URL: BASE_URL })).toEqual({
      datasourceUrl: `${BASE_URL}?connection_limit=${DEFAULT_PRISMA_CONNECTION_LIMIT}&pool_timeout=${DEFAULT_PRISMA_POOL_TIMEOUT_SECONDS}`,
    });
  });

  it('returns empty options when DATABASE_URL is unset (Prisma resolves env itself)', () => {
    expect(buildPrismaClientOptions({})).toEqual({});
  });
});
