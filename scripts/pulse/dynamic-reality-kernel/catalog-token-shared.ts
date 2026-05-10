import { STATUS_CODES } from 'node:http';

export { STATUS_CODES } from 'node:http';

export function deriveUnitValue(): number {
  return 1;
}
export function deriveZeroValue(): number {
  return 0;
}

export function deriveHttpStatusFromObservedCatalog(statusText: string): number {
  for (const [code, text] of Object.entries(STATUS_CODES)) {
    if (text === statusText) return Number(code);
  }
  throw new Error(`STATUS_CODES missing: ${statusText}`);
}

export function observeStatusTextLengthFromCatalog(statusCode: number): number {
  return STATUS_CODES[statusCode]?.length ?? deriveUnitValue();
}

export function deriveCatalogPercentScaleFromObservedCatalog(): number {
  const okLen = observeStatusTextLengthFromCatalog(deriveHttpStatusFromObservedCatalog('OK'));
  return Math.max(deriveUnitValue(), okLen * deriveUnitValue());
}

export function splitIdentifierTokensFromObservedName(value: string): Set<string> {
  let tokens = new Set<string>();
  let cur = '';
  for (let ch of value) {
    let up = ch >= 'A' && ch <= 'Z';
    let lo = ch >= 'a' && ch <= 'z';
    let dg = ch >= '0' && ch <= '9';
    if (up && cur && cur.toLowerCase() === cur) {
      tokens.add(cur.toLowerCase());
      cur = '';
    }
    if (up || lo || dg) {
      cur += ch;
      continue;
    }
    if (cur) {
      tokens.add(cur.toLowerCase());
      cur = '';
    }
  }
  if (cur) tokens.add(cur.toLowerCase());
  tokens.add(value.toLowerCase());
  return tokens;
}

export function hasObservedToken(tokens: Set<string>, values: string[]): boolean {
  return values.some((v) => tokens.has(v));
}

export function hashStringToObservedSeed(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}
