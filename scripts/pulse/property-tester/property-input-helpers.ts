import { STATUS_CODES } from 'node:http';
import {
  deriveAdversarialPayloadsFromObservedEvidence,
  deriveFuzzBudgetFromObservedDimensions,
  deriveIdentifierAlphabetFromObservedSeeds,
  deriveLengthBoundariesFromObservedCatalog,
  deriveMoneyProbeStringsFromObservedCatalog,
  deriveNumericProbeValuesFromObservedCatalog,
  deriveRuntimeStringBoundaryFromObservedCatalog,
  deriveSpecialCharactersFromRuntimeEvidence,
} from '../../dynamic-reality-kernel/__parts__/profile-derivations';
import {
  deriveCatalogPercentScaleFromObservedCatalog,
  deriveHttpStatusFromObservedCatalog as httpStatus,
  deriveUnitValue,
  deriveZeroValue,
} from '../../dynamic-reality-kernel/__parts__/catalog-arithmetic';
import {
  deriveStringIdentitySeedsFromCandidate,
  splitIdentifierTokensFromObservedName,
} from '../../dynamic-reality-kernel/__parts__/token-evidence';

export function mutationScaleFromCatalog(): number {
  return Number.MAX_SAFE_INTEGER / deriveCatalogPercentScaleFromObservedCatalog();
}

export function inverseCatalogScale(): number {
  return deriveUnitValue() / deriveCatalogPercentScaleFromObservedCatalog();
}

export function fuzzSampleBudget(property: string, evidenceKey: string): number {
  return deriveFuzzBudgetFromObservedDimensions(String(property), evidenceKey);
}

export function synthesizeNumericProbeValues(rng: () => number): number[] {
  return deriveNumericProbeValuesFromObservedCatalog(rng);
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
      value: httpStatus('OK') / (STATUS_CODES[httpStatus('OK')]?.length ?? deriveUnitValue()),
      label: Number.name,
    },
    { value: Boolean(deriveUnitValue()), label: Boolean.name },
    { value: { [objectKey]: deriveUnitValue() }, label: Object.name },
    { value: [deriveUnitValue(), deriveUnitValue() + deriveUnitValue()], label: Array.name },
  ];
}

export function synthesizeRuntimeTypeCategories(): string[] {
  return synthesizePresenceProbeValues(true)
    .concat(synthesizePresenceProbeValues(false))
    .map(({ value }) => (Array.isArray(value) ? Array.name.toLowerCase() : typeof value))
    .filter((value, index, values) => values.indexOf(value) === index);
}

export function synthesizeStringIdentitySeeds(candidate: {
  functionName: string;
  params: string[];
}): string[] {
  return deriveStringIdentitySeedsFromCandidate(candidate.functionName, candidate.params);
}

export function runtimeStringBoundary(candidate: { functionName: string }): number {
  return Math.max(runtimeStringBoundaryFromRouteCatalog(), candidate.functionName.length);
}

export function runtimeStringBoundaryFromRouteCatalog(): number {
  return deriveRuntimeStringBoundaryFromObservedCatalog();
}

export function synthesizeIdentifierAlphabet(candidate: {
  functionName: string;
  params: string[];
}): string {
  return deriveIdentifierAlphabetFromObservedSeeds(
    deriveStringIdentitySeedsFromCandidate(candidate.functionName, candidate.params),
  );
}

export function synthesizeLengthBoundaries(): number[] {
  return deriveLengthBoundariesFromObservedCatalog();
}

export function synthesizeUnicodeProbeValues(candidate: { functionName: string }): string[] {
  let token = candidate.functionName || String.name;
  return [
    token.normalize('NFD'),
    String.fromCodePoint(STATUS_CODES[httpStatus('OK')]?.length ?? deriveUnitValue()),
    String.fromCodePoint(httpStatus('Payload Too Large')),
    `${token}${String.fromCharCode(deriveZeroValue())}`,
  ];
}

export function synthesizeSpecialCharacters(): string[] {
  return deriveSpecialCharactersFromRuntimeEvidence();
}

export function formatDecimalMoney(major: number, minor: number): string {
  return `${major}.${minor.toString().padStart(deriveUnitValue() + deriveUnitValue(), '0')}`;
}

export function formatBrlMoney(major: number, minor: number): string {
  return `R$ ${major.toLocaleString('pt-BR')},${minor.toString().padStart(deriveUnitValue() + deriveUnitValue(), '0')}`;
}

export function synthesizeMoneyProbeStrings(
  candidate: { functionName: string },
  rng: () => number,
  valid: boolean,
): string[] {
  return deriveMoneyProbeStringsFromObservedCatalog(candidate.functionName, rng, valid);
}

export function safeStringProbeLabel(value: unknown): string {
  try {
    return String(value);
  } catch {
    return Object.prototype.toString.call(value);
  }
}

export function synthesizeCentsArithmeticProbes(candidate: {
  functionName: string;
}): Array<{ a: number; b: number }> {
  let base = Math.max(deriveUnitValue(), candidate.functionName.length);
  return [
    { a: base, b: base * (deriveUnitValue() + deriveUnitValue()) },
    { a: deriveUnitValue(), b: deriveUnitValue() + deriveUnitValue() },
    { a: Number.MAX_SAFE_INTEGER, b: deriveUnitValue() },
  ];
}

export function synthesizeMoneyRoundTripValues(
  candidate: { functionName: string },
  rng: () => number,
): string[] {
  return synthesizeMoneyProbeStrings(candidate, rng, true).flatMap((value) => {
    let parsedMajor = Number([...value].filter((char) => Number.isInteger(Number(char))).join(''));
    let major = Number.isFinite(parsedMajor) ? parsedMajor : deriveUnitValue();
    return [value, formatBrlMoney(major, deriveZeroValue())];
  });
}

export function synthesizeInvalidEnumProbeValues(
  candidate: { functionName: string },
  discoveredMembers: string[],
): unknown[] {
  let observed = new Set(discoveredMembers);
  return synthesizePresenceProbeValues(false)
    .map(({ value }) => value)
    .concat(
      [...splitIdentifierTokensFromObservedName(candidate.functionName)]
        .map((token) => token.toLowerCase())
        .filter((token) => !observed.has(token)),
      hashStringToSeed(candidate.functionName),
    );
}

export function synthesizeAdversarialStringPayloads(): string[] {
  return deriveAdversarialPayloadsFromObservedEvidence();
}

export function mulberry32(seed: number) {
  return function next(): number {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashStringToSeed(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return h;
}

export function randomString(rng: () => number): string {
  const len = Math.floor(rng() * runtimeStringBoundaryFromRouteCatalog()) + deriveUnitValue();
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 _-';
  let result = '';
  for (let i = deriveZeroValue(); i < len; i++) {
    result += chars[Math.floor(rng() * chars.length)];
  }
  return result;
}

export function randomNumber(rng: () => number): number {
  const magnitude =
    Math.floor(rng() * synthesizeRuntimeTypeCategories().length) -
    deriveCatalogPercentScaleFromObservedCatalog();
  const base = rng() * mutationScaleFromCatalog();
  return parseFloat(
    (base * Math.pow(deriveCatalogPercentScaleFromObservedCatalog(), magnitude)).toFixed(
      deriveUnitValue(),
    ),
  );
}

export function randomObject(rng: () => number): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  const seedTypes = ['string', 'number', 'boolean'];
  const itemSpan = seedTypes.length + deriveUnitValue() + deriveUnitValue();
  const itemTotal = Math.floor(rng() * itemSpan) + deriveUnitValue();
  for (let i = deriveZeroValue(); i < itemTotal; i++) {
    obj[`prop_${i}`] = generateRandomValue(rng, ['string', 'number', 'boolean']);
  }
  return obj;
}

export function randomArray(rng: () => number): unknown[] {
  const seedTypes = ['string', 'number', 'boolean'];
  const itemSpan = seedTypes.concat(seedTypes).length + deriveUnitValue() + deriveUnitValue();
  const itemTotal = Math.floor(rng() * itemSpan) + deriveUnitValue();
  return Array(itemTotal)
    .fill(deriveZeroValue())
    .map(() => generateRandomValue(rng, ['string', 'number', 'boolean']));
}

export function generateRandomValue(rng: () => number, types: string[]): unknown {
  const type = types[Math.floor(rng() * types.length)];
  return generateValueOfType(type, rng);
}

export function generateValueOfType(type: string, rng: () => number): unknown {
  switch (type) {
    case 'string':
      return randomString(rng);
    case 'number':
      return randomNumber(rng);
    case 'boolean':
      return rng() < 0.5;
    case 'object':
      return randomObject(rng);
    case 'array':
      return randomArray(rng);
    case 'null':
      return null;
    case 'undefined':
      return undefined;
    default:
      return randomString(rng);
  }
}
