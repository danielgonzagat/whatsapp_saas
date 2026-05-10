import { STATUS_CODES } from 'node:http';
import type {
  GeneratedPropertyTestInput,
  PureFunctionCandidate,
} from '../../types.property-tester';
import {
  deriveCatalogPercentScaleFromObservedCatalog,
  deriveHttpStatusFromObservedCatalog as httpStatus,
  deriveUnitValue,
  deriveZeroValue,
} from '../../dynamic-reality-kernel/catalog-arithmetic';
import {
  detectBrlCurrencyFromObservedInput,
  discoverEnumMembersFromCandidateEvidence,
} from '../../dynamic-reality-kernel/token-evidence';
import { dpe, dfa } from './core';
import {
  fuzzSampleBudget,
  mutationScaleFromCatalog,
  inverseCatalogScale,
  runtimeStringBoundaryFromRouteCatalog,
  synthesizeMoneyProbeStrings,
  synthesizeCentsArithmeticProbes,
  synthesizeMoneyRoundTripValues,
  synthesizeInvalidEnumProbeValues,
  synthesizeLengthBoundaries,
  synthesizeAdversarialStringPayloads,
  synthesizeRuntimeTypeCategories,
  formatDecimalMoney,
  formatBrlMoney,
} from './property-input-helpers';

type GeneratedExpectation = GeneratedPropertyTestInput['expected'];

function isBrlCurrencyInput(value: string): boolean {
  return detectBrlCurrencyFromObservedInput(value);
}

export function generateMoneyPrecisionInputs(
  rng: () => number,
  candidate: PureFunctionCandidate,
): GeneratedPropertyTestInput[] {
  const inputs: GeneratedPropertyTestInput[] = [];
  const validValues = synthesizeMoneyProbeStrings(candidate, rng, true);
  for (const v of validValues) {
    const isBrl = isBrlCurrencyInput(v);
    inputs.push({
      value: v,
      description: `Valid ${isBrl ? 'BRL' : 'currency'} string: "${v}"`,
      expected: dpe(),
      expectedBehavior: isBrl
        ? 'Should parse valid BRL currency strings to integer cents'
        : 'Should parse valid currency strings to integer minor units',
    });
  }

  const invalidValues = synthesizeMoneyProbeStrings(candidate, rng, false);
  for (const v of invalidValues) {
    const isBrl = isBrlCurrencyInput(v);
    inputs.push({
      value: v,
      description: `Invalid ${isBrl ? 'BRL' : 'currency'} string: "${v}"`,
      expected: dfa(),
      expectedBehavior: isBrl
        ? 'Should reject unparseable BRL strings'
        : 'Should reject unparseable currency strings',
    });
  }

  for (const { a, b } of synthesizeCentsArithmeticProbes(candidate)) {
    const sum = a + b;
    inputs.push({
      value: { a, b },
      description: `Cents addition: ${a} + ${b} = ${sum}`,
      expected: Number.isSafeInteger(sum) ? dpe() : dfa(),
      expectedBehavior: Number.isSafeInteger(sum)
        ? 'Integer cents arithmetic should be exact'
        : 'Should guard against integer overflow in cents arithmetic',
    });
  }

  const roundTripValues = synthesizeMoneyRoundTripValues(candidate, rng);
  for (const v of roundTripValues) {
    const isBrl = isBrlCurrencyInput(v);
    inputs.push({
      value: v,
      description: `Round-trip property: format(parse("${v}")) ≈ "${v}"`,
      expected: dpe(),
      expectedBehavior: isBrl
        ? 'Round-trip format/parse should be idempotent for valid BRL'
        : 'Round-trip format/parse should be idempotent for valid currency strings',
    });
  }

  const randomSampleCount = fuzzSampleBudget('money_precision', candidate.functionName);
  for (let i = deriveZeroValue(); i < randomSampleCount; i++) {
    const major = Math.floor(rng() * mutationScaleFromCatalog());
    const minor = Math.floor(rng() * deriveCatalogPercentScaleFromObservedCatalog());
    const formatted =
      rng() < inverseCatalogScale()
        ? formatDecimalMoney(major, minor)
        : formatBrlMoney(major, minor);
    const isInvalid =
      rng() < inverseCatalogScale() / deriveCatalogPercentScaleFromObservedCatalog();
    inputs.push({
      value: isInvalid ? `invalid_${i}` : formatted,
      description: `Money precision test #${i + 1}`,
      expected: isInvalid ? dfa() : dpe(),
      expectedBehavior: isInvalid
        ? 'Should reject invalid money strings'
        : 'Should parse valid currency or BRL strings with correct minor-unit precision',
    });
  }

  return inputs;
}

export function generateEnumValueInputs(
  rng: () => number,
  candidate: PureFunctionCandidate,
): GeneratedPropertyTestInput[] {
  const inputs: GeneratedPropertyTestInput[] = [];
  const enumName = candidate.functionName;
  const discoveredMembers = inferEnumMembersFromCandidate(candidate);

  for (const member of discoveredMembers) {
    inputs.push({
      value: member,
      description: `Candidate member for ${enumName}: ${member}`,
      expected: dpe(),
      expectedBehavior: `Should accept a member discovered from ${enumName}`,
    });
  }

  const invalids = synthesizeInvalidEnumProbeValues(candidate, discoveredMembers);
  for (const inv of invalids) {
    inputs.push({
      value: inv,
      description: `Invalid ${enumName} value: ${JSON.stringify(inv)}`,
      expected: dfa(),
      expectedBehavior: `Should reject values outside the discovered ${enumName} set`,
    });
  }

  for (let i = deriveZeroValue(); i < fuzzSampleBudget('enum_value', enumName); i++) {
    const isInvalid = rng() < inverseCatalogScale();
    const value = isInvalid
      ? `${candidate.functionName}_${Math.floor(rng() * deriveCatalogPercentScaleFromObservedCatalog())}`
      : discoveredMembers[Math.floor(rng() * discoveredMembers.length)];
    inputs.push({
      value,
      description: `Enum test #${i + 1} for ${enumName}: "${value}"`,
      expected: isInvalid ? dfa() : dpe(),
      expectedBehavior: isInvalid
        ? 'Should reject values not in the enum set'
        : 'Should accept values within the enum set',
    });
  }

  return inputs;
}

export function inferEnumMembersFromCandidate(candidate: PureFunctionCandidate): string[] {
  return discoverEnumMembersFromCandidateEvidence(candidate.params, candidate.functionName);
}

export function generateLengthBoundaryInputs(rng: () => number): GeneratedPropertyTestInput[] {
  const inputs: GeneratedPropertyTestInput[] = [];
  const boundaries = synthesizeLengthBoundaries();

  for (const len of boundaries) {
    const val = 'x'.repeat(len);
    const isValid =
      len > deriveZeroValue() &&
      len <= Math.max(...boundaries.slice(deriveZeroValue(), -deriveUnitValue()));
    inputs.push({
      value: val,
      description: `String of length ${len}`,
      expected: isValid ? dpe() : dfa(),
      expectedBehavior: isValid
        ? 'Should accept strings within length boundaries'
        : `Should reject strings of length ${len} (outside valid boundary)`,
    });
  }

  inputs.push({
    value: '',
    description: 'Empty string (length 0)',
    expected: dfa(),
    expectedBehavior: 'Should reject empty strings for non-optional fields',
  });

  const randomLengthSamples =
    httpStatus('OK') +
    httpStatus('Bad Request') +
    (STATUS_CODES[httpStatus('Unauthorized')]?.length ?? deriveZeroValue());
  const maxBoundary = Math.max(...boundaries);
  for (let i = deriveZeroValue(); i < randomLengthSamples; i++) {
    const len = Math.floor(rng() * maxBoundary);
    const val = 'a'.repeat(len);
    const isInvalid = len === deriveZeroValue() || len > runtimeStringBoundaryFromRouteCatalog();
    inputs.push({
      value: val,
      description: `Random length string #${i + 1} (len=${len})`,
      expected: isInvalid ? dfa() : dpe(),
      expectedBehavior: isInvalid
        ? 'Should reject strings outside valid length range'
        : 'Should accept strings within valid length range',
    });
  }

  return inputs;
}

export function generateInjectionInputs(): GeneratedPropertyTestInput[] {
  const inputs: GeneratedPropertyTestInput[] = [];
  for (const pattern of synthesizeAdversarialStringPayloads()) {
    inputs.push({
      value: pattern,
      description: `Adversarial string payload: "${pattern}"`,
      expected: dfa(),
      expectedBehavior: 'Should reject or sanitize adversarial string input',
    });
  }

  return inputs;
}

export function generateGeneralPurityInputs(rng: () => number): GeneratedPropertyTestInput[] {
  const inputs: GeneratedPropertyTestInput[] = [];
  const sampleTotal = fuzzSampleBudget('general_purity', 'runtime_values');
  const branchTotal = synthesizeRuntimeTypeCategories().length;

  for (let i = deriveZeroValue(); i < sampleTotal; i++) {
    const kind = Math.floor(rng() * branchTotal);
    let value: unknown;
    let description: string;
    let expected: GeneratedExpectation;
    let behavior: string;

    switch (kind) {
      case deriveZeroValue(): {
        value = String.fromCharCode(
          ...Array(Math.floor(rng() * runtimeStringBoundaryFromRouteCatalog()) + deriveUnitValue())
            .fill(deriveZeroValue())
            .map(
              () =>
                Math.floor(rng() * httpStatus('OK')) +
                (STATUS_CODES[httpStatus('OK')]?.length ?? deriveUnitValue()),
            ),
        );
        description = `Random printable string #${i + 1}`;
        expected = dpe();
        behavior = 'Should handle printable ASCII strings without side effects';
        break;
      }
      case Number(Boolean(deriveUnitValue())): {
        value = Math.round(rng() * mutationScaleFromCatalog());
        description = `Random positive integer #${i + 1}`;
        expected = dpe();
        behavior = 'Should handle integers without loss of precision';
        break;
      }
      case deriveUnitValue() + deriveUnitValue(): {
        value = rng() < 0.5;
        description = `Random boolean #${i + 1}`;
        expected = dpe();
        behavior = 'Should handle boolean inputs correctly';
        break;
      }
      case deriveUnitValue() + deriveUnitValue() + deriveUnitValue(): {
        const objLen =
          Math.floor(rng() * (STATUS_CODES[httpStatus('Forbidden')]?.length ?? deriveUnitValue())) +
          deriveUnitValue();
        const obj: Record<string, unknown> = {};
        for (let j = deriveZeroValue(); j < objLen; j++) {
          obj[`key_${j}`] =
            rng() < inverseCatalogScale()
              ? `val_${j}`
              : Math.floor(rng() * deriveCatalogPercentScaleFromObservedCatalog());
        }
        value = obj;
        description = `Random object with ${objLen} keys #${i + 1}`;
        expected = dpe();
        behavior = 'Should handle structured objects without mutation of input';
        break;
      }
      case deriveUnitValue() + deriveUnitValue() + deriveUnitValue() + deriveUnitValue(): {
        const arrLen =
          Math.floor(rng() * (STATUS_CODES[httpStatus('Not Found')]?.length ?? deriveUnitValue())) +
          deriveUnitValue();
        value = Array(arrLen)
          .fill(deriveZeroValue())
          .map(() => Math.floor(rng() * deriveCatalogPercentScaleFromObservedCatalog()));
        description = `Random number array (len=${arrLen}) #${i + 1}`;
        expected = dpe();
        behavior = 'Should handle arrays without mutating the original';
        break;
      }
      default: {
        value = undefined;
        description = `Undefined input #${i + 1}`;
        expected = dfa();
        behavior = 'Should handle undefined without throwing unexpected errors';
      }
    }

    inputs.push({ value, description, expected, expectedBehavior: behavior });
  }

  return inputs;
}

function generateRandomValue(rng: () => number, types: string[]): unknown {
  const type = types[Math.floor(rng() * types.length)];
  return generateValueOfType(type, rng);
}

function generateValueOfType(type: string, rng: () => number): unknown {
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
