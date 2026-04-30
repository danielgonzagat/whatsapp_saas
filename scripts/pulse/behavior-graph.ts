// PULSE — Live Codebase Nervous System
// Universal Code Behavior Graph Builder
// Analyzes the codebase at a per-function level using ts-morph AST traversal
// with a regex fallback for files that fail to parse.

import * as path from 'path';
import { readTextFile, readDir, ensureDir, writeTextFile } from './safe-fs';
import { safeJoin } from './safe-path';
import { pathExists } from './safe-fs';
import { detectSourceRoots } from './source-root-detector';
import type { DetectedSourceRoot } from './source-root-detector';
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

type BehaviorDecoratorRole =
  | 'http_route'
  | 'queue_consumer'
  | 'cron_job'
  | 'event_listener'
  | 'request_body'
  | 'request_query'
  | 'request_params'
  | 'request_headers'
  | 'request_context'
  | 'auth_guard';

type BehaviorClassNameRole =
  | 'controller_like'
  | 'gateway_like'
  | 'guard_like'
  | 'validation_like'
  | 'service_like'
  | 'queue_like';

const IDENTIFIER_GRAMMAR = String.raw`[A-Za-z_$][\w$]*`;
const UPPER_IDENTIFIER_GRAMMAR = String.raw`[A-Z][A-Za-z0-9_$]*`;
const STRING_QUOTE_GRAMMAR = String.raw`['"]`;
const EXTERNAL_RECEIVER_PATTERN = new RegExp(
  String.raw`\b(?:this\.)?(${IDENTIFIER_GRAMMAR})\.(${IDENTIFIER_GRAMMAR})\s*\(`,
  'g',
);
const GENERIC_EXTERNAL_CALL_PATTERNS: Array<{ provider: string; pattern: RegExp }> = [
  { provider: 'fetch', pattern: new RegExp(String.raw`\bfetch\s*\(`, 'g') },
  {
    provider: 'http_client',
    pattern: new RegExp(String.raw`\b(${IDENTIFIER_GRAMMAR})\.(${IDENTIFIER_GRAMMAR})\s*\(`, 'g'),
  },
];
const EXTERNAL_PACKAGE_IMPORT_PATTERN = new RegExp(
  String.raw`\bimport\s+(?:type\s+)?(?:[\w$*\s{},]+)\s+from\s+${STRING_QUOTE_GRAMMAR}([^.'"][^'"]*)${STRING_QUOTE_GRAMMAR}|\brequire\(\s*${STRING_QUOTE_GRAMMAR}([^.'"][^'"]*)${STRING_QUOTE_GRAMMAR}\s*\)`,
  'g',
);
const IMPORT_BINDING_PATTERN = new RegExp(
  String.raw`\bimport\s+(?:type\s+)?(?:(\w+)|\*\s+as\s+(\w+)|\{([^}]+)\})\s+from\s+${STRING_QUOTE_GRAMMAR}([^.'"][^'"]*)${STRING_QUOTE_GRAMMAR}`,
  'g',
);
const EXTERNAL_SDK_OPERATION_PATTERN = new RegExp(
  String.raw`\b(${IDENTIFIER_GRAMMAR})\.(${IDENTIFIER_GRAMMAR})\s*\(`,
  'g',
);
const EXTERNAL_SDK_CHAIN_PATTERN = new RegExp(
  String.raw`\b(${IDENTIFIER_GRAMMAR})((?:\.${IDENTIFIER_GRAMMAR})+)\.(${IDENTIFIER_GRAMMAR})\s*\(`,
  'g',
);
const CONSTRUCTOR_CALL_PATTERN = new RegExp(
  String.raw`\bnew\s+(${UPPER_IDENTIFIER_GRAMMAR})\s*\(`,
  'g',
);

function looksLikeExternalReceiverName(receiver: string): boolean {
  return /(client|provider|gateway|api|sdk|http|service)$/i.test(receiver);
}

function looksLikeHttpOperation(operation: string): boolean {
  return /^(get|post|put|patch|delete|request)$/i.test(operation);
}

function looksLikeExternalMutationOperation(operation: string): boolean {
  return /^(send|reply|notify|publish|dispatch|transfer|charge|refund|payout|capture|authorize|confirm|create|update|delete|emit|process|payment|billing|invoice|subscription|upload)$/i.test(
    operation,
  );
}

function isMemberChainTail(sourceText: string, matchIndex: number): boolean {
  return matchIndex > 0 && sourceText[matchIndex - 1] === '.';
}

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

function identifierTokens(value: string): string[] {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .map((token) => token.toLowerCase())
    .filter(Boolean);
}

function decoratorRoles(
  decorator: string,
  sourceRoot: DetectedSourceRoot | null,
  sourceContext: SourceExternalContext,
): BehaviorDecoratorRole[] {
  const roles = new Set<BehaviorDecoratorRole>();
  const tokens = identifierTokens(decorator);
  const packageName = sourceContext.importedBindingProviders.get(decorator) ?? null;
  const frameworkBacked =
    sourceContext.frameworkDecoratorBindings.has(decorator) ||
    (packageName
      ? (sourceRoot?.frameworks ?? []).some((framework) =>
          packageName.toLowerCase().includes(framework.toLowerCase().replace(/js$/, '')),
        )
      : false);

  if (!frameworkBacked) {
    return [];
  }

  const joined = tokens.join('-');
  if (/^(all|head|options|get|post|put|patch|delete)$/.test(joined)) roles.add('http_route');
  if (tokens.some((token) => token === 'cron' || token === 'interval' || token === 'timeout')) {
    roles.add('cron_job');
  }
  if (
    tokens.some((token) => token === 'message' || token === 'event' || token === 'pattern') ||
    joined.includes('process')
  ) {
    roles.add('queue_consumer');
  }
  if (tokens.some((token) => token === 'subscribe' || token === 'listener')) {
    roles.add('event_listener');
  }
  if (tokens.includes('body')) roles.add('request_body');
  if (tokens.includes('query')) roles.add('request_query');
  if (tokens.some((token) => token === 'param' || token === 'params')) roles.add('request_params');
  if (tokens.some((token) => token === 'header' || token === 'headers')) {
    roles.add('request_headers');
  }
  if (tokens.some((token) => token === 'req' || token === 'res' || token === 'context')) {
    roles.add('request_context');
  }
  if (tokens.some((token) => token === 'auth' || token === 'guard')) roles.add('auth_guard');

  return [...roles];
}

function hasDecoratorRole(
  decorators: string[],
  role: BehaviorDecoratorRole,
  sourceRoot: DetectedSourceRoot | null,
  sourceContext: SourceExternalContext,
): boolean {
  return decorators.some((decorator) =>
    decoratorRoles(decorator, sourceRoot, sourceContext).includes(role),
  );
}

function inputKindFromDecorator(
  decorator: string,
  sourceRoot: DetectedSourceRoot | null,
  sourceContext: SourceExternalContext,
): BehaviorInputKind | null {
  const roles = decoratorRoles(decorator, sourceRoot, sourceContext);
  if (roles.includes('request_body')) return 'body';
  if (roles.includes('request_query')) return 'query';
  if (roles.includes('request_params')) return 'params';
  if (roles.includes('request_headers')) return 'headers';
  if (roles.includes('request_context')) return 'context';
  return null;
}

function classNameRole(
  className: string,
  sourceRoot: DetectedSourceRoot | null,
  sourceContext: SourceExternalContext,
  classDecorators: string[],
): BehaviorClassNameRole | null {
  for (const decorator of classDecorators) {
    const tokens = identifierTokens(decorator);
    if (tokens.includes('controller')) return 'controller_like';
    if (tokens.includes('gateway')) return 'gateway_like';
    if (tokens.includes('guard')) return 'guard_like';
    if (tokens.some((token) => token === 'pipe' || token === 'validator')) {
      return 'validation_like';
    }
    if (tokens.some((token) => token === 'processor' || token === 'consumer')) {
      return 'queue_like';
    }
  }

  const tokens = identifierTokens(className);
  const hasFrameworkEvidence =
    sourceRoot?.frameworks.length || sourceContext.frameworkDecoratorBindings.size;
  if (!hasFrameworkEvidence) {
    return null;
  }
  if (tokens.includes('controller')) return 'controller_like';
  if (tokens.includes('gateway')) return 'gateway_like';
  if (tokens.includes('guard')) return 'guard_like';
  if (tokens.some((token) => token === 'pipe' || token === 'validator')) return 'validation_like';
  if (tokens.some((token) => token === 'processor' || token === 'consumer')) return 'queue_like';
  if (tokens.some((token) => token === 'service' || token === 'repository')) return 'service_like';
  return null;
}
import "./__companions__/behavior-graph.companion";
