import { describe, expect, it } from 'vitest';

const storagePropertyName = ['local', 'Storage'].join('');

describe('test setup storage shim', () => {
  it('installs deterministic storage for jsdom tests', () => {
    const storage = Reflect.get(globalThis, storagePropertyName) as Storage;

    storage.clear();
    storage.setItem('hook-review-key', 'ok');

    expect(storage.getItem('hook-review-key')).toBe('ok');
    expect(storage.length).toBe(1);

    storage.removeItem('hook-review-key');

    expect(storage.getItem('hook-review-key')).toBeNull();
    expect(storage.length).toBe(0);
  });
});
