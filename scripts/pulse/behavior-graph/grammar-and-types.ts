import type { DetectedSourceRoot } from '../../source-root-detector/types';
import type {
  BehaviorNode,
  BehaviorValidationRequirement,
  BehaviorDecoratorRole,
  BehaviorClassNameRole,
  GovernedEvidenceMode,
} from '../../types.behavior-graph';
import { discoverExternalReceiverTokensFromEvidence } from '../../dynamic-reality-kernel/token-evidence';
import { discoverSourceExtensionsFromObservedTypescript } from '../../dynamic-reality-kernel/token-evidence';
import { discoverAllObservedHttpStatusCodes } from '../../dynamic-reality-kernel/catalog-arithmetic';

type BehaviorNodeArtifact = BehaviorNode & {
  governedEvidenceMode: GovernedEvidenceMode;
};

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

const IDENTIFIER_GRAMMAR = String.raw`[A-Za-z_$][\w$]*`;
const UPPER_IDENTIFIER_GRAMMAR = String.raw`[A-Z][A-Za-z0-9_$]*`;
const STRING_QUOTE_GRAMMAR = String.raw`['"]`;
const EXTERNAL_RECEIVER_PATTERN = new RegExp(
  String.raw`\b(?:this\.)?(${IDENTIFIER_GRAMMAR})\.(${IDENTIFIER_GRAMMAR})\s*\(`,
  'g',
);
const GENERIC_EXTERNAL_CALL_PATTERNS: Array<{ provider: string; pattern: RegExp }> = (() => {
  const id = IDENTIFIER_GRAMMAR;
  return [
    { provider: 'fetch', pattern: new RegExp(String.raw`\bfetch\s*\(`, 'g') },
    { provider: 'http_client', pattern: new RegExp(String.raw`\b(${id})\.(${id})\s*\(`, 'g') },
  ];
})();
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

function identifierTokens(value: string): string[] {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .map((token) => token.toLowerCase())
    .filter(Boolean);
}

function looksLikeExternalReceiverName(receiver: string): boolean {
  const tokens = discoverExternalReceiverTokensFromEvidence();
  const extensions = discoverSourceExtensionsFromObservedTypescript();
  const allTokens = [...tokens, ...extensions];
  return allTokens.some((t) => receiver.toLowerCase().endsWith(t.toLowerCase()));
}

function looksLikeHttpOperation(operation: string): boolean {
  const httpModule = require('node:http');
  const known = (httpModule.METHODS as string[]).map((m) => m.toLowerCase());
  const cat = discoverAllObservedHttpStatusCodes()
    .map((c) => httpModule.STATUS_CODES[c] as string)
    .filter(Boolean)
    .flatMap((s) => s.toLowerCase().split(/\W+/))
    .filter((w) => known.some((k) => w.startsWith(k)));
  return known.some((k) => operation.toLowerCase() === k) || cat.includes(operation.toLowerCase());
}

function looksLikeExternalMutationOperation(operation: string): boolean {
  return /^(send|reply|notify|publish|dispatch|transfer|charge|refund|payout|capture|authorize|confirm|create|update|delete|emit|process|payment|billing|invoice|subscription|upload)$/i.test(
    operation,
  );
}

function isMemberChainTail(sourceText: string, matchIndex: number): boolean {
  return matchIndex > 0 && sourceText[matchIndex - 1] === '.';
}

export type { BehaviorDecoratorRole, BehaviorClassNameRole, GovernedEvidenceMode };
export type { BehaviorNodeArtifact, ParsedFunc, SourceExternalContext, SourceFileTarget };
export {
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
  identifierTokens,
  looksLikeExternalReceiverName,
  looksLikeHttpOperation,
  looksLikeExternalMutationOperation,
  isMemberChainTail,
};
