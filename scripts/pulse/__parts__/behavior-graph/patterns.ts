let Project: typeof import('ts-morph').Project;
let SyntaxKind: typeof import('ts-morph').SyntaxKind;
let Node: typeof import('ts-morph').Node;

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

let _nextNodeId = 0;
const FULL_BODY_EXTRACTION_BUDGET_BYTES = 0;
const LINE_DECLARATION_BUDGET_BYTES = 1_000;
const PARAM_LIST_BUDGET_BYTES = 500;

function nextNodeId(): string {
  return `bn_${String(++_nextNodeId).padStart(6, '0')}`;
}

export {
  Project,
  SyntaxKind,
  Node,
  loadTsMorph,
  SKIP_DIRS,
  IDENTIFIER_GRAMMAR,
  UPPER_IDENTIFIER_GRAMMAR,
  STRING_QUOTE_GRAMMAR,
  EXTERNAL_RECEIVER_PATTERN,
  GENERIC_EXTERNAL_CALL_PATTERNS,
  EXTERNAL_PACKAGE_IMPORT_PATTERN,
  IMPORT_BINDING_PATTERN,
  EXTERNAL_SDK_OPERATION_PATTERN,
  EXTERNAL_SDK_CHAIN_PATTERN,
  CONSTRUCTOR_CALL_PATTERN,
  looksLikeExternalReceiverName,
  looksLikeHttpOperation,
  looksLikeExternalMutationOperation,
  isMemberChainTail,
  _nextNodeId,
  FULL_BODY_EXTRACTION_BUDGET_BYTES,
  LINE_DECLARATION_BUDGET_BYTES,
  PARAM_LIST_BUDGET_BYTES,
  nextNodeId,
};
