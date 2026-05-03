import type { BehaviorNode } from '../../types.behavior-graph';

type ParsedFunc = {
  name: string;
  line: number;
  isAsync: boolean;
  decorators: string[];
  docComment: string | null;
  isExported: boolean;
  className: string | null;
  classDecorators: string[];
  parameters: Array<{ name: string; typeText: string }>;
  bodyText: string;
};

type SourceExternalContext = {
  packageProviders: string[];
  importedBindings: Set<string>;
  importedBindingProviders: Map<string, string>;
  frameworkDecoratorBindings: Set<string>;
};

type SourceFileTarget = {
  filePath: string;
  sourceRoot: import('../source-root-detector').DetectedSourceRoot;
};

type BehaviorValidationRequirement =
  | 'targeted_test'
  | 'typecheck'
  | 'package_build'
  | 'runtime_smoke'
  | 'idempotency_check'
  | 'external_integration_evidence'
  | 'observability_evidence'
  | 'governed_read_only_evidence';

type BehaviorNodeArtifact = BehaviorNode & {
  validationRequirements: BehaviorValidationRequirement[];
  governedEvidenceMode: 'read_only_evidence' | 'sandboxed_execution_with_validation';
};

export type {
  ParsedFunc,
  SourceExternalContext,
  SourceFileTarget,
  BehaviorValidationRequirement,
  BehaviorNodeArtifact,
};
