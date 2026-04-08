/**
 * Verifies that ioredis-mock (used by createRedisClient in test mode
 * after PR P2-5) implements the operations our production code
 * actually uses, with the correct semantics.
 *
 * The previous hand-rolled mock was missing or wrong about:
 *   - TTL on SET EX (silently dropped; tests assumed expiry worked)
 *   - SET NX (returned 'OK' regardless, breaking dedup tests)
 *   - hset/hget/hgetall (not implemented at all)
 *
 * If any of these regress in a future ioredis-mock release, this
 * spec catches it before the affected service tests do.
 */

import { createRedisClient } from './redis.util';

describe('ioredis-mock verification (PR P2-5)', () => {
  it('returns a non-null client in test mode', () => {
    const client = createRedisClient();
    expect(client).not.toBeNull();
  });

  it('supports SET key value EX ttl with TTL inspection via TTL command', async () => {
    const client = createRedisClient();
    await client.set('k1', 'v1', 'EX', 60);
    const ttl = await client.ttl('k1');
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(60);
  });

  it('supports atomic SET NX (returns null on duplicate)', async () => {
    const client = createRedisClient();
    const first = await (client as any).set('lock:1', 'tok1', 'EX', 60, 'NX');
    expect(first).toBe('OK');
    const second = await (client as any).set('lock:1', 'tok2', 'EX', 60, 'NX');
    expect(second).toBeNull();
  });

  it('supports hash commands (hset, hget, hgetall)', async () => {
    const client = createRedisClient();
    await client.hset('h1', 'field1', 'value1');
    await client.hset('h1', 'field2', 'value2');
    expect(await client.hget('h1', 'field1')).toBe('value1');
    expect(await client.hgetall('h1')).toEqual({
      field1: 'value1',
      field2: 'value2',
    });
  });

  it('supports incr/incrby with consistent counters', async () => {
    const client = createRedisClient();
    await client.del('counter:1').catch(() => 0);
    expect(await client.incr('counter:1')).toBe(1);
    expect(await client.incr('counter:1')).toBe(2);
    expect(await client.incrby('counter:1', 5)).toBe(7);
  });

  it('supports del returning number of keys removed', async () => {
    const client = createRedisClient();
    await client.set('to-delete', 'x');
    expect(await client.del('to-delete')).toBe(1);
    expect(await client.del('to-delete')).toBe(0);
  });

  it('shares state across instances (matches real Redis server behavior)', async () => {
    // ioredis-mock simulates a single Redis server: multiple client
    // instances created via createRedisClient() see the same data,
    // exactly like multiple ioredis clients connected to one prod
    // Redis server. Tests that need isolation must call flushall()
    // in beforeEach (see the documentation in createRedisClient).
    const a = createRedisClient();
    const b = createRedisClient();
    await a.set('p2-5-shared-state', 'visible-everywhere');
    expect(await b.get('p2-5-shared-state')).toBe('visible-everywhere');
    await a.del('p2-5-shared-state');
  });
});
