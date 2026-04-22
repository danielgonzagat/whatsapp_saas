import { randomInt } from 'node:crypto';

/**
 * ==========================================================
 * RATE LIMIT & ANTI BAN — Delay humano + jitter
 * ==========================================================
 */

export async function applyRateLimit(workspace) {
  const min = workspace?.jitterMin || 120;
  const max = Math.max(min, workspace?.jitterMax || 350);

  const delay = min + randomInt(max - min + 1);

  await new Promise((r) => setTimeout(r, delay));
}
