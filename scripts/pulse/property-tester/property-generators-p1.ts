import { STATUS_CODES } from 'node:http';
import type {
  GeneratedPropertyTestInput,
  PureFunctionCandidate,
} from '../types.property-tester';
import {
  deriveCatalogPercentScaleFromObservedCatalog,
  deriveHttpStatusFromObservedCatalog as httpStatus,
  deriveUnitValue,
  deriveZeroValue,
} from '../dynamic-reality-kernel/catalog-arithmetic';
import { dpe, dfa } from './core';
import {
  fuzzSampleBudget,
  mutationScaleFromCatalog,
  inverseCatalogScale,
  runtimeStringBoundary,
  runtimeStringBoundaryFromRouteCatalog,
  synthesizeNumericProbeValues,
  synthesizePresenceProbeValues,
  synthesizeRuntimeTypeCategories,
  synthesizeStringIdentitySeeds,
  synthesizeLengthBoundaries,
  synthesizeSpecialCharacters,
  synthesizeUnicodeProbeValues,
  synthesizeIdentifierAlphabet,
} from './property-input-helpers';

export function generateIdempotencyInputs(rng: () => number): GeneratedPropertyTestInput[] {
  let inputs: GeneratedPropertyTestInput[] = [];
  let sampleTotal =
    deriveCatalogPercentScaleFromObservedCatalog() +
    (STATUS_CODES[httpStatus('Unauthorized')]?.length ?? deriveZeroValue());

  for (let i = deriveZeroValue(); i < sampleTotal; i++) {
    let val = generateRandomValue(rng, ['string', 'number', 'boolean']);
    inputs.push({
      value: val,
      description: `Idempotency check #${i + 1}: f(f(x)) should equal f(x)`,
      expected: dpe(),
      expectedBehavior:
        'Applying the function twice should produce the same result as applying it once',
    });
  }

  return inputs;
}

export function generateNonNegativeInputs(rng: () => number): GeneratedPropertyTestInput[] {
  let inputs: GeneratedPropertyTestInput[] = [];
  let validValues = synthesizeNumericProbeValues(rng).filter((value) => value >= deriveZeroValue());
  for (let v of validValues) {
    inputs.push({
      value: v,
      description: `Non-negative input: ${v}`,
      expected: dpe(),
      expectedBehavior: 'Result should be non-negative (>= 0)',
    });
  }

  let invalidValues = validValues
    .filter((value) => value > deriveZeroValue())
    .slice(deriveZeroValue(), STATUS_CODES[httpStatus('Forbidden')]?.length ?? deriveUnitValue())
    .map((value) => -value);
  for (let v of invalidValues) {
    inputs.push({
      value: v,
      description: `Negative input: ${v}`,
      expected: dfa(),
      expectedBehavior: 'Should reject or clamp negative monetary values',
    });
  }

  for (let value of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    inputs.push({
      value,
      description: `Non-finite input: ${String(value)}`,
      expected: dfa(),
      expectedBehavior: 'Should reject non-finite monetary input',
    });
  }

  let randomSampleCount = fuzzSampleBudget('non_negative', 'runtime_numeric');
  for (let i = deriveZeroValue(); i < randomSampleCount; i++) {
    let abs = Math.abs(rng() * mutationScaleFromCatalog());
    let val =
      rng() > inverseCatalogScale()
        ? abs
        : parseFloat(abs.toFixed(deriveUnitValue() + deriveUnitValue()));
    inputs.push({
      value: val,
      description: `Random non-negative #${i + 1}`,
      expected: dpe(),
      expectedBehavior: 'Result should be >= 0',
    });
  }

  return inputs;
}

export function generateRequiredFieldInputs(): GeneratedPropertyTestInput[] {
  let inputs: GeneratedPropertyTestInput[] = [];
  let missingValues = synthesizePresenceProbeValues(false);

  for (let { value, label } of missingValues) {
    inputs.push({
      value,
      description: `Required field with ${label}`,
      expected: dfa(),
      expectedBehavior: 'Should reject missing/empty required fields',
    });
  }

  for (let { value: v } of synthesizePresenceProbeValues(true)) {
    inputs.push({
      value: v,
      description: `Required field with valid value: ${JSON.stringify(v)}`,
      expected: dpe(),
      expectedBehavior: 'Should accept valid required field values',
    });
  }

  return inputs;
}

export function generateTypeConstraintInputs(rng: () => number): GeneratedPropertyTestInput[] {
  let inputs: GeneratedPropertyTestInput[] = [];
  let typeCategories = synthesizeRuntimeTypeCategories();

  for (let i = deriveZeroValue(); i < fuzzSampleBudget('type_constraint', 'runtime_typeof'); i++) {
    let type = typeCategories[Math.floor(rng() * typeCategories.length)];
    let val = generateValueOfType(type, rng);
    inputs.push({
      value: val,
      description: `Type constraint input #${i + 1} (${type})`,
      expected: type === 'null' || type === 'undefined' ? dfa() : dpe(),
      expectedBehavior: `Type ${type} should be handled according to function's type contract`,
    });
  }

  return inputs;
}

export function generateStringIdPropertyInputs(
  rng: () => number,
  candidate: PureFunctionCandidate,
): GeneratedPropertyTestInput[] {
  let inputs: GeneratedPropertyTestInput[] = [];
  let validIds = synthesizeStringIdentitySeeds(candidate);
  for (let id of validIds) {
    inputs.push({
      value: id,
      description: `Valid string ID: "${id}"`,
      expected: dpe(),
      expectedBehavior: 'Should accept valid string IDs',
    });
  }

  for (let { value, label } of synthesizePresenceProbeValues(false)) {
    inputs.push({
      value,
      description: `String ID absent value: ${label}`,
      expected: dfa(),
      expectedBehavior: 'Should reject absent string IDs',
    });
  }

  for (let len of synthesizeLengthBoundaries()) {
    let value = candidate.functionName.slice(deriveZeroValue(), deriveUnitValue()).repeat(len);
    let isValid = len > deriveZeroValue() && len <= runtimeStringBoundary(candidate);
    inputs.push({
      value,
      description: `String ID length boundary ${len}`,
      expected: isValid ? dpe() : dfa(),
      expectedBehavior: isValid
        ? 'Should accept IDs inside discovered length boundaries'
        : 'Should reject IDs outside discovered length boundaries',
    });
  }

  for (let ch of synthesizeSpecialCharacters()) {
    inputs.push({
      value: `id${ch}test`,
      description: `String ID with special char: ${JSON.stringify(ch)}`,
      expected: dfa(),
      expectedBehavior: 'Should reject IDs containing control/special characters',
    });
  }

  let unicodeIds = synthesizeUnicodeProbeValues(candidate);
  for (let id of unicodeIds) {
    inputs.push({
      value: id,
      description: `Unicode string ID: ${id}`,
      expected: dfa(),
      expectedBehavior: 'Should reject or sanitize IDs with non-ASCII characters',
    });
  }

  for (let i = deriveZeroValue(); i < fuzzSampleBudget('string_id', candidate.functionName); i++) {
    let len = Math.floor(rng() * runtimeStringBoundary(candidate)) + deriveUnitValue();
    let chars = synthesizeIdentifierAlphabet(candidate);
    let id = '';
    for (let j = deriveZeroValue(); j < len; j++) {
      id += chars[Math.floor(rng() * chars.length)];
    }
    let isInvalid = len > runtimeStringBoundary(candidate) || len === deriveZeroValue();
    inputs.push({
      value: id,
      description: `Generated string ID #${i + 1} (len=${len})`,
      expected: isInvalid ? dfa() : dpe(),
      expectedBehavior: isInvalid
        ? 'IDs outside valid length boundaries should be rejected'
        : 'Should accept valid generated IDs',
    });
  }

  return inputs;
}

function generateRandomValue(rng: () => number, types: string[]): unknown {
  let type = types[Math.floor(rng() * types.length)];
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

function randomString(rng: () => number): string {
  let len = Math.floor(rng() * runtimeStringBoundaryFromRouteCatalog()) + deriveUnitValue();
  let chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 _-';
  let result = '';
  for (let i = deriveZeroValue(); i < len; i++) {
    result += chars[Math.floor(rng() * chars.length)];
  }
  return result;
}

function randomNumber(rng: () => number): number {
  let magnitude =
    Math.floor(rng() * synthesizeRuntimeTypeCategories().length) -
    deriveCatalogPercentScaleFromObservedCatalog();
  let base = rng() * mutationScaleFromCatalog();
  return parseFloat(
    (base * Math.pow(deriveCatalogPercentScaleFromObservedCatalog(), magnitude)).toFixed(
      deriveUnitValue(),
    ),
  );
}

function randomObject(rng: () => number): Record<string, unknown> {
  let obj: Record<string, unknown> = {};
  let seedTypes = ['string', 'number', 'boolean'];
  let itemSpan = seedTypes.length + deriveUnitValue() + deriveUnitValue();
  let itemTotal = Math.floor(rng() * itemSpan) + deriveUnitValue();
  for (let i = deriveZeroValue(); i < itemTotal; i++) {
    obj[`prop_${i}`] = generateRandomValue(rng, ['string', 'number', 'boolean']);
  }
  return obj;
}

function randomArray(rng: () => number): unknown[] {
  let seedTypes = ['string', 'number', 'boolean'];
  let itemSpan = seedTypes.concat(seedTypes).length + deriveUnitValue() + deriveUnitValue();
  let itemTotal = Math.floor(rng() * itemSpan) + deriveUnitValue();
  return Array(itemTotal)
    .fill(deriveZeroValue())
    .map(() => generateRandomValue(rng, ['string', 'number', 'boolean']));
}
