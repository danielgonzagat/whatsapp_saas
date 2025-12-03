/**
 * ==========================================================
 * RATE LIMIT & ANTI BAN — Delay humano + jitter
 * ==========================================================
 */

export async function applyRateLimit(workspace) {
  const min = workspace?.jitterMin || 120;
  const max = workspace?.jitterMax || 350;

  const delay =
    Math.floor(Math.random() * (max - min + 1)) + min;

  await new Promise((r) => setTimeout(r, delay));
}

