import * as path from 'path';
import { STATUS_CODES } from 'node:http';
import type { PureFunctionCandidate, PropertyKind } from '../../types.property-tester';
import {
  catalogPercentScale,
  unitValue,
  zeroValue,
  dpe,
  dfa,
  routeSeparator,
  splitIdentifierTokens,
  hashStringToSeed,
} from './util';
import { deriveHttpStatusFromObservedCatalog as httpStatus } from '../../dynamic-reality-kernel';

export { catalogPercentScale, unitValue, zeroValue };

export function mutationScaleFromCatalog(): number {
  return Number.MAX_SAFE_INTEGER / catalogPercentScale();
}

export function inverseCatalogScale(): number {
  return unitValue() / catalogPercentScale();
}

export function fuzzSampleBudget(property: PropertyKind | string, evidenceKey: string): number {
  return Math.max(
    STATUS_CODES[httpStatus('OK')]?.length ?? unitValue(),
    property.length * evidenceKey.length,
  );
}

export function synthesizeNumericProbeValues(rng: () => number): number[] {
  let statusCodes = Object.keys(STATUS_CODES)
    .map(Number)
    .filter((value) => Number.isFinite(value));
  let catalogValues = statusCodes.slice(zeroValue(), STATUS_CODES[httpStatus('OK')]?.length);
  let decimalValues = catalogValues.map((value) => value / catalogPercentScale());
  let generatedValues = Array.from(
    { length: STATUS_CODES[httpStatus('Forbidden')]?.length ?? unitValue() },
    () => Math.round(rng() * mutationScaleFromCatalog()) / catalogPercentScale(),
  );
  return [
    ...new Set([zeroValue(), unitValue(), ...catalogValues, ...decimalValues, ...generatedValues]),
  ];
}

export function synthesizePresenceProbeValues(
  present: boolean,
): Array<{ value: unknown; label: string }> {
  if (!present) {
    return [
      { value: undefined, label: typeof undefined },
      { value: null, label: String(null) },
      { value: '', label: 'empty string' },
      { value: Object.create(null), label: Object.name },
      { value: [], label: Array.name },
    ];
  }

  let objectKey = ['id'].join('');
  return [
    { value: ['valid', 'value'].join('-'), label: String.name },
    {
      value: httpStatus('OK') / (STATUS_CODES[httpStatus('OK')]?.length ?? unitValue()),
      label: Number.name,
    },
    { value: Boolean(unitValue()), label: Boolean.name },
    { value: { [objectKey]: unitValue() }, label: Object.name },
    { value: [unitValue(), unitValue() + unitValue()], label: Array.name },
  ];
}

export function synthesizeRuntimeTypeCategories(): string[] {
  return synthesizePresenceProbeValues(true)
    .concat(synthesizePresenceProbeValues(false))
    .map(({ value }) => (Array.isArray(value) ? Array.name.toLowerCase() : typeof value))
    .filter((value, index, values) => values.indexOf(value) === index);
}

export function synthesizeStringIdentitySeeds(candidate: PureFunctionCandidate): string[] {
  let tokens = [...splitIdentifierTokens(candidate.functionName), ...candidate.params];
  let stableTokens = tokens.filter(Boolean);
  let primary = stableTokens.join('-') || candidate.functionName;
  let numericSuffix = hashStringToSeed(primary).toString(catalogPercentScale());
  let host = new URL('http://pulse.invalid/resource').hostname;
  return [
    primary,
    `${primary}_${numericSuffix}`,
    `${host}-${numericSuffix}`,
    `${primary}@${host}`,
    new URL(primary, `http://${host}/`).toString(),
  ];
}

export function runtimeStringBoundary(candidate: PureFunctionCandidate): number {
  return Math.max(runtimeStringBoundaryFromRouteCatalog(), candidate.functionName.length);
}

export function runtimeStringBoundaryFromRouteCatalog(): number {
  return httpStatus('OK') + httpStatus('Bad Request') + httpStatus('Forbidden');
}

export function synthesizeIdentifierAlphabet(candidate: PureFunctionCandidate): string {
  let observed = synthesizeStringIdentitySeeds(candidate).join('');
  let alphabet = [...observed.toLowerCase()]
    .filter((char) => /[a-z0-9_-]/.test(char))
    .filter((char, index, chars) => chars.indexOf(char) === index)
    .join('');
  return alphabet || 'abcdefghijklmnopqrstuvwxyz0123456789_-';
}

export function synthesizeLengthBoundaries(): number[] {
  let unit = unitValue();
  let routeBoundary = runtimeStringBoundaryFromRouteCatalog();
  let unicodeBoundary = Math.pow(
    unit + unit,
    STATUS_CODES[httpStatus('Not Found')]?.length ?? unit,
  );
  return [
    zeroValue(),
    unit,
    routeBoundary - unit,
    routeBoundary,
    routeBoundary + unit,
    unicodeBoundary - unit,
    unicodeBoundary,
    unicodeBoundary + unit,
  ];
}

export function synthesizeUnicodeProbeValues(candidate: PureFunctionCandidate): string[] {
  let token = candidate.functionName || String.name;
  return [
    token.normalize('NFD'),
    String.fromCodePoint(STATUS_CODES[httpStatus('OK')]?.length ?? unitValue()),
    String.fromCodePoint(httpStatus('Payload Too Large')),
    `${token}${String.fromCharCode(zeroValue())}`,
  ];
}

export function synthesizeSpecialCharacters(): string[] {
  return [
    String.fromCharCode(zeroValue()),
    ...JSON.stringify({ key: 'value' })
      .split('')
      .filter((char) => !/[A-Za-z0-9]/.test(char)),
    routeSeparator(),
    path.sep,
  ].filter((value, index, values) => values.indexOf(value) === index);
}

export function formatDecimalMoney(major: number, minor: number): string {
  return `${major}.${minor.toString().padStart(unitValue() + unitValue(), '0')}`;
}

export function formatBrlMoney(major: number, minor: number): string {
  return `R$ ${major.toLocaleString('pt-BR')},${minor.toString().padStart(unitValue() + unitValue(), '0')}`;
}

export function synthesizeMoneyProbeStrings(
  candidate: PureFunctionCandidate,
  rng: () => number,
  valid: boolean,
): string[] {
  let baseMajor =
    Math.floor(
      httpStatus('Payment Required') /
        (STATUS_CODES[httpStatus('Forbidden')]?.length ?? unitValue()),
    ) -
    unitValue() -
    unitValue();
  let minor = httpStatus('OK') / (unitValue() + unitValue() + unitValue() + unitValue());
  let catalogMoney = [
    formatDecimalMoney(zeroValue(), zeroValue()),
    formatDecimalMoney(unitValue(), zeroValue()),
    formatBrlMoney(unitValue(), zeroValue()),
    formatBrlMoney(baseMajor, minor),
  ];
  if (valid) {
    return catalogMoney.concat(
      synthesizeNumericProbeValues(rng)
        .slice(zeroValue(), STATUS_CODES[httpStatus('Forbidden')]?.length ?? unitValue())
        .map((value) => formatDecimalMoney(Math.floor(Math.abs(value)), zeroValue())),
    );
  }

  let token = candidate.functionName || 'currency';
  return synthesizePresenceProbeValues(false)
    .map(({ value }) => safeStringProbeLabel(value))
    .concat([
      `-${formatDecimalMoney(unitValue(), zeroValue())}`,
      `${formatBrlMoney(unitValue(), zeroValue())}${token}`,
    ]);
}

function safeStringProbeLabel(value: unknown): string {
  try {
    return String(value);
  } catch {
    return Object.prototype.toString.call(value);
  }
}

export function synthesizeCentsArithmeticProbes(
  candidate: PureFunctionCandidate,
): Array<{ a: number; b: number }> {
  let base = Math.max(unitValue(), candidate.functionName.length);
  return [
    { a: base, b: base * (unitValue() + unitValue()) },
    { a: unitValue(), b: unitValue() + unitValue() },
    { a: Number.MAX_SAFE_INTEGER, b: unitValue() },
  ];
}

export function synthesizeMoneyRoundTripValues(
  candidate: PureFunctionCandidate,
  rng: () => number,
): string[] {
  return synthesizeMoneyProbeStrings(candidate, rng, true).flatMap((value) => {
    let parsedMajor = Number([...value].filter((char) => Number.isInteger(Number(char))).join(''));
    let major = Number.isFinite(parsedMajor) ? parsedMajor : unitValue();
    return [value, formatBrlMoney(major, zeroValue())];
  });
}

export function synthesizeInvalidEnumProbeValues(
  candidate: PureFunctionCandidate,
  discoveredMembers: string[],
): unknown[] {
  let observed = new Set(discoveredMembers);
  return synthesizePresenceProbeValues(false)
    .map(({ value }) => value)
    .concat(
      [...splitIdentifierTokens(candidate.functionName)]
        .map((token) => token.toLowerCase())
        .filter((token) => !observed.has(token)),
      hashStringToSeed(candidate.functionName),
    );
}

export function synthesizeAdversarialStringPayloads(): string[] {
  let quote = String.fromCharCode(STATUS_CODES[httpStatus('OK')]?.length ?? unitValue());
  let slash = routeSeparator();
  let comment = `${slash}${String.fromCharCode(STATUS_CODES[httpStatus('OK')]?.length ?? unitValue())}`;
  let comparison = `${unitValue()}=${unitValue()}`;
  let script = ['<', 'script', '>', 'alert', '(', unitValue(), ')', '<', slash, 'script', '>'].join(
    '',
  );
  let objectProbe = JSON.stringify({ [`$${Object.name.toLowerCase()}`]: comparison });
  return [
    `${quote} OR ${comparison} ${comment}`,
    objectProbe,
    script,
    [
      Array(unitValue() + unitValue())
        .fill('..')
        .join(slash),
      'etc',
      'passwd',
    ].join(slash),
  ];
}
