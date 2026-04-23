let fallbackSeed = 0x9e3779b9;

/**
 * Returns a random float in [0, 1) without the weak default RNG.
 * Browser crypto is preferred; the deterministic fallback only covers
 * non-browser render paths where visual jitter does not need cryptographic
 * entropy.
 */
export function secureRandomFloat(): number {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.getRandomValues === 'function') {
    const value = new Uint32Array(1);
    cryptoApi.getRandomValues(value);
    return value[0] / 0x100000000;
  }

  fallbackSeed = (fallbackSeed * 1664525 + 1013904223) >>> 0;
  return fallbackSeed / 0x100000000;
}
