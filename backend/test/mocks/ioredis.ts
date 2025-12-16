// Jest E2E mock for ioredis
// Keeps an in-memory store and provides the small surface used by this codebase.

import { EventEmitter } from 'events';

class MockRedis extends EventEmitter {
  private store = new Map<string, any>();

  constructor(..._args: any[]) {
    super();
  }

  async get(key: string) {
    return this.store.get(key);
  }

  async set(key: string, value: any) {
    this.store.set(key, value);
    return 'OK';
  }

  async setex(key: string, _ttl: number, value: any) {
    this.store.set(key, value);
    return 'OK';
  }

  async incr(key: string) {
    const v = (this.store.get(key) || 0) + 1;
    this.store.set(key, v);
    return v;
  }

  async incrby(key: string, n: number) {
    const v = (this.store.get(key) || 0) + n;
    this.store.set(key, v);
    return v;
  }

  async expire(_key: string, _ttl: number) {
    return 1;
  }

  async lrange(_key: string, _start: number, _stop: number) {
    return [];
  }

  async rpush(_key: string, ..._values: any[]) {
    return 0;
  }

  async publish(_channel: string, _message: string) {
    return 1;
  }

  async subscribe(_channel: string) {
    return 1;
  }

  async psubscribe(_pattern: string) {
    return 1;
  }

  duplicate() {
    return new (MockRedis as any)();
  }

  async quit() {
    this.removeAllListeners();
  }

  disconnect() {
    this.removeAllListeners();
  }
}

export default MockRedis;
export type Redis = MockRedis;
export type RedisOptions = any;
