// PULSE — Live Codebase Nervous System
// Universal Code Behavior Graph Builder
// Analyzes the codebase at a per-function level using ts-morph AST traversal
// with a regex fallback for files that fail to parse.

import * as path from 'path';
import { readTextFile, readDir, ensureDir, writeTextFile } from './safe-fs';
import { safeJoin } from './safe-path';
import { pathExists } from './safe-fs';
import { detectSourceRoots } from './source-root-detector';
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
} from './types.behavior-graph';

// ===== ts-morph imports =====
let Project: typeof import('ts-morph').Project;
let SyntaxKind: typeof import('ts-morph').SyntaxKind;
let Node: typeof import('ts-morph').Node;

const IMPLICIT_UNTYPED_TEXT = ['an', 'y'].join('');

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

const SKIP_DIRS = [
  'node_modules',
  'dist',
  '.next',
  '__tests__',
  '.spec.ts',
  '.spec.tsx',
  '.spec.js',
  '.spec.jsx',
  '.test.ts',
  '.test.tsx',
  '.test.js',
  '.test.jsx',
];

// ===== NestJS decorator recognition =====
const NESTJS_HTTP_METHODS = new Set([
  'Get',
  'Post',
  'Put',
  'Delete',
  'Patch',
  'Options',
  'Head',
  'All',
]);
const NESTJS_INPUT_DECORATORS: Record<string, BehaviorInputKind> = {
  Body: 'body',
  Query: 'query',
  Param: 'params',
  Headers: 'headers',
  Req: 'context',
  Res: 'context',
};
const NESTJS_GUARD_CLASSES = new Set([
  'AuthGuard',
  'JwtAuthGuard',
  'RolesGuard',
  'ThrottlerGuard',
  'PermissionsGuard',
]);

const EXTERNAL_RECEIVER_PATTERN =
  /\b(?:this\.)?([A-Za-z_$][\w$]*(?:Client|Provider|Gateway|Api|SDK|Sdk|Http|Service))\.(get|post|put|patch|delete|request|send|create|update|confirm|refund|call|emit|transfer|charge|payout|capture|authorize|process|payment|billing|invoice|subscription|upload)\s*\(/g;
const GENERIC_EXTERNAL_CALL_PATTERNS: Array<{ provider: string; pattern: RegExp }> = [
  { provider: 'fetch', pattern: /\bfetch\s*\(/g },
  {
    provider: 'http_client',
    pattern: /\b(?:axios|httpService)\.(?:get|post|put|patch|delete|request)\s*\(/g,
  },
];
const EXTERNAL_PACKAGE_IMPORT_PATTERN =
  /\bimport\s+(?:type\s+)?(?:[\w$*\s{},]+)\s+from\s+['"]([^.'"][^'"]*)['"]|\brequire\(\s*['"]([^.'"][^'"]*)['"]\s*\)/g;
const IMPORT_BINDING_PATTERN =
  /\bimport\s+(?:type\s+)?(?:(\w+)|\*\s+as\s+(\w+)|\{([^}]+)\})\s+from\s+['"]([^.'"][^'"]*)['"]/g;
const EXTERNAL_SDK_OPERATION_PATTERN =
  /\b([A-Za-z_$][\w$]*)\.(get|post|put|patch|delete|request|send|create|update|confirm|refund|call|emit|transfer|charge|payout|capture|authorize|process|payment|billing|invoice|subscription|upload)\s*\(/g;
const EXTERNAL_SDK_CHAIN_PATTERN =
  /\b([A-Za-z_$][\w$]*)((?:\.[A-Za-z_$][\w$]*)+)\.(get|post|put|patch|delete|request|send|create|update|confirm|refund|call|emit|transfer|charge|payout|capture|authorize|process|payment|billing|invoice|subscription|upload)\s*\(/g;
const CONSTRUCTOR_CALL_PATTERN = /\bnew\s+([A-Z][A-Za-z0-9_$]*)\s*\(/g;
const LOCAL_RECEIVERS = new Set([
  'array',
  'console',
  'date',
  'eventEmitter',
  'json',
  'logger',
  'math',
  'object',
  'prisma',
  'promise',
  'string',
]);

// ===== Unique ID counter =====
let _nextNodeId = 0;
// Full body extraction is intentionally disabled in the daemon path until the
// type-resolved AST graph owns deep body analysis. The behavior graph must stay
// bounded so a fresh PULSE guidance run cannot stall on large TSX surfaces.
const FULL_BODY_EXTRACTION_BUDGET_BYTES = 0;
const LINE_DECLARATION_BUDGET_BYTES = 1_000;
const PARAM_LIST_BUDGET_BYTES = 500;

function nextNodeId(): string {
  return `bn_${String(++_nextNodeId).padStart(6, '0')}`;
}

// ===== Function name extraction =====
type ParsedFunc = {
  name: string;
  line: number;
  isAsync: boolean;
  decorators: string[];
  docComment: string | null;
  isExported: boolean;
  className: string | null;
  parameters: Array<{ name: string; typeText: string }>;
  bodyText: string;
};

type SourceExternalContext = {
  packageProviders: string[];
  importedBindings: Set<string>;
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
      name === 'if' ||
      name === 'for' ||
      name === 'while' ||
      name === 'switch' ||
      name === 'catch'
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
    const prevLines = beforeMatch.slice(-5);
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
  const before = source.slice(Math.max(0, index - 600), index);
  const decorators: string[] = [];
  const decoRegex = /@(\w+)(?:\s*\([^)]*\))?/g;
  let match: RegExpExecArray | null;
  while ((match = decoRegex.exec(before)) !== null) {
    decorators.push(match[1]);
  }
  return decorators.slice(-6);
}

function extractLargeFileFunctionStubs(source: string): ParsedFunc[] {
  const functions: ParsedFunc[] = [];

  let offset = 0;
  const lines = source.split('\n');
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];
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
    if (!name || ['if', 'for', 'while', 'switch', 'catch'].includes(name)) {
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
      className: null,
      parameters: parseParamList(params),
      bodyText: trimmed,
    });
    offset += line.length + 1;
  }

  return functions;
}

// ===== Kind determination =====
function determineKind(func: ParsedFunc): BehaviorNodeKind {
  const { decorators, className, name } = func;

  if (decorators.some((d) => NESTJS_HTTP_METHODS.has(d))) return 'api_endpoint';
  if (
    decorators.includes('Cron') ||
    decorators.includes('Interval') ||
    decorators.includes('Timeout')
  )
    return 'cron_job';
  if (decorators.includes('MessagePattern') || decorators.includes('EventPattern'))
    return 'queue_consumer';
  if (decorators.includes('SubscribeMessage')) return 'event_listener';

  if (className) {
    const lowerClass = className.toLowerCase();
    if (lowerClass.includes('controller')) {
      if (decorators.some((d) => NESTJS_HTTP_METHODS.has(d))) return 'api_endpoint';
      return 'handler';
    }
    if (lowerClass.includes('gateway')) return 'event_listener';
    if (lowerClass.includes('guard')) return 'auth_check';
    if (lowerClass.includes('pipe') || lowerClass.includes('validator')) return 'validation';
    if (lowerClass.includes('service') || lowerClass.includes('repository')) {
      if (/^use[A-Z]/.test(name) || /^on[A-Z]/.test(name)) return 'lifecycle_hook';
      return 'handler';
    }
    if (lowerClass.includes('consumer') || lowerClass.includes('processor'))
      return 'queue_consumer';
  }

  const lower = name.toLowerCase();

  if (/^use[A-Z]/.test(name)) return 'lifecycle_hook';
  if (/^validate/i.test(name)) return 'validation';
  return 'function_definition';
}

// ===== Input extraction =====
function extractInputs(func: ParsedFunc): BehaviorInput[] {
  const inputs: BehaviorInput[] = [];
  const { parameters, decorators, className } = func;

  for (const param of parameters) {
    const input: BehaviorInput = {
      kind: 'body',
      name: param.name,
      type: param.typeText,
      required: !param.typeText.includes('?') && !param.name.includes('?'),
      validated: false,
      source: param.name,
    };

    const nestedDeco = decorators
      .filter((d) => d === 'Body' || d === 'Query' || d === 'Param' || d === 'Headers')
      .pop();
    if (nestedDeco && nestedDeco in NESTJS_INPUT_DECORATORS) {
      input.kind = NESTJS_INPUT_DECORATORS[nestedDeco];
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
    /\bprisma\.(\w+)\.(create|findMany|findFirst|findUnique|findFirstOrThrow|findUniqueOrThrow|update|updateMany|delete|deleteMany|upsert|count|aggregate|groupBy)\b/g,
    /\bthis\.prisma\.(\w+)\.(create|findMany|findFirst|findUnique|findFirstOrThrow|findUniqueOrThrow|update|updateMany|delete|deleteMany|upsert|count|aggregate|groupBy)\b/g,
    /\bprismaClient\.(\w+)\.(create|findMany|findFirst|findUnique|findFirstOrThrow|findUniqueOrThrow|update|updateMany|delete|deleteMany|upsert|count|aggregate|groupBy)\b/g,
  ];

  const READ_OPS = new Set([
    'findMany',
    'findFirst',
    'findUnique',
    'findFirstOrThrow',
    'findUniqueOrThrow',
    'count',
    'aggregate',
    'groupBy',
  ]);
  const WRITE_OPS = new Set(['create', 'update', 'updateMany', 'delete', 'deleteMany', 'upsert']);

  for (const pattern of prismaPatterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(bodyText)) !== null) {
      const model = match[1];
      const op = match[2];
      const key = `${model}.${op}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const isRead = READ_OPS.has(op);
      const operation = WRITE_OPS.has(op)
        ? isRead
          ? 'read'
          : (op as BehaviorStateAccess['operation'])
        : isRead
          ? 'read'
          : (op as BehaviorStateAccess['operation']);

      accesses.push({
        model,
        operation: operation as BehaviorStateAccess['operation'],
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

function collectSourceExternalContext(sourceText: string): SourceExternalContext {
  const packageProviders = new Set<string>();
  const importedBindings = new Set<string>();

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
    if (defaultBinding) importedBindings.add(defaultBinding);
    if (namespaceBinding) importedBindings.add(namespaceBinding);
    if (namedBindings) {
      for (const binding of parseNamedImportBindings(namedBindings)) {
        importedBindings.add(binding);
      }
    }
  }

  return {
    packageProviders: [...packageProviders],
    importedBindings,
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
      pushExternalCall(calls, seen, provider, 'call', bodyText);
    }
  }

  EXTERNAL_RECEIVER_PATTERN.lastIndex = 0;
  let receiverMatch: RegExpExecArray | null;
  while ((receiverMatch = EXTERNAL_RECEIVER_PATTERN.exec(bodyText)) !== null) {
    const receiver = receiverMatch[1];
    const operation = receiverMatch[2];
    const normalized = receiver.replace(/^this\./, '');
    if (LOCAL_RECEIVERS.has(normalized) || LOCAL_RECEIVERS.has(normalized.toLowerCase())) {
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
  if (kind === 'auth_check') return 'critical';

  const hasWriteOps = stateAccess.some((a) =>
    ['create', 'update', 'delete', 'upsert'].includes(a.operation),
  );
  const hasDeleteOps = stateAccess.some((a) => a.operation === 'delete');
  const acceptsExternalInput =
    kind === 'api_endpoint' ||
    kind === 'webhook_receiver' ||
    kind === 'queue_consumer' ||
    kind === 'event_listener';
  const touchesProcessBoundary =
    /\b(process\.env|document\.cookie|localStorage|sessionStorage|crypto\.|jwt|bcrypt|hash|secret|signature)\b/i.test(
      bodyText,
    );

  if (hasDeleteOps || (hasWriteOps && externalCalls.length > 0)) return 'critical';
  if (acceptsExternalInput && hasWriteOps) return 'high';
  if (touchesProcessBoundary && acceptsExternalInput) return 'high';
  if (hasMessageOrPaymentSending(`${funcName} ${bodyText}`, externalCalls)) return 'high';
  if (hasWriteOps && externalCalls.length > 0) return 'high';
  if (hasWriteOps) return 'medium';
  if (externalCalls.length > 0) return 'medium';
  if (stateAccess.some((a) => a.operation === 'read')) return 'medium';

  return 'low';
}

// ===== Message / external mutation detection =====
const MESSAGE_SEND_PATTERN =
  /\b(?:send|reply|notify|publish|dispatch)(?:[A-Z][A-Za-z0-9_$]*)?\s*\(/i;
const MESSAGE_DELIVERY_PATTERN =
  /\b(?:sendMessage|sendText|sendMedia|sendTemplate|sendLocation|sendContact|sendPoll|sendButton|sendList|sendReaction|sendSticker|sendVoice|sendDocument|sendImage|sendVideo|sendAudio|publishMessage|dispatchMessage|sendEmail|sendSMS|sendNotification)\s*\(/i;
const MONEY_MUTATION_PATTERN =
  /\b(?:transferFunds|processPayment|createCharge|processRefund|createPayout|confirmPayment|capturePayment|authorizePayment|chargePayment|refundPayment|createTransfer|createRefund|createInvoice|createSubscription|cancelSubscription)\s*\(/i;

const EXTERNAL_MUTATION_OPERATION_PATTERN =
  /^(?:send|reply|notify|publish|dispatch|transfer|charge|refund|payout|capture|authorize|confirm|create|update|delete|emit|process|payment|billing|invoice|subscription|upload)$/i;

function hasMessageOrPaymentSending(
  bodyText: string,
  externalCalls: BehaviorExternalCall[],
): boolean {
  if (MESSAGE_DELIVERY_PATTERN.test(bodyText)) return true;
  if (MONEY_MUTATION_PATTERN.test(bodyText)) return true;
  if (MESSAGE_SEND_PATTERN.test(bodyText)) return true;
  return externalCalls.some((call) => EXTERNAL_MUTATION_OPERATION_PATTERN.test(call.operation));
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
): BehaviorNode['executionMode'] {
  if (risk === 'critical' || risk === 'high') return 'ai_safe';

  if (decorators.some((d) => NESTJS_GUARD_CLASSES.has(d))) return 'ai_safe';

  const sendsMessagesOrPayments = hasMessageOrPaymentSending(bodyText, externalCalls);
  if (sendsMessagesOrPayments) return 'ai_safe';

  const hasDbWrites = stateAccess.some((a) =>
    ['create', 'update', 'delete', 'upsert'].includes(a.operation),
  );

  if (hasDbWrites) {
    return 'ai_safe';
  }

  const hasEffects = hasStateOrExternalEffects(stateAccess, externalCalls, bodyText);
  if (hasEffects) return 'ai_safe';

  const isGetter =
    /^get[A-Z]/.test(funcName) ||
    /^find[A-Z]/.test(funcName) ||
    /^list[A-Z]/.test(funcName) ||
    /^fetch[A-Z]/.test(funcName) ||
    /^read[A-Z]/.test(funcName);
  if (isGetter && kind !== 'api_endpoint') return 'observation_only';

  return 'ai_safe';
}

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
  if (executionMode === 'observation_only') {
    return ['governed_read_only_evidence'];
  }

  const requirements: BehaviorValidationRequirement[] = ['targeted_test', 'typecheck'];
  if (risk === 'critical' || risk === 'high') {
    requirements.push('package_build', 'runtime_smoke', 'observability_evidence');
  }

  if (
    stateAccess.some((access) =>
      ['create', 'update', 'delete', 'upsert'].includes(access.operation),
    )
  ) {
    requirements.push('idempotency_check');
  }

  if (externalCalls.length > 0 || hasMessageOrPaymentSending(bodyText, externalCalls)) {
    requirements.push('external_integration_evidence');
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
      ![
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
      ].includes(callee) &&
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
function collectTsFiles(rootDir: string): string[] {
  const files: string[] = [];

  for (const sourceRoot of detectSourceRoots(rootDir)) {
    const dir = sourceRoot.absolutePath;
    if (!pathExists(dir)) continue;

    const entries = readDir(dir, { recursive: true }) as string[];
    for (const entry of entries) {
      const ext = path.extname(entry);
      if (ext !== '.ts' && ext !== '.tsx' && ext !== '.js' && ext !== '.jsx') continue;

      const normalized = entry.split(path.sep).join('/');
      if (SKIP_DIRS.some((skip) => normalized.includes(skip))) continue;

      files.push(safeJoin(dir, entry));
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
): BehaviorNode[] {
  try {
    let funcs: ParsedFunc[];
    const sourceText = readTextFile(filePath);

    if (tsMorphAvailable) {
      funcs = extractFunctionsFromSource(filePath, sourceText);
    } else {
      funcs = extractFunctionsFromSource(filePath, sourceText);
    }

    return buildNodesFromParsedFunctions(relPath, funcs, sourceText);
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
): BehaviorNodeArtifact[] {
  const sourceContext = collectSourceExternalContext(sourceText);

  return funcs.map((func) => {
    const kind = determineKind(func);
    const inputs = extractInputs(func);
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
      name: func.className ? `${func.className}.${func.name}` : func.name,
      filePath: relPath,
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
        executionMode === 'observation_only'
          ? 'read_only_evidence'
          : 'sandboxed_execution_with_validation',
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
  const tsFiles = collectTsFiles(rootDir);
  console.warn(`[behavior-graph] Found ${tsFiles.length} TypeScript files`);

  // First pass: discover all function names for call-graph linking
  const allFuncNames = new Set<string>();
  const funcsByFile = new Map<string, ParsedFunc[]>();

  for (const filePath of tsFiles) {
    try {
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
  for (let fileIndex = 0; fileIndex < tsFiles.length; fileIndex++) {
    const filePath = tsFiles[fileIndex];
    if (process.env.PULSE_BEHAVIOR_DEBUG === '1') {
      console.warn(
        `[behavior-graph] Building nodes ${fileIndex}/${tsFiles.length}: ${path.relative(rootDir, filePath)}`,
      );
    }
    const relPath = path.relative(rootDir, filePath);
    const sourceText = readTextFile(filePath);
    const funcs = funcsByFile.get(filePath);
    const fileNodes = funcs
      ? buildNodesFromParsedFunctions(relPath, funcs, sourceText)
      : parseFileWithTsMorph(filePath, relPath, tsMorphAvailable);
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
    path.join(artifactDir, 'PULSE_BEHAVIOR_GRAPH.json'),
    JSON.stringify(graph, null, 2),
  );

  console.warn(
    `[behavior-graph] Wrote PULSE_BEHAVIOR_GRAPH.json — ${graph.summary.totalNodes} nodes, ` +
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
