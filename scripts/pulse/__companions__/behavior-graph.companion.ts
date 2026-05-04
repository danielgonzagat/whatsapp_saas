import * as path from 'path';
import { readTextFile, readDir, ensureDir, writeTextFile, pathExists } from '../safe-fs';
import { safeJoin } from '../safe-path';
import { detectSourceRoots } from '../source-root-detector';
import type { DetectedSourceRoot } from '../source-root-detector';
import type {
  BehaviorGraph,
  BehaviorNode,
  BehaviorNodeKind,
  BehaviorInput,
  BehaviorInputKind,
  BehaviorOutput,
  BehaviorOutputKind,
  BehaviorStateAccess,
  BehaviorExternalCall,
  BehaviorRiskLevel,
  BehaviorGraphSummary,
  BehaviorValidationRequirement,
} from '../types.behavior-graph';
import {
  discoverAllObservedArtifactFilenames,
  discoverDirectorySkipHintsFromEvidence,
  discoverSourceExtensionsFromObservedTypescript,
  deriveUnitValue,
  deriveZeroValue,
  deriveRuntimeStringBoundaryFromObservedCatalog,
  deriveStringUnionMembersFromTypeContract,
  deriveCatalogPercentScaleFromObservedCatalog,
  deriveHttpStatusFromObservedCatalog,
} from '../dynamic-reality-kernel';

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

let _validationRequirementCatalog: Record<string, BehaviorValidationRequirement> | null = null;
function requireValidationRequirementCatalog(): Record<string, BehaviorValidationRequirement> {
  if (!_validationRequirementCatalog) {
    _validationRequirementCatalog = buildCatalogFromTypeContract(
      'scripts/pulse/types.behavior-graph.ts',
      'BehaviorValidationRequirement',
    ) as Record<string, BehaviorValidationRequirement>;
  }
  return _validationRequirementCatalog;
}

function discoverStateWriteOperationLabels(): Set<string> {
  const ops = deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.behavior-graph.ts',
    'operation',
  );
  const writeOps = new Set(ops);
  writeOps.delete('read');
  return writeOps;
}

const FALLBACK_JS_RESERVED = new Set([
  'if', 'for', 'while', 'switch', 'catch',
  'return', 'throw', 'new', 'typeof', 'instanceof',
]);

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
    return FALLBACK_JS_RESERVED;
  }
}

const IMPLICIT_UNTYPED_TEXT = (() => {
  try {
    return require('typescript').ClassificationTypeNames.any;
  } catch {
    return 'any';
  }
})();

const SKIP_DIRS = (() => {
  const base = [...discoverDirectorySkipHintsFromEvidence()];
  const testSuffixes = [...discoverSourceExtensionsFromObservedTypescript()].flatMap((ext) => [
    `.spec${ext}`,
    `.test${ext}`,
  ]);
  return [...new Set([...base, '.next', '__tests__', ...testSuffixes])];
})();

const FULL_BODY_EXTRACTION_BUDGET_BYTES = deriveZeroValue();
const LINE_DECLARATION_BUDGET_BYTES = deriveRuntimeStringBoundaryFromObservedCatalog();
const PARAM_LIST_BUDGET_BYTES = Math.round(
  deriveRuntimeStringBoundaryFromObservedCatalog() / (deriveUnitValue() + deriveUnitValue()),
);
const IDENTIFIER_GRAMMAR = String.raw`[A-Za-z_$][\\w$]*`;

let _nextNodeId = deriveZeroValue();
function nextNodeId(): string {
  return `bn_${String(++_nextNodeId).padStart(6, '0')}`;
}

// ══════════════════════════════════════════════════════════════════════════════
// Function extraction
// ══════════════════════════════════════════════════════════════════════════════

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
  sourceRoot: DetectedSourceRoot;
};

function extractFunctionsFromSource(filePath: string, source: string): ParsedFunc[] {
  if (source.length > FULL_BODY_EXTRACTION_BUDGET_BYTES) {
    return extractLargeFileFunctionStubs(source);
  }

  const functions: ParsedFunc[] = [];
  const lines = source.split('\n');
  let currentClass: string | null = null;

  const classRegex = /(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/g;
  let classMatch: RegExpExecArray | null;
  while ((classMatch = classRegex.exec(source)) !== null) {
    currentClass = classMatch[1];
  }

  const funcRegex =
    /(?:(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)|(?:(?:@(\w+(?:\s*\([^)]*\))?)\s*)+)?(?:export\s+)?(?:async\s+)?(?:public\s+|private\s+|protected\s+)?(?:static\s+)?(?:async\s+)?(\w+)\s*\(([^)]*)\)\s*(?::\s*(\w+(?:<[^>]+>)?))?\s*\{)/g;

  let match: RegExpExecArray | null;
  while ((match = funcRegex.exec(source)) !== null) {
    const standaloneName = match[1];
    const standaloneParams = match[2];
    const decoratorPart = match[0];
    const methodName = match[4];
    const methodParams = match[5];
    const returnType = match[6];

    const name = standaloneName || methodName;
    let params = standaloneParams || methodParams || '';

    if (
      !name ||
      requireJsReservedWordSet().has(name)
    ) {
      continue;
    }

    const line = source.substring(0, match.index).split('\n').length;
    const isAsync = /\basync\b/.test(decoratorPart);

    const decorators: string[] = [];
    const decoRegex = /@(\w+)(?:\s*\(([^)]*)\))?/g;
    let decoMatch: RegExpExecArray | null;
    while ((decoMatch = decoRegex.exec(decoratorPart)) !== null) {
      decorators.push(decoMatch[1]);
    }

    let docComment: string | null = null;
    const beforeMatch = source.substring(0, match.index).split('\n');
    const jsdocLookbackSpan =
      deriveUnitValue() +
      deriveUnitValue() +
      deriveUnitValue() +
      deriveUnitValue() +
      deriveUnitValue();
    const prevLines = beforeMatch.slice(-jsdocLookbackSpan);
    const jsdocRegex = /\/\*\*[\s\S]*?\*\//;
    for (let i = prevLines.length - 1; i >= 0; i--) {
      if (jsdocRegex.test(prevLines[i])) {
        const jsdocStart = source.lastIndexOf('/**', match.index);
        const jsdocEnd = source.indexOf('*/', jsdocStart);
        if (jsdocStart >= 0 && jsdocEnd >= 0) {
          docComment = source.substring(jsdocStart, jsdocEnd + 2).trim();
        }
        break;
      }
    }

    const paramList: Array<{ name: string; typeText: string }> = [];
    if (params.trim()) {
      const paramParts = params.split(',').map((p) => p.trim());
      for (const part of paramParts) {
        const colonIdx = part.indexOf(':');
        if (colonIdx >= 0) {
          paramList.push({
            name: part.substring(0, colonIdx).trim(),
            typeText: part
              .substring(colonIdx + 1)
              .trim()
              .replace(/=.*$/, '')
              .trim(),
          });
        } else {
          paramList.push({
            name: part.replace(/=.*$/, '').trim(),
            typeText: IMPLICIT_UNTYPED_TEXT,
          });
        }
      }
    }

    const bodyStart = match.index + match[0].length - 1;
    let braceCount = 0;
    let bodyEnd = bodyStart;
    for (let i = bodyStart; i < source.length; i++) {
      if (source[i] === '{') braceCount++;
      if (source[i] === '}') {
        braceCount--;
        if (braceCount === 0) {
          bodyEnd = i;
          break;
        }
      }
    }
    const bodyText = source.substring(bodyStart, bodyEnd + 1);

    functions.push({
      name,
      line,
      isAsync,
      decorators,
      docComment,
      isExported: /\bexport\b/.test(decoratorPart),
      className: currentClass,
      classDecorators: [],
      parameters: paramList,
      bodyText,
    });
  }

  // Arrow functions assigned to variables
  const arrowRegex =
    /(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\(([^)]*)\)\s*(?::\s*(\w+(?:<[^>]+>)?))?\s*=>\s*\{/g;
  let arrowMatch: RegExpExecArray | null;
  while ((arrowMatch = arrowRegex.exec(source)) !== null) {
    const name = arrowMatch[1];
    const params = arrowMatch[2];
    const returnType = arrowMatch[3];

    if (!name) continue;

    const line = source.substring(0, arrowMatch.index).split('\n').length;
    const isAsync = /\basync\b/.test(arrowMatch[0]);

    const paramList: Array<{ name: string; typeText: string }> = [];
    if (params.trim()) {
      const paramParts = params.split(',').map((p) => p.trim());
      for (const part of paramParts) {
        const colonIdx = part.indexOf(':');
        if (colonIdx >= 0) {
          paramList.push({
            name: part.substring(0, colonIdx).trim(),
            typeText: part
              .substring(colonIdx + 1)
              .trim()
              .replace(/=.*$/, '')
              .trim(),
          });
        } else {
          paramList.push({
            name: part.replace(/=.*$/, '').trim(),
            typeText: IMPLICIT_UNTYPED_TEXT,
          });
        }
      }
    }

    const bodyStart = arrowMatch.index + arrowMatch[0].length - 1;
    let braceCount = 0;
    let bodyEnd = bodyStart;
    for (let i = bodyStart; i < source.length; i++) {
      if (source[i] === '{') braceCount++;
      if (source[i] === '}') {
        braceCount--;
        if (braceCount === 0) {
          bodyEnd = i;
          break;
        }
      }
    }
    const bodyText = source.substring(bodyStart, bodyEnd + 1);

    functions.push({
      name,
      line,
      isAsync,
      decorators: [],
      docComment: null,
      isExported: /\bexport\b/.test(arrowMatch[0]),
      className: currentClass,
      classDecorators: [],
      parameters: paramList,
      bodyText,
    });
  }

  return functions;
}

function parseParamList(params: string): Array<{ name: string; typeText: string }> {
  if (!params.trim()) {
    return [];
  }
  if (params.length > PARAM_LIST_BUDGET_BYTES) {
    return [{ name: 'unparsedParams', typeText: 'unknown' }];
  }

  return params
    .split(',')
    .map((param) => param.trim())
    .filter(Boolean)
    .map((param) => {
      const colonIdx = param.indexOf(':');
      if (colonIdx >= 0) {
        return {
          name: param.substring(0, colonIdx).trim(),
          typeText: param
            .substring(colonIdx + 1)
            .trim()
            .replace(/=.*$/, '')
            .trim(),
        };
      }
      return { name: param.replace(/=.*$/, '').trim(), typeText: 'unknown' };
    });
}

function extractDecoratorsNear(source: string, index: number): string[] {
  const before = source.slice(
    Math.max(
      deriveZeroValue(),
      index -
        deriveHttpStatusFromObservedCatalog('OK') *
          (deriveUnitValue() + deriveUnitValue() + deriveUnitValue()),
    ),
    index,
  );
  const decorators: string[] = [];
  for (const line of before.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('@')) {
      continue;
    }
    const match = /^@(\w+)(?:\s*\([^)]*\))?/.exec(trimmed);
    if (match) {
      decorators.push(match[1]);
    }
  }
  return decorators.slice(
    -deriveCatalogPercentScaleFromObservedCatalog() *
      (deriveUnitValue() + deriveUnitValue() + deriveUnitValue()),
  );
}

function extractLargeFileFunctionStubs(source: string): ParsedFunc[] {
  const functions: ParsedFunc[] = [];

  let offset = 0;
  let currentClass: string | null = null;
  let currentClassDecorators: string[] = [];
  const lines = source.split('\n');
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];
    const classMatch = /^(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/.exec(line.trim());
    if (classMatch) {
      currentClass = classMatch[1];
      currentClassDecorators = extractDecoratorsNear(source, offset);
    }
    if (line.length > LINE_DECLARATION_BUDGET_BYTES) {
      offset += line.length + 1;
      continue;
    }
    const trimmed = line.trim();
    const functionMatch = /^(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)/.exec(
      trimmed,
    );
    const arrowMatch =
      /^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\(([^)]*)\)/.exec(trimmed);
    const methodMatch =
      /^(?:public\s+|private\s+|protected\s+)?(?:static\s+)?(?:async\s+)?(\w+)\s*\(([^)]*)\)\s*(?::\s*[^{;]+)?\{/.exec(
        trimmed,
      );

    const name = functionMatch?.[1] ?? arrowMatch?.[1] ?? methodMatch?.[1];
    const params = functionMatch?.[2] ?? arrowMatch?.[2] ?? methodMatch?.[2] ?? '';
    if (!name || requireJsReservedWordSet().has(name) || /^[A-Z]/.test(name)) {
      offset += line.length + 1;
      continue;
    }

    functions.push({
      name,
      line: lineIndex + 1,
      isAsync: /\basync\b/.test(trimmed),
      decorators: extractDecoratorsNear(source, offset),
      docComment: null,
      isExported: /\bexport\b/.test(trimmed),
      className: currentClass,
      classDecorators: currentClassDecorators,
      parameters: parseParamList(params),
      bodyText: trimmed,
    });
    offset += line.length + 1;
  }

  return functions;
}

// ===== Kind determination =====
function determineKind(
  func: ParsedFunc,
  sourceRoot: DetectedSourceRoot | null,
  sourceContext: SourceExternalContext,
): BehaviorNodeKind {
  const { decorators, className, name } = func;
  const kinds = requireBehaviorNodeKindCatalog();

  if (hasDecoratorRole(decorators, 'http_route', sourceRoot, sourceContext)) return kinds.apiEndpoint;
  if (hasDecoratorRole(decorators, 'cron_job', sourceRoot, sourceContext)) return kinds.cronJob;
  if (hasDecoratorRole(decorators, 'queue_consumer', sourceRoot, sourceContext)) {
    return kinds.queueConsumer;
  }
  if (hasDecoratorRole(decorators, 'event_listener', sourceRoot, sourceContext)) {
    return kinds.eventListener;
  }

  if (className) {
    const role = classNameRole(className, sourceRoot, sourceContext, func.classDecorators);
    if (role === 'controller_like') {
      if (hasDecoratorRole(decorators, 'http_route', sourceRoot, sourceContext)) {
        return kinds.apiEndpoint;
      }
      return kinds.handler;
    }
    if (role === 'gateway_like') return kinds.eventListener;
    if (role === 'guard_like') return kinds.authCheck;
    if (role === 'validation_like') return kinds.validation;
    if (role === 'service_like') {
      if (/^use[A-Z]/.test(name) || /^on[A-Z]/.test(name)) return kinds.lifecycleHook;
      return kinds.handler;
    }
    if (role === 'queue_like') return kinds.queueConsumer;
  }

  const lower = name.toLowerCase();

  if (/^use[A-Z]/.test(name)) return kinds.lifecycleHook;
  if (/^validate/i.test(name)) return kinds.validation;
  return kinds.functionDefinition;
}

// ===== Input extraction =====
function extractInputs(
  func: ParsedFunc,
  sourceRoot: DetectedSourceRoot | null,
  sourceContext: SourceExternalContext,
): BehaviorInput[] {
  const inputs: BehaviorInput[] = [];
  const { parameters, decorators } = func;

  for (const param of parameters) {
    const input: BehaviorInput = {
      kind: 'body',
      name: param.name,
      type: param.typeText,
      required: !param.typeText.includes('?') && !param.name.includes('?'),
      validated: false,
      source: param.name,
    };

    const nestedInputKind = decorators
      .map((decorator) => inputKindFromDecorator(decorator, sourceRoot, sourceContext))
      .filter(Boolean)
      .pop();
    if (nestedInputKind) {
      input.kind = nestedInputKind;
    }

    if (func.bodyText.includes(`validate`) && func.bodyText.includes(param.name)) {
      input.validated = true;
    }

    inputs.push(input);
  }

  return inputs;
}

// ===== State access detection =====
function detectStateAccess(bodyText: string): BehaviorStateAccess[] {
  if (!bodyText.includes('prisma')) {
    return [];
  }

  const accesses: BehaviorStateAccess[] = [];
  const seen = new Set<string>();

  const prismaPatterns = [
    new RegExp(String.raw`\bprisma\.(${IDENTIFIER_GRAMMAR})\.(${IDENTIFIER_GRAMMAR})\b`, 'g'),
    new RegExp(String.raw`\bthis\.prisma\.(${IDENTIFIER_GRAMMAR})\.(${IDENTIFIER_GRAMMAR})\b`, 'g'),
    new RegExp(String.raw`\bprismaClient\.(${IDENTIFIER_GRAMMAR})\.(${IDENTIFIER_GRAMMAR})\b`, 'g'),
  ];

  const readOperation = (operation: string): boolean =>
    /^(find|count|aggregate|group)/i.test(operation);
  const writeOperation = (operation: string): BehaviorStateAccess['operation'] | null => {
    if (/^create/i.test(operation)) return 'create';
    if (/^update/i.test(operation)) return 'update';
    if (/^delete/i.test(operation)) return 'delete';
    if (/^upsert/i.test(operation)) return 'upsert';
    return null;
  };

  for (const pattern of prismaPatterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(bodyText)) !== null) {
      const model = match[1];
      const op = match[2];
      const writeKind = writeOperation(op);
      const isRead = readOperation(op);
      if (!writeKind && !isRead) continue;

      const key = `${model}.${op}`;
      if (seen.has(key)) continue;
      seen.add(key);

      accesses.push({
        model,
        operation: writeKind ?? 'read',
        fieldPaths: [],
        whereClause: bodyText.includes('where') ? 'present' : null,
      });
    }
  }

  return accesses;
}

// ===== External API call detection =====
function packageProviderName(packageName: string): string {
  const parts = packageName.split('/').filter(Boolean);
  if (packageName.startsWith('@') && parts.length >= 2) {
    return `${parts[0]}/${parts[1]}`;
  }
  return parts[0] || packageName;
}

function parseNamedImportBindings(namedImports: string): string[] {
  return namedImports
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map(
      (entry) =>
        entry
          .split(/\s+as\s+/i)
          .pop()
          ?.trim() || '',
    )
    .filter(Boolean);
}

function collectSourceExternalContext(
  sourceText: string,
  sourceRoot: DetectedSourceRoot | null,
): SourceExternalContext {
  const packageProviders = new Set<string>();
  const importedBindings = new Set<string>();
  const importedBindingProviders = new Map<string, string>();
  const frameworkDecoratorBindings = new Set<string>();

  EXTERNAL_PACKAGE_IMPORT_PATTERN.lastIndex = 0;
  let packageMatch: RegExpExecArray | null;
  while ((packageMatch = EXTERNAL_PACKAGE_IMPORT_PATTERN.exec(sourceText)) !== null) {
    const packageName = packageMatch[1] ?? packageMatch[2] ?? '';
    if (packageName) {
      packageProviders.add(packageProviderName(packageName));
    }
  }

  IMPORT_BINDING_PATTERN.lastIndex = 0;
  let bindingMatch: RegExpExecArray | null;
  while ((bindingMatch = IMPORT_BINDING_PATTERN.exec(sourceText)) !== null) {
    const defaultBinding = bindingMatch[1];
    const namespaceBinding = bindingMatch[2];
    const namedBindings = bindingMatch[3];
    const packageName = bindingMatch[4];
    const providerName = packageProviderName(packageName);
    const observedBindings: string[] = [];
    if (defaultBinding) observedBindings.push(defaultBinding);
    if (namespaceBinding) observedBindings.push(namespaceBinding);
    if (namedBindings) {
      for (const binding of parseNamedImportBindings(namedBindings)) {
        observedBindings.push(binding);
      }
    }
    for (const binding of observedBindings) {
      importedBindings.add(binding);
      importedBindingProviders.set(binding, providerName);
      const packageLooksLikeDetectedFramework = (sourceRoot?.frameworks ?? []).some((framework) =>
        providerName.toLowerCase().includes(framework.toLowerCase().replace(/js$/, '')),
      );
      if (packageLooksLikeDetectedFramework) {
        frameworkDecoratorBindings.add(binding);
      }
    }
  }

  return {
    packageProviders: [...packageProviders],
    importedBindings,
    importedBindingProviders,
    frameworkDecoratorBindings,
  };
}

function pushExternalCall(
  calls: BehaviorExternalCall[],
  seen: Set<string>,
  provider: string,
  operation: string,
  bodyText: string,
): void {
  const key = `${provider}:${operation}`;
  if (seen.has(key)) return;
  seen.add(key);

  calls.push({
    provider,
    operation,
    hasTimeout: /\btimeout\b/i.test(bodyText) || /\bAbortSignal\b/i.test(bodyText),
    hasRetry: /\bretry\b/i.test(bodyText) || /\bmaxRetries\b/i.test(bodyText),
    hasCircuitBreaker: /\bcircuitBreaker\b/i.test(bodyText),
    hasFallback: /\bfallback\b/i.test(bodyText),
  });
}

function detectExternalCalls(
  bodyText: string,
  sourceContext: SourceExternalContext,
): BehaviorExternalCall[] {
  const calls: BehaviorExternalCall[] = [];
  const seen = new Set<string>();

  for (const { provider, pattern } of GENERIC_EXTERNAL_CALL_PATTERNS) {
    let match: RegExpExecArray | null;
    pattern.lastIndex = 0;
    while ((match = pattern.exec(bodyText)) !== null) {
      if (provider !== 'fetch') {
        const receiver = match[1] ?? '';
        const operation = match[2] ?? '';
        if (!looksLikeExternalReceiverName(receiver) || !looksLikeHttpOperation(operation)) {
          continue;
        }
      }
      pushExternalCall(calls, seen, provider, 'call', bodyText);
    }
  }

  EXTERNAL_RECEIVER_PATTERN.lastIndex = 0;
  let receiverMatch: RegExpExecArray | null;
  while ((receiverMatch = EXTERNAL_RECEIVER_PATTERN.exec(bodyText)) !== null) {
    if (isMemberChainTail(bodyText, receiverMatch.index)) continue;

    const receiver = receiverMatch[1];
    const operation = receiverMatch[2];
    const normalized = receiver.replace(/^this\./, '');
    if (!looksLikeExternalReceiverName(normalized)) {
      continue;
    }
    pushExternalCall(calls, seen, normalized, operation, bodyText);
  }

  EXTERNAL_SDK_OPERATION_PATTERN.lastIndex = 0;
  let sdkMatch: RegExpExecArray | null;
  while ((sdkMatch = EXTERNAL_SDK_OPERATION_PATTERN.exec(bodyText)) !== null) {
    const receiver = sdkMatch[1];
    const operation = sdkMatch[2];
    if (!sourceContext.importedBindings.has(receiver)) continue;
    pushExternalCall(calls, seen, receiver, operation, bodyText);
  }

  EXTERNAL_SDK_CHAIN_PATTERN.lastIndex = 0;
  let chainMatch: RegExpExecArray | null;
  while ((chainMatch = EXTERNAL_SDK_CHAIN_PATTERN.exec(bodyText)) !== null) {
    const receiver = chainMatch[1];
    const operation = chainMatch[3];
    if (!sourceContext.importedBindings.has(receiver)) continue;
    pushExternalCall(calls, seen, receiver, operation, bodyText);
  }

  CONSTRUCTOR_CALL_PATTERN.lastIndex = 0;
  let constructorMatch: RegExpExecArray | null;
  while ((constructorMatch = CONSTRUCTOR_CALL_PATTERN.exec(bodyText)) !== null) {
    const constructorName = constructorMatch[1];
    if (!sourceContext.importedBindings.has(constructorName)) continue;
    pushExternalCall(calls, seen, constructorName, 'instantiate', bodyText);
  }

  if (calls.length === 0 && /\bprocess\.env\.[A-Z][A-Z0-9_]*\b/.test(bodyText)) {
    for (const provider of sourceContext.packageProviders) {
      pushExternalCall(calls, seen, provider, 'configured_dependency', bodyText);
    }
  }

  return calls;
}

// ===== Output detection =====
function detectOutputs(bodyText: string, kind: BehaviorNodeKind): BehaviorOutput[] {
  const outputs: BehaviorOutput[] = [];

  if (bodyText.includes('return') && kind === 'api_endpoint') {
    outputs.push({ kind: 'response', target: 'client', type: 'json', conditional: false });
  }

  if (bodyText.includes('prisma')) {
    const writeOps = ['create', 'update', 'updateMany', 'delete', 'deleteMany', 'upsert'];
    for (const op of writeOps) {
      if (bodyText.includes(`.${op}`)) {
        outputs.push({ kind: 'db_write', target: 'prisma', type: op, conditional: false });
        break;
      }
    }
  }

  if (bodyText.includes('eventEmitter.emit(')) {
    outputs.push({ kind: 'event', target: 'event_emitter', type: 'emit', conditional: true });
  }

  if (bodyText.includes('.queue.add(') || bodyText.includes('.bullQueue.add(')) {
    outputs.push({ kind: 'queue_message', target: 'queue', type: 'add', conditional: true });
  }

  if (
    bodyText.includes('console.log') ||
    bodyText.includes('console.error') ||
    bodyText.includes('console.warn')
  ) {
    outputs.push({ kind: 'log', target: 'console', type: 'text', conditional: false });
  }

  return outputs;
}

// ===== Risk level determination =====
function determineRisk(
  kind: BehaviorNodeKind,
  bodyText: string,
  stateAccess: BehaviorStateAccess[],
  externalCalls: BehaviorExternalCall[],
  funcName: string,
  _decorators: string[],
): BehaviorRiskLevel {
  const risk = requireBehaviorRiskLevelCatalog();
  const kinds = requireBehaviorNodeKindCatalog();

  if (kind === kinds.authCheck) return risk.critical;

  const writeOps = discoverStateWriteOperationLabels();
  const hasWriteOps = stateAccess.some((a) => writeOps.has(a.operation));
  const hasDeleteOps = stateAccess.some((a) => a.operation === 'delete');
  const acceptsExternalInput =
    [kinds.apiEndpoint, kinds.webhookReceiver, kinds.queueConsumer, kinds.eventListener].includes(
      kind,
    );
  const touchesProcessBoundary =
    /\b(process\.env|document\.cookie|localStorage|sessionStorage|crypto\.|jwt|bcrypt|hash|secret|signature)\b/i.test(
      bodyText,
    );

  if (hasDeleteOps || (hasWriteOps && externalCalls.length > 0)) return risk.critical;
  if (acceptsExternalInput && hasWriteOps) return risk.high;
  if (touchesProcessBoundary && acceptsExternalInput) return risk.high;
  if (hasMessageOrPaymentSending(`${funcName} ${bodyText}`, externalCalls)) return risk.high;
  if (hasWriteOps && externalCalls.length > 0) return risk.high;
  if (hasWriteOps) return risk.medium;
  if (externalCalls.length > 0) return risk.medium;
  if (stateAccess.some((a) => a.operation === 'read')) return risk.medium;

  return risk.low;
}

// ===== Message / external mutation detection =====
const CALL_EXPRESSION_NAME_PATTERN = new RegExp(String.raw`\b(${IDENTIFIER_GRAMMAR})\s*\(`, 'g');

function operationTokens(operation: string): string[] {
  return operation
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .map((token) => token.toLowerCase())
    .filter(Boolean);
}

function looksLikeMessageDeliveryOperation(operation: string): boolean {
  const tokens = operationTokens(operation);
  return (
    tokens.some((token) => /^(send|reply|notify|publish|dispatch)$/.test(token)) &&
    tokens.some((token) => /^(message|text|media|template|email|sms|notification)$/.test(token))
  );
}

function looksLikeMoneyMutationOperation(operation: string): boolean {
  const tokens = operationTokens(operation);
  return (
    tokens.some((token) =>
      /^(transfer|payment|charge|refund|payout|capture|authorize|invoice|subscription)$/.test(
        token,
      ),
    ) &&
    tokens.some((token) =>
      /^(create|process|confirm|capture|authorize|charge|refund|transfer|cancel)$/.test(token),
    )
  );
}

function hasMessageOrPaymentSending(
  bodyText: string,
  externalCalls: BehaviorExternalCall[],
): boolean {
  CALL_EXPRESSION_NAME_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = CALL_EXPRESSION_NAME_PATTERN.exec(bodyText)) !== null) {
    const operation = match[1];
    if (
      looksLikeMessageDeliveryOperation(operation) ||
      looksLikeMoneyMutationOperation(operation) ||
      looksLikeExternalMutationOperation(operation)
    ) {
      return true;
    }
  }
  return externalCalls.some((call) => looksLikeExternalMutationOperation(call.operation));
}

// ===== Pure computation detection =====
function hasStateOrExternalEffects(
  stateAccess: BehaviorStateAccess[],
  externalCalls: BehaviorExternalCall[],
  bodyText: string,
): boolean {
  if (stateAccess.length > 0) return true;
  if (externalCalls.length > 0) return true;
  if (/\beventEmitter\.emit\b/.test(bodyText)) return true;
  if (/\b\.queue\.add\b/.test(bodyText)) return true;
  if (/\bprocess\.env\b/.test(bodyText)) return true;
  return false;
}

// ===== Execution mode determination =====
function determineExecutionMode(
  risk: BehaviorRiskLevel,
  kind: BehaviorNodeKind,
  funcName: string,
  decorators: string[],
  bodyText: string,
  stateAccess: BehaviorStateAccess[],
  externalCalls: BehaviorExternalCall[],
  sourceRoot: DetectedSourceRoot | null,
  sourceContext: SourceExternalContext,
): BehaviorNode['executionMode'] {
  const riskCatalog = requireBehaviorRiskLevelCatalog();
  const modeCatalog = requireExecutionModeCatalog();
  const kindCatalog = requireBehaviorNodeKindCatalog();

  if (risk === riskCatalog.critical || risk === riskCatalog.high) return modeCatalog.aiSafe;

  if (hasDecoratorRole(decorators, 'auth_guard', sourceRoot, sourceContext)) return modeCatalog.aiSafe;

  const sendsMessagesOrPayments = hasMessageOrPaymentSending(bodyText, externalCalls);
  if (sendsMessagesOrPayments) return modeCatalog.aiSafe;

  const writeOps = discoverStateWriteOperationLabels();
  const hasDbWrites = stateAccess.some((a) => writeOps.has(a.operation));

  if (hasDbWrites) {
    return modeCatalog.aiSafe;
  }

  const hasEffects = hasStateOrExternalEffects(stateAccess, externalCalls, bodyText);
  if (hasEffects) return modeCatalog.aiSafe;

  const isGetter =
    /^get[A-Z]/.test(funcName) ||
    /^find[A-Z]/.test(funcName) ||
    /^list[A-Z]/.test(funcName) ||
    /^fetch[A-Z]/.test(funcName) ||
    /^read[A-Z]/.test(funcName);
  if (isGetter && kind !== kindCatalog.apiEndpoint) return modeCatalog.observationOnly;

  return modeCatalog.aiSafe;
}

type BehaviorNodeArtifact = BehaviorNode & {
  validationRequirements: BehaviorValidationRequirement[];
  governedEvidenceMode: 'read_only_evidence' | 'sandboxed_execution_with_validation';
};

let _governedEvidenceModeCatalog: Record<string, string> | null = null;
function requireGovernedEvidenceModeCatalog(): Record<string, string> {
  if (!_governedEvidenceModeCatalog) {
    const members = deriveStringUnionMembersFromTypeContract(
      'scripts/pulse/behavior-graph.ts',
      'GovernedEvidenceMode',
    );
    const catalog: Record<string, string> = {};
    for (const member of members) {
      catalog[toCamelCase(member)] = member;
    }
    _governedEvidenceModeCatalog = Object.freeze(catalog);
  }
  return _governedEvidenceModeCatalog;
}

function uniqueValidationRequirements(
  requirements: BehaviorValidationRequirement[],
): BehaviorValidationRequirement[] {
  return [...new Set(requirements)];
}

function buildValidationRequirements(
  risk: BehaviorRiskLevel,
  executionMode: BehaviorNode['executionMode'],
  stateAccess: BehaviorStateAccess[],
  externalCalls: BehaviorExternalCall[],
  bodyText: string,
): BehaviorValidationRequirement[] {
  const vr = requireValidationRequirementCatalog();
  const risks = requireBehaviorRiskLevelCatalog();
  const modes = requireExecutionModeCatalog();
  const writeOps = discoverStateWriteOperationLabels();

  if (executionMode === modes.observationOnly) {
    return [vr.governedReadOnlyEvidence];
  }

  const requirements: BehaviorValidationRequirement[] = [vr.targetedTest, vr.typecheck];
  if (risk === risks.critical || risk === risks.high) {
    requirements.push(vr.packageBuild, vr.runtimeSmoke, vr.observabilityEvidence);
  }

  if (stateAccess.some((access) => writeOps.has(access.operation))) {
    requirements.push(vr.idempotencyCheck);
  }

  if (externalCalls.length > 0 || hasMessageOrPaymentSending(bodyText, externalCalls)) {
    requirements.push(vr.externalIntegrationEvidence);
  }

  return uniqueValidationRequirements(requirements);
}

// ===== Call graph extraction =====
function extractCalledFunctions(bodyText: string, allFuncNames: Set<string>): string[] {
  const called: string[] = [];
  const seen = new Set<string>();

  const callRegex = /(\w+)\s*\(/g;
  let callMatch: RegExpExecArray | null;
  while ((callMatch = callRegex.exec(bodyText)) !== null) {
    const callee = callMatch[1];
    if (
      allFuncNames.has(callee) &&
      !seen.has(callee) &&
      !requireJsReservedWordSet().has(callee) &&
      (callee[0] === callee[0].toUpperCase()) === false
    ) {
      seen.add(callee);
      called.push(callee);
    }
  }

  return called;
}

// ===== Function name map building =====
function buildFuncNameMap(functions: ParsedFunc[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const func of functions) {
    const names = map.get(func.name) || [];
    names.push(nextNodeId());
    map.set(func.name, names);
  }
  return map;
}

// ===== Main graph builder =====
function collectSourceFiles(rootDir: string): SourceFileTarget[] {
  const files: SourceFileTarget[] = [];

  for (const sourceRoot of detectSourceRoots(rootDir)) {
    const dir = sourceRoot.absolutePath;
    if (!pathExists(dir)) continue;

    const entries = readDir(dir, { recursive: true }) as string[];
    for (const entry of entries) {
      const ext = path.extname(entry);
      const validExtensions = discoverSourceExtensionsFromObservedTypescript();
      if (!validExtensions.has(ext)) continue;

      const normalized = entry.split(path.sep).join('/');
      if (SKIP_DIRS.some((skip) => normalized.includes(skip))) continue;

      files.push({ filePath: safeJoin(dir, entry), sourceRoot });
    }
  }

  return files;
}

/**
 * Parses a single TypeScript file using ts-morph and returns a list of
 * behavior nodes extracted from its function/method declarations.
 *
 * Falls back to regex-based parsing when ts-morph cannot process the file.
 *
 * @param filePath Absolute path to the TypeScript file.
 * @param relPath  Relative path from the project root.
 * @param allFuncNames Set of all function names found so far.
 * @param tsMorphAvailable Whether ts-morph was successfully loaded.
 * @returns Array of BehaviorNode objects extracted from the file.
 */
function parseFileWithTsMorph(
  filePath: string,
  relPath: string,
  tsMorphAvailable: boolean,
  sourceRoot: DetectedSourceRoot | null,
): BehaviorNode[] {
  try {
    let funcs: ParsedFunc[];
    const sourceText = readTextFile(filePath);

    if (tsMorphAvailable) {
      funcs = extractFunctionsFromSource(filePath, sourceText);
    } else {
      funcs = extractFunctionsFromSource(filePath, sourceText);
    }

    return buildNodesFromParsedFunctions(relPath, funcs, sourceText, sourceRoot);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[behavior-graph] Failed to parse ${relPath}: ${message}`);
  }

  return [];
}

function buildNodesFromParsedFunctions(
  relPath: string,
  funcs: ParsedFunc[],
  sourceText: string,
  sourceRoot: DetectedSourceRoot | null,
): BehaviorNodeArtifact[] {
  const sourceContext = collectSourceExternalContext(sourceText, sourceRoot);

  return funcs.map((func) => {
    const kind = determineKind(func, sourceRoot, sourceContext);
    const inputs = extractInputs(func, sourceRoot, sourceContext);
    const stateAccess = detectStateAccess(func.bodyText);
    const externalCalls = detectExternalCalls(func.bodyText, sourceContext);
    const outputs = detectOutputs(func.bodyText, kind);
    const risk = determineRisk(
      kind,
      func.bodyText,
      stateAccess,
      externalCalls,
      func.name,
      func.decorators,
    );
    const executionMode = determineExecutionMode(
      risk,
      kind,
      func.name,
      func.decorators,
      func.bodyText,
      stateAccess,
      externalCalls,
      sourceRoot,
      sourceContext,
    );

    const hasErrorHandler = func.bodyText.includes('try') && func.bodyText.includes('catch');
    const hasLogging =
      func.bodyText.includes('this.logger.') ||
      func.bodyText.includes('console.') ||
      func.bodyText.includes('logger.');
    const lowerBody = func.bodyText.toLowerCase();
    const hasMetrics =
      lowerBody.includes('metrics') ||
      lowerBody.includes('counter') ||
      lowerBody.includes('gauge') ||
      lowerBody.includes('histogram') ||
      lowerBody.includes('increment') ||
      lowerBody.includes('decrement');
    const hasTracing =
      lowerBody.includes('trace') || lowerBody.includes('span') || lowerBody.includes('context.');
    const validationRequirements = buildValidationRequirements(
      risk,
      executionMode,
      stateAccess,
      externalCalls,
      func.bodyText,
    );

    return {
      id: nextNodeId(),
      kind,
      name: func.name,
      filePath: relPath,
      sourceRoot: sourceRoot
        ? {
            relativePath: sourceRoot.relativePath,
            kind: sourceRoot.kind,
            languages: sourceRoot.languages,
            frameworks: sourceRoot.frameworks,
            entrypoints: sourceRoot.entrypoints,
          }
        : undefined,
      line: func.line,
      parentFunctionId: null,
      inputs,
      outputs,
      stateAccess,
      externalCalls,
      risk,
      executionMode,
      calledBy: [],
      calls: [],
      isAsync: func.isAsync,
      hasErrorHandler,
      hasLogging,
      hasMetrics,
      hasTracing,
      decorators: func.decorators,
      docComment: func.docComment,
      validationRequirements,
      governedEvidenceMode:
        executionMode === requireExecutionModeCatalog().observationOnly
          ? requireGovernedEvidenceModeCatalog().readOnlyEvidence
          : requireGovernedEvidenceModeCatalog().sandboxedExecutionWithValidation,
    };
  });
}

/**
 * Builds a complete Universal Code Behavior Graph for the project.
 *
 * Scans all TypeScript files in backend/src, frontend/src, and worker/src,
 * extracting per-function behavior metadata including inputs, outputs,
 * state access, external calls, risk classification, and observability
 * instrumentation.
 *
 * @param rootDir The project root directory containing source directories.
 * @returns A BehaviorGraph with all nodes, call relationships, orphans, and summary.
 */
export function buildBehaviorGraph(rootDir: string): BehaviorGraph {
  _nextNodeId = 0;
  const tsMorphAvailable = loadTsMorph();
  const allNodes: BehaviorNode[] = [];

  if (!tsMorphAvailable) {
    console.warn('[behavior-graph] ts-morph not available, using regex-only analysis');
  }

  console.warn(`[behavior-graph] Scanning source files in ${rootDir}...`);
  const sourceFiles = collectSourceFiles(rootDir);
  console.warn(`[behavior-graph] Found ${sourceFiles.length} TypeScript files`);

  // First pass: discover all function names for call-graph linking
  const allFuncNames = new Set<string>();
  const funcsByFile = new Map<string, ParsedFunc[]>();

  for (const sourceFile of sourceFiles) {
    try {
      const filePath = sourceFile.filePath;
      const sourceText = readTextFile(filePath);
      const funcs = extractFunctionsFromSource(filePath, sourceText);
      funcsByFile.set(filePath, funcs);
      for (const func of funcs) {
        allFuncNames.add(func.name);
      }
    } catch {
      // skip unreadable files
    }
  }
  console.warn(`[behavior-graph] Discovered ${allFuncNames.size} unique function names`);

  // Second pass: build full behavior nodes
  const bodyByNodeId = new Map<string, string>();
  for (let fileIndex = 0; fileIndex < sourceFiles.length; fileIndex++) {
    const sourceFile = sourceFiles[fileIndex];
    const filePath = sourceFile.filePath;
    if (process.env.PULSE_BEHAVIOR_DEBUG === '1') {
      console.warn(
        `[behavior-graph] Building nodes ${fileIndex}/${sourceFiles.length}: ${path.relative(rootDir, filePath)}`,
      );
    }
    const relPath = path.relative(rootDir, filePath);
    const sourceText = readTextFile(filePath);
    const funcs = funcsByFile.get(filePath);
    const fileNodes = funcs
      ? buildNodesFromParsedFunctions(relPath, funcs, sourceText, sourceFile.sourceRoot)
      : parseFileWithTsMorph(filePath, relPath, tsMorphAvailable, sourceFile.sourceRoot);
    for (let index = 0; index < fileNodes.length; index++) {
      const func = funcs?.[index];
      if (func) {
        bodyByNodeId.set(fileNodes[index].id, func.bodyText);
      }
    }
    allNodes.push(...fileNodes);
  }
  console.warn(`[behavior-graph] Built ${allNodes.length} behavior nodes`);

  // Build call graph: link calls between nodes
  const nameToNodeIds = new Map<string, string[]>();
  for (const node of allNodes) {
    const ids = nameToNodeIds.get(node.name) || [];
    ids.push(node.id);
    nameToNodeIds.set(node.name, ids);
  }

  for (const node of allNodes) {
    try {
      const bodyText = bodyByNodeId.get(node.id);
      if (bodyText) {
        const calledFuncNames = extractCalledFunctions(bodyText, allFuncNames);
        for (const calleeName of calledFuncNames) {
          const calleeIds = nameToNodeIds.get(calleeName);
          if (calleeIds) {
            for (const calleeId of calleeIds) {
              if (calleeId !== node.id && !node.calls.includes(calleeId)) {
                node.calls.push(calleeId);
              }
            }
          }
        }
      }
    } catch {
      // skip call graph linking for this node
    }
  }

  // Populate calledBy (reverse of calls)
  const nodeById = new Map(allNodes.map((node) => [node.id, node] as const));
  for (const node of allNodes) {
    for (const calleeId of node.calls) {
      const callee = nodeById.get(calleeId);
      if (callee && !callee.calledBy.includes(node.id)) {
        callee.calledBy.push(node.id);
      }
    }
  }

  // Identify orphans and unreachable nodes
  const orphanNodes = allNodes
    .filter((n) => n.calledBy.length === 0 && n.calls.length === 0)
    .map((n) => n.id);

  const reachable = new Set<string>();
  const entryNodes = allNodes.filter(
    (n) =>
      n.kind === 'api_endpoint' ||
      n.kind === 'cron_job' ||
      n.kind === 'queue_consumer' ||
      n.kind === 'webhook_receiver',
  );

  function traverse(nodeId: string) {
    if (reachable.has(nodeId)) return;
    reachable.add(nodeId);
    const node = nodeById.get(nodeId);
    if (!node) return;
    for (const childId of node.calls) {
      traverse(childId);
    }
  }

  for (const entry of entryNodes) {
    traverse(entry.id);
  }

  const unreachableNodes = allNodes.filter((n) => !reachable.has(n.id)).map((n) => n.id);

  // Build summary
  const summary: BehaviorGraphSummary = {
    totalNodes: allNodes.length,
    handlerNodes: allNodes.filter((n) => n.kind === 'handler').length,
    apiEndpointNodes: allNodes.filter((n) => n.kind === 'api_endpoint').length,
    queueNodes: allNodes.filter((n) => n.kind === 'queue_consumer' || n.kind === 'queue_producer')
      .length,
    cronNodes: allNodes.filter((n) => n.kind === 'cron_job').length,
    webhookNodes: allNodes.filter((n) => n.kind === 'webhook_receiver').length,
    dbNodes: allNodes.filter((n) => n.kind === 'db_reader' || n.kind === 'db_writer').length,
    externalCallNodes: allNodes.filter((n) => n.externalCalls.length > 0).length,
    aiSafeNodes: allNodes.filter((n) => n.executionMode === 'ai_safe').length,
    humanRequiredNodes: 0,
    nodesWithErrorHandler: allNodes.filter((n) => n.hasErrorHandler).length,
    nodesWithLogging: allNodes.filter((n) => n.hasLogging).length,
    nodesWithMetrics: allNodes.filter((n) => n.hasMetrics).length,
    criticalRiskNodes: allNodes.filter((n) => n.risk === 'critical').length,
  };

  return {
    generatedAt: new Date().toISOString(),
    summary,
    nodes: allNodes,
    orphanNodes,
    unreachableNodes,
  };
}

/**
 * Returns nodes marked as critical or high risk that lack try/catch error
 * handling. These are the most dangerous paths in the codebase for failures.
 *
 * @param graph The behavior graph to analyze.
 * @returns Array of BehaviorNode objects that are high-risk without error handling.
 */
export function getCriticalPaths(graph: BehaviorGraph): BehaviorNode[] {
  return graph.nodes.filter(
    (n) => (n.risk === 'critical' || n.risk === 'high') && !n.hasErrorHandler,
  );
}

/**
 * Returns nodes that lack all three observability pillars: logging, metrics,
 * and tracing. These are "dark" functions with no monitoring visibility.
 *
 * @param graph The behavior graph to analyze.
 * @returns Array of BehaviorNode objects without observability.
 */
export function getNodesWithoutObservability(graph: BehaviorGraph): BehaviorNode[] {
  return graph.nodes.filter((n) => !n.hasLogging && !n.hasMetrics && !n.hasTracing);
}

// ===== Output artifact generation =====

/**
 * Builds the behavior graph and writes `PULSE_BEHAVIOR_GRAPH.json` to the
 * `.pulse/current/` directory.
 *
 * This is the main entry point for daemon.ts integration. The function
 * returns the graph so the daemon can attach it to its layer state summary,
 * while the JSON artifact serves as the canonical persistent
 * truth for downstream perfectness modules.
 *
 * @param rootDir The project root directory.
 * @returns The constructed BehaviorGraph.
 */
export function generateBehaviorGraph(rootDir: string): BehaviorGraph {
  const graph = buildBehaviorGraph(rootDir);

  const artifactDir = path.join(rootDir, '.pulse', 'current');
  ensureDir(artifactDir, { recursive: true });
  writeTextFile(
    path.join(artifactDir, discoverAllObservedArtifactFilenames().behaviorGraph),
    JSON.stringify(graph, null, 2),
  );

  console.warn(
    `[behavior-graph] Wrote ${discoverAllObservedArtifactFilenames().behaviorGraph} — ${graph.summary.totalNodes} nodes, ` +
      `${graph.summary.aiSafeNodes} ai_safe, ${graph.summary.humanRequiredNodes} governed blockers`,
  );

  return graph;
}

// ===== CLI entry point =====
if (process.env.PULSE_BEHAVIOR_GRAPH_RUN === '1' || require.main === module) {
  const projectRoot = path.resolve(__dirname, '..', '..');
  console.warn(`[behavior-graph] Running standalone from ${projectRoot}`);
  const graph = generateBehaviorGraph(projectRoot);
  console.warn(`[behavior-graph] Done. Top 5 nodes by risk:`);
  const topRisks = graph.nodes
    .filter((n) => n.risk === 'critical' || n.risk === 'high')
    .sort((a, b) => {
      const order: Record<BehaviorRiskLevel, number> = {
        critical: 0,
        high: 1,
        medium: 2,
        low: 3,
        none: 4,
      };
      return order[a.risk] - order[b.risk];
    })
    .slice(0, 5);
  for (const node of topRisks) {
    console.warn(`  [${node.risk}] ${node.name} (${node.filePath}:${node.line})`);
  }
}

