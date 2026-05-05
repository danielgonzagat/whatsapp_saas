import type {
  BehaviorNodeKind,
  BehaviorInputKind,
  BehaviorOutputKind,
  BehaviorRiskLevel,
  BehaviorValidationRequirement,
} from '../../types.behavior-graph';
import type {
  BehaviorDecoratorRole,
  BehaviorClassNameRole,
  GovernedEvidenceMode,
} from './grammar-and-types';
import {
  discoverDirectorySkipHintsFromEvidence,
  discoverSourceExtensionsFromObservedTypescript,
  deriveZeroValue,
  deriveRuntimeStringBoundaryFromObservedCatalog,
  deriveUnitValue,
  deriveStringUnionMembersFromTypeContract,
} from '../../dynamic-reality-kernel';

let Project: typeof import('ts-morph').Project;
let SyntaxKind: typeof import('ts-morph').SyntaxKind;
let Node: typeof import('ts-morph').Node;

function toCamelCase(snake: string): string {
  return snake.replace(/_([a-z])/g, (_m: string, c: string) => c.toUpperCase());
}

function buildCatalogFromTypeContract(fileName: string, typeName: string): Record<string, string> {
  const members = deriveStringUnionMembersFromTypeContract(fileName, typeName);
  const catalog: Record<string, string> = {};
  for (const member of members) {
    catalog[toCamelCase(member)] = member;
  }
  return Object.freeze(catalog);
}

let _behaviorNodeKindCatalog: Record<string, BehaviorNodeKind> | null = null;
function requireBehaviorNodeKindCatalog(): Record<string, BehaviorNodeKind> {
  if (!_behaviorNodeKindCatalog) {
    _behaviorNodeKindCatalog = buildCatalogFromTypeContract(
      'scripts/pulse/types.behavior-graph.ts',
      'BehaviorNodeKind',
    ) as Record<string, BehaviorNodeKind>;
  }
  return _behaviorNodeKindCatalog;
}

let _behaviorRiskLevelCatalog: Record<string, BehaviorRiskLevel> | null = null;
function requireBehaviorRiskLevelCatalog(): Record<string, BehaviorRiskLevel> {
  if (!_behaviorRiskLevelCatalog) {
    _behaviorRiskLevelCatalog = buildCatalogFromTypeContract(
      'scripts/pulse/types.behavior-graph.ts',
      'BehaviorRiskLevel',
    ) as Record<string, BehaviorRiskLevel>;
  }
  return _behaviorRiskLevelCatalog;
}

let _behaviorInputKindCatalog: Record<string, BehaviorInputKind> | null = null;
function requireBehaviorInputKindCatalog(): Record<string, BehaviorInputKind> {
  if (!_behaviorInputKindCatalog) {
    _behaviorInputKindCatalog = buildCatalogFromTypeContract(
      'scripts/pulse/types.behavior-graph.ts',
      'BehaviorInputKind',
    ) as Record<string, BehaviorInputKind>;
  }
  return _behaviorInputKindCatalog;
}

let _behaviorOutputKindCatalog: Record<string, BehaviorOutputKind> | null = null;
function requireBehaviorOutputKindCatalog(): Record<string, BehaviorOutputKind> {
  if (!_behaviorOutputKindCatalog) {
    _behaviorOutputKindCatalog = buildCatalogFromTypeContract(
      'scripts/pulse/types.behavior-graph.ts',
      'BehaviorOutputKind',
    ) as Record<string, BehaviorOutputKind>;
  }
  return _behaviorOutputKindCatalog;
}

let _executionModeCatalog: Record<string, string> | null = null;
function requireExecutionModeCatalog(): Record<string, string> {
  if (!_executionModeCatalog) {
    const members = deriveStringUnionMembersFromTypeContract(
      'scripts/pulse/types.behavior-graph.ts',
      'executionMode',
    );
    const catalog: Record<string, string> = {};
    for (const member of members) {
      catalog[toCamelCase(member)] = member;
    }
    _executionModeCatalog = Object.freeze(catalog);
  }
  return _executionModeCatalog;
}

let _operationCatalog: Record<string, string> | null = null;
function requireOperationCatalog(): Record<string, string> {
  if (!_operationCatalog) {
    _operationCatalog = buildCatalogFromTypeContract(
      'scripts/pulse/types.behavior-graph.ts',
      'operation',
    );
  }
  return _operationCatalog;
}

function discoverStateWriteOperationLabels(): string[] {
  const ops = deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.behavior-graph.ts',
    'operation',
  );
  return [...ops].filter((op) => op !== requireOperationCatalog().read);
}

let _validationRequirementCatalog: Record<string, BehaviorValidationRequirement> | null = null;
function discoverValidationRequirementLabels(): Record<string, BehaviorValidationRequirement> {
  if (!_validationRequirementCatalog) {
    _validationRequirementCatalog = buildCatalogFromTypeContract(
      'scripts/pulse/types.behavior-graph.ts',
      'BehaviorValidationRequirement',
    ) as Record<string, BehaviorValidationRequirement>;
  }
  return _validationRequirementCatalog;
}

let _decoratorRoleCatalog: Record<string, BehaviorDecoratorRole> | null = null;
function requireDecoratorRoleCatalog(): Record<string, BehaviorDecoratorRole> {
  if (!_decoratorRoleCatalog) {
    _decoratorRoleCatalog = buildCatalogFromTypeContract(
      'scripts/pulse/behavior-graph.ts',
      'BehaviorDecoratorRole',
    ) as Record<string, BehaviorDecoratorRole>;
  }
  return _decoratorRoleCatalog;
}

let _classNameRoleCatalog: Record<string, BehaviorClassNameRole> | null = null;
function requireClassNameRoleCatalog(): Record<string, BehaviorClassNameRole> {
  if (!_classNameRoleCatalog) {
    _classNameRoleCatalog = buildCatalogFromTypeContract(
      'scripts/pulse/behavior-graph.ts',
      'BehaviorClassNameRole',
    ) as Record<string, BehaviorClassNameRole>;
  }
  return _classNameRoleCatalog;
}

function deriveRiskLevelOrdinalPositions(): Record<BehaviorRiskLevel, number> {
  const members = deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.behavior-graph.ts',
    'BehaviorRiskLevel',
  );
  const order: Record<BehaviorRiskLevel, number> = {} as Record<BehaviorRiskLevel, number>;
  let index = 0;
  for (const member of members) {
    order[member as BehaviorRiskLevel] = index++;
  }
  return order;
}

function requireJsReservedWordSet(): Set<string> {
  try {
    const tsMod = require('typescript');
    const sk = tsMod.SyntaxKind;
    const keywords = new Set<string>();
    for (const key of Object.keys(sk)) {
      if (typeof sk[key] === 'number' && key.endsWith('Keyword')) {
        keywords.add(key.replace(/Keyword$/, '').toLowerCase());
      }
    }
    return keywords;
  } catch {
    return new Set([
      'if',
      'for',
      'while',
      'switch',
      'catch',
      'return',
      'throw',
      'new',
      'typeof',
      'instanceof',
    ]);
  }
}

const IMPLICIT_UNTYPED_TEXT = (() => {
  try {
    return require('typescript').ClassificationTypeNames.any;
  } catch {
    return 'any';
  }
})();

function loadTsMorph(): boolean {
  try {
    const tsMorph = require('ts-morph');
    Project = tsMorph.Project;
    SyntaxKind = tsMorph.SyntaxKind;
    Node = tsMorph.Node;
    return true;
  } catch {
    return false;
  }
}

const SKIP_DIRS = (() => {
  const base = [...discoverDirectorySkipHintsFromEvidence()];
  const testSuffixes = [...discoverSourceExtensionsFromObservedTypescript()].flatMap((ext) => [
    `.spec${ext}`,
    `.test${ext}`,
  ]);
  return [...new Set([...base, '.next', '__tests__', ...testSuffixes])];
})();

let _nextNodeId = deriveZeroValue();
const FULL_BODY_EXTRACTION_BUDGET_BYTES = deriveZeroValue();
const LINE_DECLARATION_BUDGET_BYTES = deriveRuntimeStringBoundaryFromObservedCatalog();
const PARAM_LIST_BUDGET_BYTES = Math.round(
  deriveRuntimeStringBoundaryFromObservedCatalog() / (deriveUnitValue() + deriveUnitValue()),
);

function nextNodeId(): string {
  return `bn_${String(++_nextNodeId).padStart(6, String(deriveZeroValue()))}`;
}

let _governedEvidenceModeCatalog: Record<string, GovernedEvidenceMode> | null = null;
function requireGovernedEvidenceModeCatalog(): Record<string, GovernedEvidenceMode> {
  if (!_governedEvidenceModeCatalog) {
    _governedEvidenceModeCatalog = buildCatalogFromTypeContract(
      'scripts/pulse/behavior-graph.ts',
      'GovernedEvidenceMode',
    ) as Record<string, GovernedEvidenceMode>;
  }
  return _governedEvidenceModeCatalog;
}

export {
  Project,
  SyntaxKind,
  Node,
  toCamelCase,
  buildCatalogFromTypeContract,
  requireBehaviorNodeKindCatalog,
  requireBehaviorRiskLevelCatalog,
  requireBehaviorInputKindCatalog,
  requireBehaviorOutputKindCatalog,
  requireExecutionModeCatalog,
  requireOperationCatalog,
  discoverStateWriteOperationLabels,
  requireDecoratorRoleCatalog,
  requireClassNameRoleCatalog,
  discoverValidationRequirementLabels,
  deriveRiskLevelOrdinalPositions,
  requireJsReservedWordSet,
  IMPLICIT_UNTYPED_TEXT,
  loadTsMorph,
  SKIP_DIRS,
  FULL_BODY_EXTRACTION_BUDGET_BYTES,
  LINE_DECLARATION_BUDGET_BYTES,
  PARAM_LIST_BUDGET_BYTES,
  nextNodeId,
  requireGovernedEvidenceModeCatalog,
};
