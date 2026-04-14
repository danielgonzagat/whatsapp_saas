import '@testing-library/jest-dom';

// Ensure localStorage is available in the test environment
if (
  typeof globalThis.localStorage === 'undefined' ||
  typeof globalThis.localStorage.removeItem !== 'function'
) {
  const store: Record<string, string> = {};
  globalThis.localStorage = {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = String(value);
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      for (const k of Object.keys(store)) delete store[k];
    },
    get length() {
      return Object.keys(store).length;
    },
    key: (index: number) => Object.keys(store)[index] ?? null,
  };
}
