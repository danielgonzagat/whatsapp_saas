export interface SeededRandom {
  bool(probability: number): boolean;
  int(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  value(): number;
}

export function createSeededRandom(seed: string | number): SeededRandom {
  let state = hashSeed(String(seed));
  const next = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  return {
    bool(probability) {
      return next() < probability;
    },
    int(min, max) {
      return Math.floor(next() * (max - min + 1)) + min;
    },
    pick(items) {
      if (items.length === 0) {
        throw new Error('Cannot pick from empty array');
      }
      return items[this.int(0, items.length - 1)]!;
    },
    value: next,
  };
}

function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (const char of seed) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
