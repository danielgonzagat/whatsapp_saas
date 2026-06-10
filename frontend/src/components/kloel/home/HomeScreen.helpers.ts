import { secureRandomFloat } from '@/lib/secure-random';
// Pure helpers extracted from HomeScreen.tsx to reduce the host
// component's cyclomatic complexity. Behaviour is byte-identical to the
// original inline implementation so no visual/behavioural delta is
// introduced.


/**
 * Compute the per-character delay (in ms) for the HomeScreen typewriter
 * simulation. Preserves the original weighting table character-for-character.
 */
const TYPING_DELAYS: Record<string, () => number> = {
  '.': () => 150 + secureRandomFloat() * 100,
  '!': () => 150 + secureRandomFloat() * 100,
  '?': () => 150 + secureRandomFloat() * 100,
  ',': () => 80 + secureRandomFloat() * 40,
  '\n': () => 120 + secureRandomFloat() * 80,
  ' ': () => 10 + secureRandomFloat() * 15,
};

/** Typing simulation delay. */
export function typingSimulationDelay(char: string): number {
  if (secureRandomFloat() < 0.08) {
    return 2;
  }
  const specific = TYPING_DELAYS[char];
  return specific ? specific() : 15 + secureRandomFloat() * 25;
}

export const formatCurrency = (amountInCents: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  }).format((Number(amountInCents || 0) || 0) / 100);

export const formatInteger = (value: number) =>
  new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(Number(value || 0) || 0);

export const formatOneDecimal = (value: number, suffix = '') =>
  `${new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(Number(value || 0) || 0)}${suffix}`;
