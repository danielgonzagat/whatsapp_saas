import { PulseService } from '../../src/pulse/pulse.service';

/** Internal async method. */
export type InternalAsyncMethod = (...args: never[]) => Promise<unknown>;
/** Internal task runner. */
export type InternalTaskRunner = (label: string, task: () => Promise<unknown>) => void;

/** Flush microtasks. */
export const flushMicrotasks = () => new Promise((resolve) => setImmediate(resolve));
/** Set internal value. */
export const setInternalValue = (target: object, key: string, value: unknown) =>
  Object.defineProperty(target, key, { value, configurable: true });
/** Expect nth background task call. */
export const expectNthBackgroundTaskCall = (spy: jest.SpyInstance, index: number, label: string) =>
  expect(spy).toHaveBeenNthCalledWith(index, label, expect.anything());
/** Spy on run background task. */
export const spyOnRunBackgroundTask = (service: object) =>
  jest.spyOn(
    service as unknown as { runBackgroundTask: (label: string, task: () => Promise<void>) => void },
    'runBackgroundTask',
  );

/** Fake redis. */
export class FakeRedis {
  strings = new Map<string, string>();
  hashes = new Map<string, Map<string, string>>();
  lists = new Map<string, string[]>();
  published: Array<{ channel: string; message: string }> = [];

  get(key: string) {
    return Promise.resolve(this.strings.get(key) ?? null);
  }

  set(key: string, value: string, ...args: Array<string | number>) {
    const nx = args.includes('NX');
    if (nx && this.strings.has(key)) {
      return Promise.resolve(null);
    }
    this.strings.set(key, value);
    return Promise.resolve('OK');
  }

  del(key: string) {
    const existed = this.strings.delete(key);
    return Promise.resolve(existed ? 1 : 0);
  }

  hgetall(key: string) {
    return Promise.resolve(Object.fromEntries(this.hashes.get(key)?.entries() ?? []));
  }

  hdel(key: string, field: string) {
    const hash = this.hashes.get(key);
    if (!hash) return Promise.resolve(0);
    const existed = hash.delete(field);
    if (hash.size === 0) {
      this.hashes.delete(key);
    }
    return Promise.resolve(existed ? 1 : 0);
  }

  lrange(key: string, start: number, stop: number) {
    const list = this.lists.get(key) ?? [];
    const end = stop < 0 ? undefined : stop + 1;
    return Promise.resolve(list.slice(start, end));
  }

  multi() {
    return new FakeRedisTransaction(this);
  }

  pipeline() {
    return new FakeRedisPipeline(this);
  }
}

class FakeRedisTransaction {
  private readonly actions: Array<() => unknown> = [];

  constructor(private readonly redis: FakeRedis) {}

  set(key: string, value: string, ...args: Array<string | number>) {
    this.actions.push(() => this.redis.set(key, value, ...args));
    return this;
  }

  hset(key: string, field: string, value: string) {
    this.actions.push(() => {
      let hash = this.redis.hashes.get(key);
      if (!hash) {
        hash = new Map();
        this.redis.hashes.set(key, hash);
      }
      hash.set(field, value);
      return 1;
    });
    return this;
  }

  hdel(key: string, field: string) {
    this.actions.push(() => this.redis.hdel(key, field));
    return this;
  }

  del(key: string) {
    this.actions.push(() => this.redis.del(key));
    return this;
  }

  lpush(key: string, value: string) {
    this.actions.push(() => {
      const list = this.redis.lists.get(key) ?? [];
      list.unshift(value);
      this.redis.lists.set(key, list);
      return list.length;
    });
    return this;
  }

  ltrim(key: string, start: number, stop: number) {
    this.actions.push(() => {
      const list = this.redis.lists.get(key) ?? [];
      const trimmed = list.slice(start, stop + 1);
      this.redis.lists.set(key, trimmed);
      return 'OK';
    });
    return this;
  }

  publish(channel: string, message: string) {
    this.actions.push(() => {
      this.redis.published.push({ channel, message });
      return 1;
    });
    return this;
  }

  async exec() {
    return Promise.all(
      this.actions.map(async (action) => [null, await action()] as [null, unknown]),
    );
  }
}

class FakeRedisPipeline {
  private readonly actions: Array<() => Promise<string | null> | string | null> = [];

  constructor(private readonly redis: FakeRedis) {}

  get(key: string) {
    this.actions.push(() => this.redis.get(key));
    return this;
  }

  async exec() {
    return Promise.all(
      this.actions.map(async (action) => [null, await action()] as [null, unknown]),
    );
  }
}

/** Create service. */
export function createService({
  redis = new FakeRedis(),
  healthCheck = jest.fn().mockResolvedValue({ status: 'UP', details: {} }),
  configGet = jest.fn().mockReturnValue(''),
}: {
  redis?: FakeRedis;
  healthCheck?: jest.Mock;
  configGet?: jest.Mock;
} = {}) {
  const service = new PulseService(
    redis as never,
    { check: healthCheck } as never,
    { get: configGet } as never,
  );

  return { service, redis, healthCheck, configGet };
}

/** Get internal async method. */
export function getInternalAsyncMethod(service: object, name: string): InternalAsyncMethod {
  const method = Reflect.get(service, name);
  if (typeof method !== 'function') {
    throw new Error(`Expected PulseService.${name} to be a function.`);
  }
  return method.bind(service) as InternalAsyncMethod;
}

/** Get internal task runner. */
export function getInternalTaskRunner(service: object): InternalTaskRunner {
  const method = Reflect.get(service, 'runBackgroundTask');
  if (typeof method !== 'function') {
    throw new Error('Expected PulseService.runBackgroundTask to be a function.');
  }
  return method.bind(service) as InternalTaskRunner;
}
