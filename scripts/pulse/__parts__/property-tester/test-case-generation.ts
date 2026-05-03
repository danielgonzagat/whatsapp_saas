import type {
  PropertyKind,
  FuzzStrategy,
  GeneratedPropertyFunction,
  GeneratedPropertyTestInput,
} from '../../types.property-tester';
import type { PureFunctionCandidate } from '../../types.property-tester';
import { discoverPureFunctionCandidates } from './pure-function-candidates';
import {
  fallbackGeneratedPath,
  hashStringToSeed,
  mulberry32,
  catalogPercentScale,
  unitValue,
  zeroValue,
  dpe,
  dfa,
} from './util';
import {
  generateIdempotencyInputs,
  generateNonNegativeInputs,
  generateRequiredFieldInputs,
  generateTypeConstraintInputs,
  generateStringIdPropertyInputs,
} from './property-inputs-a';
import {
  generateMoneyPrecisionInputs,
  generateEnumValueInputs,
  generateLengthBoundaryInputs,
  generateInjectionInputs,
  generateGeneralPurityInputs,
} from './property-inputs-b';

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
    let expectedPass = allInputs.filter((i) => i.expected === 'pass').length;
    let expectedFail = allInputs.filter((i) => i.expected === 'fail').length;

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

export function getPropertyKindsForCategory(
  category: PureFunctionCandidate['category'],
): PropertyKind[] {
  switch (category) {
    case 'validation':
      return ['required_field', 'type_constraint', 'string_id', 'length_boundary', 'injection'];
    case 'parsing':
      return ['type_constraint', 'required_field', 'string_id', 'injection'];
    case 'formatting':
      return ['idempotency', 'type_constraint', 'required_field'];
    case 'numeric':
      return ['non_negative', 'type_constraint', 'required_field'];
    case 'transform':
      return ['idempotency', 'type_constraint', 'required_field'];
    case 'money_handler':
      return ['non_negative', 'money_precision', 'type_constraint', 'required_field'];
    case 'string_manipulation':
      return ['idempotency', 'string_id', 'length_boundary', 'injection'];
    case 'enum_handler':
      return ['enum_value', 'type_constraint', 'required_field'];
    default:
      return ['general_purity', 'type_constraint', 'required_field'];
  }
}

function combinePropertyKinds(kinds: PropertyKind[]): PropertyKind {
  if (kinds.length === 1) return kinds[0];
  return 'general_purity';
}

function synthesizePropertyStrategy(
  candidate: PureFunctionCandidate,
  propertyKinds: PropertyKind[],
): FuzzStrategy {
  let hasExternalInputShape = propertyKinds.some(
    (property) =>
      property === 'injection' ||
      property === 'required_field' ||
      property === 'type_constraint' ||
      property === 'string_id',
  );
  let hasBoundaryShape = propertyKinds.some(
    (property) =>
      property === 'length_boundary' ||
      property === 'money_precision' ||
      property === 'non_negative',
  );
  let hasSchemaLikeContract = candidate.params.length > 0 || candidate.hasReturnType;
  let isPureTransform = propertyKinds.includes('idempotency') && !hasBoundaryShape;

  if (hasBoundaryShape) return 'boundary';
  if (hasExternalInputShape && !isPureTransform) return 'invalid_only';
  if (isPureTransform && hasSchemaLikeContract) return 'valid_only';
  if (hasSchemaLikeContract) return 'both';

  return 'random';
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
