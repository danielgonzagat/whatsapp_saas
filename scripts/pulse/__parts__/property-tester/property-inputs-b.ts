import { STATUS_CODES } from 'node:http';
import type {
  GeneratedPropertyTestInput,
  PureFunctionCandidate,
} from '../../types.property-tester';
import {
  catalogPercentScale,
  unitValue,
  zeroValue,
  dpe,
  dfa,
  splitIdentifierTokens,
  hashStringToSeed,
} from './util';
import { deriveHttpStatusFromObservedCatalog as httpStatus } from '../../dynamic-reality-kernel';
import {
  mutationScaleFromCatalog,
  inverseCatalogScale,
  fuzzSampleBudget,
  synthesizeMoneyProbeStrings,
  synthesizeCentsArithmeticProbes,
  synthesizeMoneyRoundTripValues,
  synthesizeInvalidEnumProbeValues,
  synthesizeAdversarialStringPayloads,
  synthesizeLengthBoundaries,
  synthesizePresenceProbeValues,
  formatDecimalMoney,
  formatBrlMoney,
  runtimeStringBoundaryFromRouteCatalog,
  synthesizeRuntimeTypeCategories,
} from './input-math';

export function generateMoneyPrecisionInputs(
  rng: () => number,
  candidate: PureFunctionCandidate,
): GeneratedPropertyTestInput[] {
  let inputs: GeneratedPropertyTestInput[] = [];
  let validValues = synthesizeMoneyProbeStrings(candidate, rng, true);
  for (let v of validValues) {
    let isBrl = isBrlCurrencyInput(v);
    inputs.push({
      value: v,
      description: `Valid ${isBrl ? 'BRL' : 'currency'} string: "${v}"`,
      expected: dpe(),
      expectedBehavior: isBrl
        ? 'Should parse valid BRL currency strings to integer cents'
        : 'Should parse valid currency strings to integer minor units',
    });
  }

  let invalidValues = synthesizeMoneyProbeStrings(candidate, rng, false);
  for (let v of invalidValues) {
    let isBrl = isBrlCurrencyInput(v);
    inputs.push({
      value: v,
      description: `Invalid ${isBrl ? 'BRL' : 'currency'} string: "${v}"`,
      expected: dfa(),
      expectedBehavior: isBrl
        ? 'Should reject unparseable BRL strings'
        : 'Should reject unparseable currency strings',
    });
  }

  for (let { a, b } of synthesizeCentsArithmeticProbes(candidate)) {
    let sum = a + b;
    inputs.push({
      value: { a, b },
      description: `Cents addition: ${a} + ${b} = ${sum}`,
      expected: Number.isSafeInteger(sum) ? dpe() : dfa(),
      expectedBehavior: Number.isSafeInteger(sum)
        ? 'Integer cents arithmetic should be exact'
        : 'Should guard against integer overflow in cents arithmetic',
    });
  }

  let roundTripValues = synthesizeMoneyRoundTripValues(candidate, rng);
  for (let v of roundTripValues) {
    let isBrl = isBrlCurrencyInput(v);
    inputs.push({
      value: v,
      description: `Round-trip property: format(parse("${v}")) ≈ "${v}"`,
      expected: dpe(),
      expectedBehavior: isBrl
        ? 'Round-trip format/parse should be idempotent for valid BRL'
        : 'Round-trip format/parse should be idempotent for valid currency strings',
    });
  }

  let randomSampleCount = fuzzSampleBudget('money_precision', candidate.functionName);
  for (let i = zeroValue(); i < randomSampleCount; i++) {
    let major = Math.floor(rng() * mutationScaleFromCatalog());
    let minor = Math.floor(rng() * catalogPercentScale());
    let formatted =
      rng() < inverseCatalogScale()
        ? formatDecimalMoney(major, minor)
        : formatBrlMoney(major, minor);
    let isInvalid = rng() < inverseCatalogScale() / catalogPercentScale();
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
  let inputs: GeneratedPropertyTestInput[] = [];
  let enumName = candidate.functionName;
  let discoveredMembers = inferEnumMembersFromCandidate(candidate);

  for (let member of discoveredMembers) {
    inputs.push({
      value: member,
      description: `Candidate member for ${enumName}: ${member}`,
      expected: dpe(),
      expectedBehavior: `Should accept a member discovered from ${enumName}`,
    });
  }

  let invalids = synthesizeInvalidEnumProbeValues(candidate, discoveredMembers);
  for (let inv of invalids) {
    inputs.push({
      value: inv,
      description: `Invalid ${enumName} value: ${JSON.stringify(inv)}`,
      expected: dfa(),
      expectedBehavior: `Should reject values outside the discovered ${enumName} set`,
    });
  }

  for (let i = zeroValue(); i < fuzzSampleBudget('enum_value', enumName); i++) {
    let isInvalid = rng() < inverseCatalogScale();
    let value = isInvalid
      ? `${candidate.functionName}_${Math.floor(rng() * catalogPercentScale())}`
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

export function generateLengthBoundaryInputs(rng: () => number): GeneratedPropertyTestInput[] {
  let inputs: GeneratedPropertyTestInput[] = [];
  let boundaries = synthesizeLengthBoundaries();

  for (let len of boundaries) {
    let val = 'x'.repeat(len);
    let isValid =
      len > zeroValue() && len <= Math.max(...boundaries.slice(zeroValue(), -unitValue()));
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

  let randomLengthSamples =
    httpStatus('OK') +
    httpStatus('Bad Request') +
    (STATUS_CODES[httpStatus('Unauthorized')]?.length ?? zeroValue());
  let maxBoundary = Math.max(...boundaries);
  for (let i = zeroValue(); i < randomLengthSamples; i++) {
    let len = Math.floor(rng() * maxBoundary);
    let val = 'a'.repeat(len);
    let isInvalid = len === zeroValue() || len > runtimeStringBoundaryFromRouteCatalog();
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
  let inputs: GeneratedPropertyTestInput[] = [];
  for (let pattern of synthesizeAdversarialStringPayloads()) {
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
  let inputs: GeneratedPropertyTestInput[] = [];
  let sampleTotal = fuzzSampleBudget('general_purity', 'runtime_values');
  let branchTotal = synthesizeRuntimeTypeCategories().length;

  for (let i = zeroValue(); i < sampleTotal; i++) {
    let kind = Math.floor(rng() * branchTotal);
    let value: unknown;
    let description: string;
    let expected: 'pass' | 'fail';
    let behavior: string;

    switch (kind) {
      case zeroValue(): {
        value = String.fromCharCode(
          ...Array(Math.floor(rng() * runtimeStringBoundaryFromRouteCatalog()) + unitValue())
            .fill(zeroValue())
            .map(
              () =>
                Math.floor(rng() * httpStatus('OK')) +
                (STATUS_CODES[httpStatus('OK')]?.length ?? unitValue()),
            ),
        );
        description = `Random printable string #${i + 1}`;
        expected = dpe();
        behavior = 'Should handle printable ASCII strings without side effects';
        break;
      }
      case Number(Boolean(unitValue())): {
        value = Math.round(rng() * mutationScaleFromCatalog());
        description = `Random positive integer #${i + 1}`;
        expected = dpe();
        behavior = 'Should handle integers without loss of precision';
        break;
      }
      case unitValue() + unitValue(): {
        value = rng() < 0.5;
        description = `Random boolean #${i + 1}`;
        expected = dpe();
        behavior = 'Should handle boolean inputs correctly';
        break;
      }
      case unitValue() + unitValue() + unitValue(): {
        let objLen =
          Math.floor(rng() * (STATUS_CODES[httpStatus('Forbidden')]?.length ?? unitValue())) +
          unitValue();
        let obj: Record<string, unknown> = {};
        for (let j = zeroValue(); j < objLen; j++) {
          obj[`key_${j}`] =
            rng() < inverseCatalogScale() ? `val_${j}` : Math.floor(rng() * catalogPercentScale());
        }
        value = obj;
        description = `Random object with ${objLen} keys #${i + 1}`;
        expected = dpe();
        behavior = 'Should handle structured objects without mutation of input';
        break;
      }
      case unitValue() + unitValue() + unitValue() + unitValue(): {
        let arrLen =
          Math.floor(rng() * (STATUS_CODES[httpStatus('Not Found')]?.length ?? unitValue())) +
          unitValue();
        value = Array(arrLen)
          .fill(zeroValue())
          .map(() => Math.floor(rng() * catalogPercentScale()));
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

function inferEnumMembersFromCandidate(candidate: PureFunctionCandidate): string[] {
  if (candidate.params.length > 0) {
    return [...new Set(candidate.params)];
  }

  let words = [...splitIdentifierTokens(candidate.functionName)]
    .map((word) => word.toUpperCase())
    .filter((word) => word.length > 2);

  return words.length > 0 ? [...new Set(words)] : [candidate.functionName.toUpperCase()];
}

function isBrlCurrencyInput(value: string): boolean {
  return value.includes('R$') || value.includes(',');
}
