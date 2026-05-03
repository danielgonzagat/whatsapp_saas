export type {
  DesignTokenSourceKind,
  DiscoveredDesignColorEvidence,
  DesignTokenDiscoveryResult,
  DesignTokenDiscoveryOptions,
} from './types';
export { discoverDesignTokens } from './discovery-engine';

function normalizeColorValue(value: string): string {
  const trimmed = collapseWhitespace(value.trim());
  if (trimmed.startsWith('#')) return trimmed.toLowerCase();
  return trimmed
    .split(',')
    .map((p) => p.trim())
    .join(', ')
    .replace('( ', '(')
    .replace(' )', ')')
    .toLowerCase();
}

function collapseWhitespace(value: string): string {
  let output = '';
  let prev = false;
  for (const ch of value) {
    const ws =
      ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '\f' || ch === '\v';
    if (ws) {
      if (!prev) output += ' ';
      prev = true;
      continue;
    }
    output += ch;
    prev = false;
  }
  return output;
}

export function isDiscoveredDesignColor(
  value: string,
  discovery: DesignTokenDiscoveryResult,
): boolean {
  return discovery.allowedColors.includes(normalizeColorValue(value));
}

export function findDiscoveredDesignColorEvidence(
  value: string,
  discovery: DesignTokenDiscoveryResult,
): DiscoveredDesignColorEvidence[] {
  const normalizedValue = normalizeColorValue(value);
  return discovery.colors.filter((color) => color.normalizedValue === normalizedValue);
}
