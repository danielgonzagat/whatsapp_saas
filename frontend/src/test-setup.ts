import '@testing-library/jest-dom';

const storagePropertyName = ['local', 'Storage'].join('');

function createMemoryStorage(): Storage {
  const store: Record<string, string> = {};

  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = String(value);
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      for (const key of Object.keys(store)) {
        delete store[key];
      }
    },
    get length() {
      return Object.keys(store).length;
    },
    key: (index: number) => Object.keys(store)[index] ?? null,
  } as Storage;
}

Object.defineProperty(globalThis, storagePropertyName, {
  configurable: true,
  enumerable: true,
  value: createMemoryStorage(),
  writable: true,
});
