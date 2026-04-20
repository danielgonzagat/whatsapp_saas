/**
 * Jest module mapper target for `ioredis` (E2E and unit tests).
 *
 * After PR P2-5 this re-exports the ioredis-mock package instead of
 * a hand-rolled MockRedis. ioredis-mock implements the full ioredis
 * API in-memory, including TTL semantics, hash commands, SET NX,
 * SCAN, pipelines, and pub/sub. The previous hand-rolled mock was
 * missing all of those, which silently masked test bugs where the
 * production code path was never actually exercised.
 *
 * The default export must remain a class so call sites that do
 * `new Redis(...)` keep working.
 */

import IoRedisMock from 'ioredis-mock';

export default IoRedisMock;
/** Redis. */
export type Redis = InstanceType<typeof IoRedisMock>;
/** Redis options. */
export type RedisOptions = Record<string, unknown>;
