export type PropertyTestStatus =
  | 'planned'
  | 'not_executed'
  | 'passed'
  | 'failed'
  | 'skipped'
  | 'error';
export type FuzzStrategy = 'valid_only' | 'invalid_only' | 'both' | 'boundary' | 'random';
export type PropertyBlueprintStatus = 'planned' | 'not_executed';

export interface PropertyTestCase {
  testId: string;
  capabilityId: string;
  functionName: string;
  filePath: string;
  strategy: FuzzStrategy;
  inputCount: number;
  failures: number;
  status: PropertyTestStatus;
  counterexamples: Array<{ input: unknown; expected: unknown; actual: unknown }>;
  durationMs: number;
}

export interface FuzzTestCase {
  testId: string;
  endpoint: string;
  method: string;
  strategy: FuzzStrategy;
  status: PropertyTestStatus;
  requestCount: number;
  statusCodes: Record<number, number>;
  failures: number;
  securityIssues: Array<{ type: string; description: string; payload: unknown }>;
  durationMs: number;
}

export interface MutationTestResult {
  filePath: string;
  status: PropertyBlueprintStatus;
  totalMutants: number;
  killedMutants: number;
  survivedMutants: number;
  timeoutMutants: number;
  mutationScore: number;
  survivingMutantLocations: Array<{ line: number; mutationType: string; description: string }>;
}

export type PropertyKind =
  | 'idempotency'
  | 'non_negative'
  | 'required_field'
  | 'type_constraint'
  | 'string_id'
  | 'money_precision'
  | 'enum_value'
  | 'length_boundary'
  | 'injection'
  | 'general_purity';

export interface GeneratedPropertyTestInput {
  value: unknown;
  description: string;
  expected: 'pass' | 'fail';
  expectedBehavior: string;
}

export interface GeneratedPropertyFunction {
  functionName: string;
  capabilityId: string;
  filePath: string;
  property: PropertyKind;
  strategy: FuzzStrategy;
  inputCount: number;
  expectedPassCount: number;
  expectedFailCount: number;
  generatedInputs: GeneratedPropertyTestInput[];
  status: PropertyBlueprintStatus;
}

export interface PureFunctionCandidate {
  functionName: string;
  filePath: string;
  category:
    | 'validation'
    | 'parsing'
    | 'formatting'
    | 'numeric'
    | 'transform'
    | 'string_manipulation'
    | 'enum_handler'
    | 'money_handler';
  params: string[];
  hasReturnType: boolean;
}

export interface PropertyTestEvidence {
  generatedAt: string;
  summary: {
    totalPropertyTests: number;
    plannedPropertyTests: number;
    notExecutedPropertyTests: number;
    passedPropertyTests: number;
    failedPropertyTests: number;
    totalFuzzTests: number;
    plannedFuzzTests: number;
    notExecutedFuzzTests: number;
    passedFuzzTests: number;
    failedFuzzTests: number;
    totalMutationTests: number;
    plannedMutationTests: number;
    notExecutedMutationTests: number;
    averageMutationScore: number;
    capabilitiesCovered: number;
    criticalCapabilitiesCovered: number;
    criticalCapabilitiesPlanned: number;
    totalGeneratedTests: number;
    plannedGeneratedTests: number;
  };
  propertyTests: PropertyTestCase[];
  fuzzTests: FuzzTestCase[];
  mutationTests: MutationTestResult[];
  generatedTests: GeneratedPropertyFunction[];
}
