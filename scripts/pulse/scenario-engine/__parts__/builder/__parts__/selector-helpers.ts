// PULSE Wave 5 — Scenario Selector Helpers
// Part of builder sub-decomposition: selector token normalization

import { deriveLengthBoundariesFromObservedCatalog } from '../../../../dynamic-reality-kernel';
import { _okTextLen, _scale, _unit, _zero } from '../../queries';

const _selectorMaxLen =
  deriveLengthBoundariesFromObservedCatalog()[
    deriveLengthBoundariesFromObservedCatalog().length - _unit
  ] ?? _okTextLen * _scale;

export function normalizeSelectorToken(inputName: string, fallbackIndex: number): string {
  const trimmed = inputName.trim();
  if (isStableSelectorToken(trimmed)) {
    return trimmed;
  }
  const normalized = normalizeSelectorCharacters(trimmed).slice(_zero, _selectorMaxLen);
  return normalized || `pulse-field-${fallbackIndex}`;
}

export function isStableSelectorToken(value: string): boolean {
  const _maxLen = _selectorMaxLen + _selectorMaxLen;
  if (value.length === _zero || value.length > _maxLen || !isAsciiLetter(value[_zero])) {
    return false;
  }
  return value
    .split('')
    .every(
      (char) =>
        isAsciiLetter(char) ||
        (char >= '0' && char <= '9') ||
        char === '_' ||
        char === '.' ||
        char === ':' ||
        char === '-',
    );
}

export function normalizeSelectorCharacters(value: string): string {
  const output: string[] = [];
  for (const char of value) {
    const isLetter = isAsciiLetter(char);
    const isDigit = char >= '0' && char <= '9';
    if (isLetter || isDigit || char === '_' || char === '-') {
      output.push(char.toLowerCase());
      continue;
    }
    if (output.length > 0 && output[output.length - 1] !== '-') {
      output.push('-');
    }
  }
  while (output[0] === '-') {
    output.shift();
  }
  while (output[output.length - 1] === '-') {
    output.pop();
  }
  return output.join('');
}

export function isAsciiLetter(char: string): boolean {
  const lower = char.toLowerCase();
  return lower >= 'a' && lower <= 'z';
}

export function buildInputSelector(inputName: string, fallbackIndex: number): string {
  const token = normalizeSelectorToken(inputName, fallbackIndex);
  return `[name="${token}"], [data-testid="${token}"]`;
}
