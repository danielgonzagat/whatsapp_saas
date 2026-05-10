import type {
  FuzzStrategy,
  GeneratedPropertyFunction,
  GeneratedPropertyTestInput,
  PropertyKind,
  PureFunctionCandidate,
} from '../../types.property-tester';
import { deriveFuzzStrategyFromObservedPropertyShape } from '../../dynamic-reality-kernel/profile-derivations';
import {
  derivePropertyKindsFromObservedCategory,
  deriveUnitValue,
  deriveZeroValue,
} from '../../dynamic-reality-kernel/catalog-arithmetic';
import { fallbackGeneratedPath, dpe, dfa } from './core';
import { discoverPureFunctionCandidates } from './pure-function-discovery';
import {
  generateIdempotencyInputs,
  generateNonNegativeInputs,
  generateRequiredFieldInputs,
  generateTypeConstraintInputs,
  generateStringIdPropertyInputs,
} from './property-generators-p1';
import {
  generateMoneyPrecisionInputs,
  generateEnumValueInputs,
  generateLengthBoundaryInputs,
  generateInjectionInputs,
  generateGeneralPurityInputs,
} from './property-generators-p2';

function mulberry32(seed: number) {
  return function next(): number {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStringToSeed(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return h;
}

export function generatePropertyTestCases(rootDir: string): GeneratedPropertyFunction[] {
  let candidates = discoverPureFunctionCandidates(rootDir);
  let results: GeneratedPropertyFunction[] = [];

  for (let candidate of candidates) {
    let seed = hashStringToSeed(`${candidate.filePath}:${candidate.functionName}`);
    let rng = mulberry32(seed);
    let propertyKinds = getPropertyKindsForCategory(candidate.category);
    let allInputs: GeneratedPropertyTestInput[] = [];

    for (let prop of propertyKinds) {
      let inputsForProp = generateInputsForProperty(prop, rng, candidate);
      allInputs.push(...inputsForProp);
    }

    let totalInputs = allInputs.length;
    const passExpectation = dpe();
    const failExpectation = dfa();
    let expectedPass = allInputs.filter((i) => i.expected === passExpectation).length;
    let expectedFail = allInputs.filter((i) => i.expected === failExpectation).length;

    results.push({
      functionName: candidate.functionName,
      capabilityId: candidate.category,
      filePath: fallbackGeneratedPath(candidate.filePath),
      property: combinePropertyKinds(propertyKinds),
      strategy: synthesizePropertyStrategy(candidate, propertyKinds),
      inputCount: totalInputs,
      expectedPassCount: expectedPass,
      expectedFailCount: expectedFail,
      generatedInputs: allInputs,
      status: 'planned',
    });
  }

  return results;
}

function getPropertyKindsForCategory(category: PureFunctionCandidate['category']): PropertyKind[] {
  return derivePropertyKindsFromObservedCategory(category);
}

function combinePropertyKinds(kinds: PropertyKind[]): PropertyKind {
  if (kinds.length === deriveUnitValue()) return kinds[deriveZeroValue()];
  const defaultKinds = derivePropertyKindsFromObservedCategory(null);
  return defaultKinds[deriveZeroValue()];
}

function synthesizePropertyStrategy(
  candidate: PureFunctionCandidate,
  propertyKinds: PropertyKind[],
): FuzzStrategy {
  return deriveFuzzStrategyFromObservedPropertyShape(
    propertyKinds,
    candidate.params.length > 0,
    candidate.hasReturnType,
  );
}

function generateInputsForProperty(
  property: PropertyKind,
  rng: () => number,
  candidate: PureFunctionCandidate,
): GeneratedPropertyTestInput[] {
  switch (property) {
    case 'idempotency':
      return generateIdempotencyInputs(rng);
    case 'non_negative':
      return generateNonNegativeInputs(rng);
    case 'required_field':
      return generateRequiredFieldInputs();
    case 'type_constraint':
      return generateTypeConstraintInputs(rng);
    case 'string_id':
      return generateStringIdPropertyInputs(rng, candidate);
    case 'money_precision':
      return generateMoneyPrecisionInputs(rng, candidate);
    case 'enum_value':
      return generateEnumValueInputs(rng, candidate);
    case 'length_boundary':
      return generateLengthBoundaryInputs(rng);
    case 'injection':
      return generateInjectionInputs();
    case 'general_purity':
      return generateGeneralPurityInputs(rng);
    default:
      return [];
  }
}
