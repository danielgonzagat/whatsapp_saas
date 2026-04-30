import * as fs from 'fs';
import * as path from 'path';
import ts from 'typescript';

type FindingKind =
  | 'fixed_product_route_collection'
  | 'fixed_source_root_collection'
  | 'fixed_capability_id_collection'
  | 'fixed_flow_id_collection'
  | 'fixed_module_decision_collection'
  | 'fixed_product_catalog_collection'
  | 'fixed_domain_criticality_collection'
  | 'fixed_domain_catalog_collection'
  | 'fixed_provider_catalog_collection'
  | 'fixed_role_catalog_collection'
  | 'hardcoded_break_type_authority_risk'
  | 'hardcoded_break_push_type_risk'
  | 'hardcoded_parser_rule_blocker_risk'
  | 'hardcoded_sql_reality_table_risk'
  | 'hardcoded_gate_profile_threshold_risk'
  | 'hardcoded_decision_enum_risk'
  | 'hardcoded_decision_regex_risk'
  | 'hardcoded_path_decision_risk'
  | 'hardcoded_auditor_bootstrap_reality_risk'
  | 'hardcoded_numeric_decision_literal_risk'
  | 'hardcoded_identity_limit_risk'
  | 'hardcoded_identity_normalization_regex_risk'
  | 'hardcoded_fixed_literal_decision_risk'
  | 'hardcoded_fixed_boolean_decision_risk'
  | 'hardcoded_const_declaration_risk'
  | 'hardcoded_predeclared_authority_context_risk';

type PredicateKind = 'hardcoded_branch_decision_predicate';

export interface NoHardcodedRealityFinding {
  filePath: string;
  line: number;
  column: number;
  kind: FindingKind;
  context: string;
  samples: string[];
}

export interface NoHardcodedRealityPredicate {
  filePath: string;
  line: number;
  column: number;
  kind: PredicateKind;
  context: string;
  samples: string[];
}

export interface NoHardcodedRealityAuditResult {
  scannedFiles: number;
  findings: NoHardcodedRealityFinding[];
  predicates: NoHardcodedRealityPredicate[];
  summary: {
    totalFindings: number;
    byKind: Partial<Record<FindingKind, number>>;
    topFiles: Array<{
      filePath: string;
      findings: number;
    }>;
    totalPredicates: number;
    byPredicateKind: Partial<Record<PredicateKind, number>>;
  };
}

const SOURCE_EXTENSION_KERNEL_GRAMMAR = new Set(['.ts', '.tsx', '.js', '.jsx']);
const ALLOWED_CONTEXT_KERNEL_GRAMMAR_TOKENS = [
  'artifact',
  'class',
  'dod',
  'evidence',
  'extension',
  'filename',
  'grammar',
  'http',
  'method',
  'mime',
  'mode',
  'noise',
  'payload',
  'pattern',
  'patterns',
  'severity',
  'status',
  'token',
  'truth',
  'validator',
];
const ALLOWED_CONTEXT_WITH_STRUCTURAL_KERNEL_GRAMMAR_TOKENS = [
  ...ALLOWED_CONTEXT_KERNEL_GRAMMAR_TOKENS,
  'ast',
  'analysis',
  'enum',
  'gate',
  'gates',
  'grammar',
  'kernel',
  'lifecycle',
  'schema',
  'signal',
  'source',
  'structural',
  'static',
  'syntax',
  'type',
  'tokens',
];
const REALITY_CATALOG_CONTEXT_KERNEL_GRAMMAR_TOKENS = [
  'allowlist',
  'catalog',
  'decision',
  'default',
  'fixed',
  'known',
  'list',
  'map',
  'maps',
  'pack',
  'packs',
  'registry',
  'required',
  'seed',
  'set',
  'supported',
];
const PRODUCT_CONTEXT_KERNEL_GRAMMAR_TOKENS = ['product', 'products', 'surface', 'surfaces'];
const DOMAIN_CONTEXT_KERNEL_GRAMMAR_TOKENS = [
  'domain',
  'domains',
  'module',
  'modules',
  'area',
  'areas',
];
const SOURCE_ROOT_CONTEXT_KERNEL_GRAMMAR_TOKENS = ['source', 'sources'];
const SOURCE_ROOT_COLLECTION_KERNEL_GRAMMAR_TOKENS = [
  'dir',
  'dirs',
  'glob',
  'globs',
  'root',
  'roots',
];
const CRITICALITY_CONTEXT_KERNEL_GRAMMAR_TOKENS = [
  'critical',
  'criticality',
  'musthave',
  'must',
  'runtimecritical',
];
const PROVIDER_CONTEXT_KERNEL_GRAMMAR_TOKENS = [
  'adapter',
  'adapters',
  'integration',
  'integrations',
  'provider',
  'providers',
  'vendor',
  'vendors',
];
const ROLE_CONTEXT_KERNEL_GRAMMAR_TOKENS = [
  'actor',
  'actors',
  'persona',
  'personas',
  'role',
  'roles',
];
const USER_ROLE_CONTEXT_KERNEL_GRAMMAR_TOKENS = ['user', 'users'];
const DECISION_GATE_CONTEXT_KERNEL_GRAMMAR_TOKENS = [
  'gate',
  'gates',
  'profile',
  'profiles',
  'threshold',
  'thresholds',
  'tier',
];
const PATH_DECISION_CONTEXT_KERNEL_GRAMMAR_TOKENS = [
  'path',
  'paths',
  'route',
  'routes',
  'glob',
  'globs',
  'pattern',
  'patterns',
];
const DECISION_AUTHORITY_CONTEXT_KERNEL_GRAMMAR_TOKENS = [
  ...DECISION_GATE_CONTEXT_KERNEL_GRAMMAR_TOKENS,
  ...PATH_DECISION_CONTEXT_KERNEL_GRAMMAR_TOKENS,
  'capability',
  'capabilities',
  'critical',
  'criticality',
  'decision',
  'decisions',
  'domain',
  'domains',
  'flow',
  'flows',
  'module',
  'modules',
  'provider',
  'providers',
  'role',
  'roles',
];
const UNIVERSAL_HARDCODE_CONTEXT_KERNEL_GRAMMAR_TOKENS = [
  ...DECISION_AUTHORITY_CONTEXT_KERNEL_GRAMMAR_TOKENS,
  'actionability',
  'budget',
  'cache',
  'cooldown',
  'confidence',
  'count',
  'event',
  'events',
  'fallback',
  'finding',
  'findings',
  'identity',
  'iteration',
  'iterations',
  'key',
  'keys',
  'latency',
  'lease',
  'length',
  'limit',
  'limits',
  'max',
  'maximum',
  'min',
  'minimum',
  'priority',
  'rank',
  'ratio',
  'recovery',
  'retry',
  'retries',
  'risk',
  'score',
  'sort',
  'timeout',
  'ttl',
  'weight',
  'weights',
  'window',
];
const IDENTITY_CONTEXT_KERNEL_GRAMMAR_TOKENS = [
  'break',
  'event',
  'events',
  'finding',
  'findings',
  'identity',
  'key',
  'keys',
  'name',
  'names',
  'summary',
  'summaries',
];
const LIMIT_CONTEXT_KERNEL_GRAMMAR_TOKENS = [
  'budget',
  'cap',
  'count',
  'length',
  'limit',
  'max',
  'maximum',
  'min',
  'minimum',
  'size',
  'slice',
  'take',
  'top',
  'truncate',
  'window',
];
const SCORE_THRESHOLD_CONTEXT_KERNEL_GRAMMAR_TOKENS = [
  'confidence',
  'latency',
  'priority',
  'rank',
  'ratio',
  'risk',
  'score',
  'severity',
  'threshold',
  'tier',
  'weight',
];
const STRUCTURAL_CONTEXT_KERNEL_GRAMMAR_TOKENS = [
  'ast',
  'class',
  'enum',
  'grammar',
  'http',
  'interface',
  'kernel',
  'schema',
  'severity',
  'source',
  'status',
  'syntax',
  'token',
  'tokens',
  'truth',
  'type',
  'types',
];
const STRUCTURAL_ROLE_KERNEL_GRAMMAR_VALUES = new Set([
  'interface',
  'orchestration',
  'persistence',
  'side_effect',
  'simulation',
]);

const HTTP_METHOD_KERNEL_GRAMMAR = new Set([
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
  'OPTIONS',
]);
const ARTIFACT_FILE_RE = /^PULSE_[A-Z0-9_]+\.json$/;
const SQL_REALITY_TABLE_RE =
  /\b(?:from|join|update|into)\s+(?:"([A-Z][A-Za-z0-9_]*)"|`([A-Z][A-Za-z0-9_]*)`|([A-Z][A-Za-z0-9_]*))/gi;
const identifierTokenCache = new Map<string, Set<string>>();

function isInfrastructureRouteKernelGrammar(value: string): boolean {
  if (value === '/') {
    return true;
  }
  return /^\/(?:health|diag(?:-[a-z0-9]+)?)$/.test(value);
}

function walkSourceFiles(dir: string, excludedDirectoryNames: ReadonlySet<string>): string[] {
  if (!fs.existsSync(dir)) {
    return [];
  }

  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (excludedDirectoryNames.has(entry.name) || isAuxiliaryConventionDirectory(entry.name)) {
        continue;
      }
      files.push(...walkSourceFiles(fullPath, excludedDirectoryNames));
      continue;
    }

    if (entry.isFile() && SOURCE_EXTENSION_KERNEL_GRAMMAR.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }
  return files;
}

function isAuxiliaryConventionDirectory(name: string): boolean {
  return name.length > 4 && name.startsWith('__') && name.endsWith('__');
}

function pulseCompilerExcludedDirectoryNames(pulseDir: string): Set<string> {
  const excluded = new Set<string>();
  const configPath = path.join(pulseDir, 'tsconfig.json');
  if (!fs.existsSync(configPath)) {
    return excluded;
  }
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8')) as {
    compilerOptions?: { outDir?: unknown };
    exclude?: unknown;
  };
  addCompilerDirectoryName(excluded, config.compilerOptions?.outDir);
  if (Array.isArray(config.exclude)) {
    for (const entry of config.exclude) {
      addCompilerDirectoryName(excluded, entry);
    }
  }
  return excluded;
}

function addCompilerDirectoryName(target: Set<string>, value: unknown): void {
  if (typeof value !== 'string') {
    return;
  }
  const normalized = value.split('\\').join('/');
  const segments = normalized.split('/').filter((segment) => segment && segment !== '.');
  const [firstSegment] = segments;
  if (firstSegment) {
    target.add(firstSegment);
  }
}

function propertyNameText(name: ts.PropertyName | ts.BindingName | undefined): string {
  if (!name) {
    return 'anonymous';
  }
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  if (ts.isComputedPropertyName(name)) {
    return name.getText();
  }
  return 'anonymous';
}

function nearestCollectionContext(node: ts.Node): string {
  let current: ts.Node | undefined = node;
  while (current) {
    if (ts.isVariableDeclaration(current)) {
      return propertyNameText(current.name);
    }
    if (ts.isPropertyAssignment(current)) {
      return propertyNameText(current.name);
    }
    if (ts.isParameter(current)) {
      return propertyNameText(current.name);
    }
    current = current.parent;
  }
  return 'anonymous';
}

function nearestExecutableContext(node: ts.Node): string {
  let current: ts.Node | undefined = node;
  while (current) {
    if (ts.isFunctionDeclaration(current) || ts.isFunctionExpression(current)) {
      return propertyNameText(current.name);
    }
    if (ts.isMethodDeclaration(current)) {
      return propertyNameText(current.name);
    }
    if (ts.isArrowFunction(current) && ts.isVariableDeclaration(current.parent)) {
      return propertyNameText(current.parent.name);
    }
    if (ts.isVariableDeclaration(current)) {
      return propertyNameText(current.name);
    }
    if (ts.isPropertyAssignment(current)) {
      return propertyNameText(current.name);
    }
    current = current.parent;
  }
  return nearestCollectionContext(node);
}

function contextHasAllowedGrammar(context: string): boolean {
  const normalized = context.toLowerCase();
  return ALLOWED_CONTEXT_KERNEL_GRAMMAR_TOKENS.some((token) => normalized.includes(token));
}

function splitIdentifierTokens(value: string): Set<string> {
  const cached = identifierTokenCache.get(value);
  if (cached) {
    return cached;
  }
  const spaced = value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .toLowerCase();
  const tokens = new Set(spaced.split(/\s+/).filter(Boolean));
  identifierTokenCache.set(value, tokens);
  return tokens;
}

function contextHasToken(context: string, tokens: readonly string[]): boolean {
  const contextTokens = splitIdentifierTokens(context);
  return tokens.some((token) => contextTokens.has(token));
}

function contextHasAllowedRealityGrammar(context: string): boolean {
  return contextHasToken(context, ALLOWED_CONTEXT_WITH_STRUCTURAL_KERNEL_GRAMMAR_TOKENS);
}

function contextLooksLikeRealityCatalog(
  context: string,
  realityTokens: readonly string[],
  options: { requireCatalogToken?: boolean } = {},
): boolean {
  if (!contextHasToken(context, realityTokens)) {
    return false;
  }
  if (contextHasAllowedRealityGrammar(context)) {
    return false;
  }
  return (
    !options.requireCatalogToken ||
    contextHasToken(context, REALITY_CATALOG_CONTEXT_KERNEL_GRAMMAR_TOKENS)
  );
}

function isAllowedLiteral(value: string): boolean {
  return (
    HTTP_METHOD_KERNEL_GRAMMAR.has(value) ||
    ARTIFACT_FILE_RE.test(value) ||
    value.endsWith('.json') ||
    value.endsWith('.md') ||
    value.endsWith('.ts') ||
    value.endsWith('.tsx') ||
    value.endsWith('.js') ||
    value.endsWith('.jsx')
  );
}

function isRouteLiteral(value: string): boolean {
  return value.startsWith('/') && !isInfrastructureRouteKernelGrammar(value);
}

function looksLikeFixedId(value: string): boolean {
  return /^[a-z][a-z0-9]+(?:[-_:][a-z0-9]+)+$/.test(value) && !isAllowedLiteral(value);
}

function looksLikeRealityLabel(value: string): boolean {
  const startsWithLower = /^[a-z]/.test(value);
  const restIsAlphaNumeric = /^[a-z][A-Za-z0-9]*$/.test(value);
  const hasUppercase = /[A-Z]/.test(value);
  return (
    looksLikeFixedId(value) ||
    (startsWithLower && restIsAlphaNumeric && hasUppercase) ||
    /^[A-Z][A-Za-z0-9 ]{2,}$/.test(value) ||
    /^[a-z][a-z0-9]{2,}$/.test(value)
  );
}

function realityLabelFindings(values: string[]): string[] {
  return values.filter((value) => looksLikeRealityLabel(value));
}

function extractStringLiterals(node: ts.Node): string[] {
  const values: string[] = [];
  const visit = (child: ts.Node): void => {
    if (ts.isStringLiteral(child) || ts.isNoSubstitutionTemplateLiteral(child)) {
      values.push(child.text);
      return;
    }
    ts.forEachChild(child, visit);
  };
  ts.forEachChild(node, visit);
  return values;
}

function extractLiteralSamples(node: ts.Node): string[] {
  const values: string[] = [];
  const visit = (child: ts.Node): void => {
    if (ts.isStringLiteral(child) || ts.isNoSubstitutionTemplateLiteral(child)) {
      values.push(child.text);
      return;
    }
    if (ts.isNumericLiteral(child)) {
      values.push(child.text);
      return;
    }
    if (child.kind === ts.SyntaxKind.TrueKeyword || child.kind === ts.SyntaxKind.FalseKeyword) {
      values.push(child.getText());
      return;
    }
    ts.forEachChild(child, visit);
  };
  ts.forEachChild(node, visit);
  return values;
}

function isDecisionCollection(node: ts.Node): boolean {
  if (ts.isArrayLiteralExpression(node) || ts.isObjectLiteralExpression(node)) {
    return true;
  }
  return (
    ts.isNewExpression(node) &&
    ts.isIdentifier(node.expression) &&
    (node.expression.text === 'Set' || node.expression.text === 'Map')
  );
}

function routeFindings(context: string, values: string[]): string[] {
  const normalized = context.toLowerCase();
  if (!normalized.includes('route') || contextHasAllowedGrammar(context)) {
    return [];
  }
  return values.filter((value) => isRouteLiteral(value));
}

function isSourceRootLiteral(value: string): boolean {
  const normalized = value.replace(/\\/g, '/');
  return (
    /^[A-Za-z0-9_.@/-]+\/src(?:\/|$)/.test(normalized) ||
    /^[A-Za-z0-9_.@/-]+\/(?:app|pages|lib)(?:\/|$)/.test(normalized) ||
    /^[A-Za-z0-9_.@/-]+\/\*\*/.test(normalized)
  );
}

function sourceRootFindings(context: string, values: string[]): string[] {
  if (context === 'LEGACY_SOURCE_ROOTS') {
    return [];
  }
  if (
    !contextHasToken(context, SOURCE_ROOT_CONTEXT_KERNEL_GRAMMAR_TOKENS) ||
    !contextHasToken(context, SOURCE_ROOT_COLLECTION_KERNEL_GRAMMAR_TOKENS)
  ) {
    return [];
  }
  return values.filter((value) => isSourceRootLiteral(value));
}

function capabilityFindings(context: string, values: string[]): string[] {
  const normalized = context.toLowerCase();
  const isCapabilityIdDecision =
    normalized.includes('capabilityid') || normalized.includes('affectedcapabilities');
  if (!isCapabilityIdDecision || contextHasAllowedGrammar(context)) {
    return [];
  }
  return values.filter((value) => looksLikeFixedId(value));
}

function flowFindings(context: string, values: string[]): string[] {
  const normalized = context.toLowerCase();
  const isFlowIdDecision = normalized.includes('flowid') || normalized.includes('affectedflows');
  if (!isFlowIdDecision || contextHasAllowedGrammar(context)) {
    return [];
  }
  return values.filter((value) => looksLikeFixedId(value));
}

function moduleFindings(context: string, values: string[]): string[] {
  const normalized = context.toLowerCase();
  if (
    !normalized.includes('module') ||
    !normalized.includes('decision') ||
    contextHasAllowedGrammar(context)
  ) {
    return [];
  }
  return values.filter((value) => /^[A-Z][A-Za-z0-9 ]{2,}$/.test(value));
}

function productCatalogFindings(context: string, values: string[]): string[] {
  if (
    !contextLooksLikeRealityCatalog(context, PRODUCT_CONTEXT_KERNEL_GRAMMAR_TOKENS, {
      requireCatalogToken: true,
    })
  ) {
    return [];
  }
  return realityLabelFindings(values);
}

function domainCatalogFindings(context: string, values: string[]): string[] {
  if (
    !contextLooksLikeRealityCatalog(context, DOMAIN_CONTEXT_KERNEL_GRAMMAR_TOKENS, {
      requireCatalogToken: true,
    })
  ) {
    return [];
  }
  return realityLabelFindings(values);
}

function domainCriticalityFindings(context: string, values: string[]): string[] {
  if (
    !contextHasToken(context, DOMAIN_CONTEXT_KERNEL_GRAMMAR_TOKENS) ||
    !contextHasToken(context, CRITICALITY_CONTEXT_KERNEL_GRAMMAR_TOKENS) ||
    contextHasAllowedRealityGrammar(context)
  ) {
    return [];
  }
  return realityLabelFindings(values);
}

function providerCatalogFindings(context: string, values: string[]): string[] {
  if (
    !contextLooksLikeRealityCatalog(context, PROVIDER_CONTEXT_KERNEL_GRAMMAR_TOKENS, {
      requireCatalogToken: true,
    })
  ) {
    return [];
  }
  const findings = realityLabelFindings(values);
  return findings.length >= 2 ? findings : [];
}

function roleCatalogFindings(context: string, values: string[]): string[] {
  const hasCatalogRoleContext = contextLooksLikeRealityCatalog(
    context,
    ROLE_CONTEXT_KERNEL_GRAMMAR_TOKENS,
    {
      requireCatalogToken: true,
    },
  );
  const hasUserRoleContext =
    contextHasToken(context, ROLE_CONTEXT_KERNEL_GRAMMAR_TOKENS) &&
    contextHasToken(context, USER_ROLE_CONTEXT_KERNEL_GRAMMAR_TOKENS) &&
    !contextHasAllowedRealityGrammar(context);
  if (!hasCatalogRoleContext && !hasUserRoleContext) {
    return [];
  }
  return realityLabelFindings(values).filter(
    (value) => !STRUCTURAL_ROLE_KERNEL_GRAMMAR_VALUES.has(value),
  );
}

function gateProfileThresholdFindings(context: string, values: string[]): string[] {
  if (
    contextHasToken(context, ['kernel', 'grammar']) ||
    !contextHasToken(context, DECISION_GATE_CONTEXT_KERNEL_GRAMMAR_TOKENS)
  ) {
    return [];
  }
  return values.filter((value) => value.length > 0);
}

function pathDecisionFindings(context: string, values: string[]): string[] {
  if (
    contextHasToken(context, ['kernel', 'grammar']) ||
    !contextHasToken(context, ['path', 'paths', 'glob', 'globs'])
  ) {
    return [];
  }
  return values.filter(
    (value) => isRouteLiteral(value) || isSourceRootLiteral(value) || value.includes('*'),
  );
}

function auditorBootstrapRealityFindings(
  relPath: string,
  context: string,
  values: string[],
): string[] {
  if (!relPath.replace(/\\/g, '/').endsWith('scripts/pulse/no-hardcoded-reality-audit.ts')) {
    return [];
  }

  const contextTokens = splitIdentifierTokens(context);
  if (contextHasToken(context, ['kernel', 'grammar'])) {
    return [];
  }

  const AUDITOR_BOOTSTRAP_KERNEL_GRAMMAR_TOKENS = [
    'allowed',
    'allowlist',
    'criticality',
    'decision',
    'gate',
    'grammar',
    'infrastructure',
    'path',
    'reality',
    'role',
    'route',
    'skipped',
    'source',
    'token',
    'tokens',
  ];
  const isBootstrapDecisionSurface = AUDITOR_BOOTSTRAP_KERNEL_GRAMMAR_TOKENS.some((token) =>
    contextTokens.has(token),
  );
  if (!isBootstrapDecisionSurface) {
    return [];
  }

  return values.filter((value) => value.trim().length > 0);
}

function contextLooksLikeDecisionAuthority(context: string): boolean {
  return (
    contextHasToken(context, DECISION_AUTHORITY_CONTEXT_KERNEL_GRAMMAR_TOKENS) &&
    !contextHasToken(context, STRUCTURAL_CONTEXT_KERNEL_GRAMMAR_TOKENS)
  );
}

function enumDecisionFindings(node: ts.Node): string[] {
  if (!ts.isEnumDeclaration(node) || !contextLooksLikeDecisionAuthority(node.name.text)) {
    return [];
  }
  const values = node.members.flatMap((member) => {
    if (member.initializer) {
      const value = stringLiteralValue(member.initializer);
      return value ? [value] : [];
    }
    return [propertyNameText(member.name)];
  });
  return values.length >= 2 ? values : [];
}

function regexDecisionFindings(node: ts.Node): string[] {
  if (!ts.isRegularExpressionLiteral(node)) {
    return [];
  }
  const context = nearestCollectionContext(node);
  if (!contextLooksLikeDecisionAuthority(context)) {
    return [];
  }
  const text = node.text;
  const hasAlternation = text.includes('|');
  const hasPathShape = /\/[A-Za-z0-9_*:.-]+/.test(text);
  const hasNumericComparatorShape = /\\d|\[[0-9]|[<>]=?/.test(text);
  return hasAlternation || hasPathShape || hasNumericComparatorShape ? [text] : [];
}

function literalPredicateValue(node: ts.Node): string | null {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  if (ts.isNumericLiteral(node)) {
    return node.text;
  }
  if (node.kind === ts.SyntaxKind.TrueKeyword || node.kind === ts.SyntaxKind.FalseKeyword) {
    return node.getText();
  }
  return null;
}

function binaryPredicateSamples(node: ts.Node): string[] {
  if (!ts.isBinaryExpression(node)) {
    return [];
  }
  const operator = node.operatorToken.kind;
  const isDecisionOperator =
    operator === ts.SyntaxKind.EqualsEqualsEqualsToken ||
    operator === ts.SyntaxKind.EqualsEqualsToken ||
    operator === ts.SyntaxKind.ExclamationEqualsEqualsToken ||
    operator === ts.SyntaxKind.ExclamationEqualsToken ||
    operator === ts.SyntaxKind.GreaterThanToken ||
    operator === ts.SyntaxKind.GreaterThanEqualsToken ||
    operator === ts.SyntaxKind.LessThanToken ||
    operator === ts.SyntaxKind.LessThanEqualsToken;
  if (!isDecisionOperator) {
    return [];
  }

  const leftLiteral = literalPredicateValue(node.left);
  const rightLiteral = literalPredicateValue(node.right);
  const literal = leftLiteral ?? rightLiteral;
  return literal === null ? [] : [node.getText()];
}

function collectConditionPredicateSamples(node: ts.Node): string[] {
  const samples: string[] = [];
  const visit = (child: ts.Node): void => {
    samples.push(...binaryPredicateSamples(child));
    ts.forEachChild(child, visit);
  };
  visit(node);
  return samples;
}

function branchDecisionPredicateFindings(node: ts.Node): string[] {
  const context = nearestExecutableContext(node);
  if (!contextLooksLikeDecisionAuthority(context)) {
    return [];
  }

  if (ts.isSwitchStatement(node)) {
    return node.caseBlock.clauses.flatMap((clause) => {
      if (!ts.isCaseClause(clause)) {
        return [];
      }
      const value = literalPredicateValue(clause.expression);
      return value === null ? [] : [`case ${clause.expression.getText()}`];
    });
  }

  if (ts.isIfStatement(node)) {
    return collectConditionPredicateSamples(node.expression);
  }

  return [];
}

function contextLooksLikeUniversalHardcode(context: string): boolean {
  return (
    contextHasToken(context, UNIVERSAL_HARDCODE_CONTEXT_KERNEL_GRAMMAR_TOKENS) &&
    !contextHasToken(context, ['kernel', 'grammar', 'syntax', 'ast'])
  );
}

function contextLooksLikeIdentity(context: string): boolean {
  return contextHasToken(context, IDENTITY_CONTEXT_KERNEL_GRAMMAR_TOKENS);
}

function numericTextFromNode(node: ts.Node): string | null {
  if (ts.isNumericLiteral(node)) {
    return node.text;
  }
  if (
    ts.isPrefixUnaryExpression(node) &&
    node.operator === ts.SyntaxKind.MinusToken &&
    ts.isNumericLiteral(node.operand)
  ) {
    return `-${node.operand.text}`;
  }
  return null;
}

function isCollectionIndexGrammar(node: ts.Node): boolean {
  if (!ts.isNumericLiteral(node) || node.text !== '0') {
    return false;
  }
  const parent = node.parent;
  if (ts.isElementAccessExpression(parent) && parent.argumentExpression === node) {
    return true;
  }
  return (
    ts.isCallExpression(parent) &&
    ts.isPropertyAccessExpression(parent.expression) &&
    (parent.expression.name.text === 'slice' || parent.expression.name.text === 'substring') &&
    parent.arguments[0] === node
  );
}

function numericDecisionLiteralFindings(node: ts.Node): string[] {
  const numeric = numericTextFromNode(node);
  if (!numeric || isCollectionIndexGrammar(node)) {
    return [];
  }

  const collectionContext = nearestCollectionContext(node);
  const executableContext = nearestExecutableContext(node);
  const parent = node.parent;
  const isNamedLimit =
    contextHasToken(collectionContext, LIMIT_CONTEXT_KERNEL_GRAMMAR_TOKENS) ||
    contextHasToken(collectionContext, SCORE_THRESHOLD_CONTEXT_KERNEL_GRAMMAR_TOKENS);
  const isDecisionPredicate =
    ts.isBinaryExpression(parent) &&
    contextLooksLikeUniversalHardcode(executableContext) &&
    (contextHasToken(executableContext, LIMIT_CONTEXT_KERNEL_GRAMMAR_TOKENS) ||
      contextHasToken(executableContext, SCORE_THRESHOLD_CONTEXT_KERNEL_GRAMMAR_TOKENS) ||
      contextHasToken(executableContext, DECISION_GATE_CONTEXT_KERNEL_GRAMMAR_TOKENS));

  if (!isNamedLimit && !isDecisionPredicate) {
    return [];
  }
  return [parent && ts.isBinaryExpression(parent) ? parent.getText() : numeric];
}

function identityLimitFindings(node: ts.Node, relPath: string): string[] {
  const numeric = numericTextFromNode(node);
  if (!numeric || isCollectionIndexGrammar(node)) {
    return [];
  }
  const pathLooksIdentity = relPath
    .split(path.sep)
    .join('/')
    .endsWith('scripts/pulse/finding-identity.ts');
  const collectionContext = nearestCollectionContext(node);
  const executableContext = nearestExecutableContext(node);
  const hasIdentityContext =
    pathLooksIdentity ||
    contextLooksLikeIdentity(collectionContext) ||
    contextLooksLikeIdentity(executableContext);
  const hasLimitContext =
    contextHasToken(collectionContext, LIMIT_CONTEXT_KERNEL_GRAMMAR_TOKENS) ||
    contextHasToken(executableContext, LIMIT_CONTEXT_KERNEL_GRAMMAR_TOKENS);
  return hasIdentityContext && hasLimitContext ? [numeric] : [];
}

function identityNormalizationRegexFindings(node: ts.Node, relPath: string): string[] {
  if (!ts.isRegularExpressionLiteral(node)) {
    return [];
  }
  const normalizedRelPath = relPath.split(path.sep).join('/');
  const collectionContext = nearestCollectionContext(node);
  const executableContext = nearestExecutableContext(node);
  const pathLooksIdentity = normalizedRelPath.endsWith('scripts/pulse/finding-identity.ts');
  const contextLooksNormalizer =
    contextHasToken(collectionContext, ['normalize', 'normalizer', 'strip', 'compact']) ||
    contextHasToken(executableContext, ['normalize', 'normalizer', 'strip', 'compact']);
  if (
    !pathLooksIdentity &&
    !(contextLooksLikeIdentity(collectionContext) || contextLooksLikeIdentity(executableContext))
  ) {
    return [];
  }
  return contextLooksNormalizer || pathLooksIdentity ? [node.text] : [];
}

function fixedLiteralDecisionFindings(node: ts.Node): string[] {
  const literal = literalPredicateValue(node);
  if (literal === null || literal.trim().length === 0) {
    return [];
  }
  const context = nearestExecutableContext(node);
  if (!contextLooksLikeUniversalHardcode(context)) {
    return [];
  }
  if (
    ts.isCaseClause(node.parent) ||
    (ts.isBinaryExpression(node.parent) && literalPredicateValue(node.parent.left) !== null) ||
    (ts.isBinaryExpression(node.parent) && literalPredicateValue(node.parent.right) !== null)
  ) {
    return [node.parent.getText()];
  }
  return [];
}

function fixedBooleanDecisionFindings(node: ts.Node): string[] {
  if (node.kind !== ts.SyntaxKind.TrueKeyword && node.kind !== ts.SyntaxKind.FalseKeyword) {
    return [];
  }
  const collectionContext = nearestCollectionContext(node);
  const executableContext = nearestExecutableContext(node);
  if (
    !contextLooksLikeUniversalHardcode(collectionContext) &&
    !contextLooksLikeUniversalHardcode(executableContext)
  ) {
    return [];
  }
  return [node.getText()];
}

function stringLiteralValue(node: ts.Node): string | null {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  return null;
}

function breakTypeAuthorityFindings(node: ts.Node): string[] {
  if (!ts.isTypeAliasDeclaration(node) || node.name.text !== 'BreakType') {
    return [];
  }
  const samples: string[] = [];
  const visit = (child: ts.Node): void => {
    if (ts.isLiteralTypeNode(child)) {
      const value = stringLiteralValue(child.literal);
      if (value) {
        samples.push(value);
      }
    }
    ts.forEachChild(child, visit);
  };
  visit(node.type);
  return samples;
}

function breakPushTypeFindings(node: ts.Node): string[] {
  if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) {
    return [];
  }
  if (node.expression.name.text !== 'push' || node.expression.expression.getText() !== 'breaks') {
    return [];
  }
  const [firstArg] = node.arguments;
  if (!firstArg || !ts.isObjectLiteralExpression(firstArg)) {
    return [];
  }
  const typeProperty = firstArg.properties.find(
    (property): property is ts.PropertyAssignment =>
      ts.isPropertyAssignment(property) && propertyNameText(property.name) === 'type',
  );
  if (!typeProperty) {
    return [];
  }
  const value = stringLiteralValue(typeProperty.initializer);
  return value ? [value] : [];
}

function parserRuleBlockerFindings(
  node: ts.Node,
  relPath: string,
  sourceHasBreakPush: boolean,
): string[] {
  if (!sourceHasBreakPush || !relPath.replace(/\\/g, '/').includes('scripts/pulse/parsers/')) {
    return [];
  }
  if (!ts.isVariableDeclaration(node) || !ts.isIdentifier(node.name)) {
    return [];
  }
  const name = node.name.text;
  if (!/^ALLOWED_[A-Z0-9_]+$/.test(name) && !/^[A-Z0-9_]+_RE$/.test(name)) {
    return [];
  }
  return [name];
}

function constDeclarationFindings(node: ts.Node, sourceHasDirectBreakPushType: boolean): string[] {
  if (!ts.isVariableStatement(node)) {
    return [];
  }
  if ((node.declarationList.flags & ts.NodeFlags.Const) === 0) {
    return [];
  }
  if (!ts.isSourceFile(node.parent) && !sourceHasDirectBreakPushType) {
    return [];
  }
  return node.declarationList.declarations
    .map((declaration) => propertyNameText(declaration.name))
    .filter((name) => ts.isSourceFile(node.parent) || name === 'breaks');
}

function predeclaredAuthorityContextFindings(node: ts.Node): string[] {
  if (!ts.isIdentifier(node)) {
    return [];
  }
  return isPredeclaredAuthorityContextNode(node) ? [node.text] : [];
}

function isPredeclaredAuthorityContextNode(node: ts.Identifier): boolean {
  const parent = node.parent;
  if (
    ts.isImportClause(parent) ||
    ts.isImportSpecifier(parent) ||
    ts.isImportDeclaration(parent) ||
    ts.isTypeAliasDeclaration(parent) ||
    ts.isInterfaceDeclaration(parent) ||
    ts.isPropertyAccessExpression(parent)
  ) {
    return false;
  }

  if (ts.isVariableDeclaration(parent) && parent.name === node) {
    const declarationList = parent.parent;
    const statement = declarationList.parent;
    if (ts.isVariableStatement(statement) && ts.isSourceFile(statement.parent)) {
      return false;
    }
    return (
      parent.initializer !== undefined &&
      hasPredeclaredAuthorityInitializer(parent.initializer) &&
      contextLooksLikePredeclaredAuthority(node.text)
    );
  }

  if (ts.isPropertyAssignment(parent) && parent.name === node) {
    return (
      hasPredeclaredAuthorityInitializer(parent.initializer) &&
      contextLooksLikePredeclaredAuthority(node.text)
    );
  }

  return false;
}

function hasPredeclaredAuthorityInitializer(node: ts.Expression): boolean {
  if (
    ts.isStringLiteral(node) ||
    ts.isNoSubstitutionTemplateLiteral(node) ||
    ts.isNumericLiteral(node) ||
    node.kind === ts.SyntaxKind.TrueKeyword ||
    node.kind === ts.SyntaxKind.FalseKeyword ||
    ts.isRegularExpressionLiteral(node)
  ) {
    return true;
  }
  if (ts.isArrayLiteralExpression(node)) {
    return node.elements.some(
      (element) =>
        ts.isStringLiteral(element) ||
        ts.isNoSubstitutionTemplateLiteral(element) ||
        ts.isNumericLiteral(element) ||
        element.kind === ts.SyntaxKind.TrueKeyword ||
        element.kind === ts.SyntaxKind.FalseKeyword,
    );
  }
  if (ts.isObjectLiteralExpression(node)) {
    return node.properties.some((property) => {
      if (!ts.isPropertyAssignment(property)) {
        return false;
      }
      return hasPredeclaredAuthorityInitializer(property.initializer);
    });
  }
  return false;
}

function contextLooksLikePredeclaredAuthority(context: string): boolean {
  return (
    contextLooksLikeUniversalHardcode(context) ||
    contextLooksLikeDecisionAuthority(context) ||
    contextHasToken(context, REALITY_CATALOG_CONTEXT_KERNEL_GRAMMAR_TOKENS)
  );
}

function sqlRealityTableFindings(node: ts.Node): string[] {
  const value = stringLiteralValue(node);
  if (!value || !/\b(?:select|insert|update|delete)\b/i.test(value)) {
    return [];
  }
  const samples: string[] = [];
  SQL_REALITY_TABLE_RE.lastIndex = 0;
  let match = SQL_REALITY_TABLE_RE.exec(value);
  while (match) {
    const tableName = match[1] || match[2] || match[3];
    if (tableName && tableName !== 'information_schema' && tableName !== '_prisma_migrations') {
      samples.push(tableName);
    }
    match = SQL_REALITY_TABLE_RE.exec(value);
  }
  return samples;
}

function pushFinding(
  findings: NoHardcodedRealityFinding[],
  sourceFile: ts.SourceFile,
  relPath: string,
  node: ts.Node,
  kind: FindingKind,
  context: string,
  samples: string[],
): void {
  const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  findings.push({
    filePath: relPath,
    line: position.line + 1,
    column: position.character + 1,
    kind,
    context,
    samples: [...new Set(samples)].slice(0, 5),
  });
}

function pushPredicate(
  predicates: NoHardcodedRealityPredicate[],
  sourceFile: ts.SourceFile,
  relPath: string,
  node: ts.Node,
  kind: PredicateKind,
  context: string,
  samples: string[],
): void {
  const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  predicates.push({
    filePath: relPath,
    line: position.line + 1,
    column: position.character + 1,
    kind,
    context,
    samples: [...new Set(samples)].slice(0, 5),
  });
}

function auditSourceFile(
  filePath: string,
  relPath: string,
): {
  findings: NoHardcodedRealityFinding[];
  predicates: NoHardcodedRealityPredicate[];
} {
  const source = fs.readFileSync(filePath, 'utf8');
  if (!sourceMayContainHardcodedRealitySignal(source)) {
    return { findings: [], predicates: [] };
  }
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true);
  const findings: NoHardcodedRealityFinding[] = [];
  const predicates: NoHardcodedRealityPredicate[] = [];
  const predeclaredAuthorityKeys = new Set<string>();
  const sourceHasBreakPush = source.includes('breaks.push');
  const sourceHasDirectBreakPushType = /breaks\.push\s*\(\s*\{[\s\S]{0,300}\btype\s*:/.test(source);

  const visit = (node: ts.Node): void => {
    const predeclaredAuthorityContexts = predeclaredAuthorityContextFindings(node);
    if (predeclaredAuthorityContexts.length > 0) {
      const context = nearestExecutableContext(node);
      const freshContexts = predeclaredAuthorityContexts.filter((sample) => {
        const key = `${context}:${sample}`;
        if (predeclaredAuthorityKeys.has(key)) {
          return false;
        }
        predeclaredAuthorityKeys.add(key);
        return true;
      });
      if (freshContexts.length > 0) {
        pushFinding(
          findings,
          sourceFile,
          relPath,
          node,
          'hardcoded_predeclared_authority_context_risk',
          context,
          freshContexts,
        );
      }
    }

    const constDeclarations = constDeclarationFindings(node, sourceHasDirectBreakPushType);
    if (constDeclarations.length > 0) {
      pushFinding(
        findings,
        sourceFile,
        relPath,
        node,
        'hardcoded_const_declaration_risk',
        'const.declaration',
        constDeclarations,
      );
    }

    const breakTypeAuthority = breakTypeAuthorityFindings(node);
    if (breakTypeAuthority.length > 0) {
      pushFinding(
        findings,
        sourceFile,
        relPath,
        node,
        'hardcoded_break_type_authority_risk',
        'BreakType',
        breakTypeAuthority,
      );
    }

    const pushedBreakTypes = breakPushTypeFindings(node);
    if (pushedBreakTypes.length > 0) {
      pushFinding(
        findings,
        sourceFile,
        relPath,
        node,
        'hardcoded_break_push_type_risk',
        'breaks.push.type',
        pushedBreakTypes,
      );
    }

    const parserRules = parserRuleBlockerFindings(node, relPath, sourceHasBreakPush);
    if (parserRules.length > 0) {
      pushFinding(
        findings,
        sourceFile,
        relPath,
        node,
        'hardcoded_parser_rule_blocker_risk',
        nearestCollectionContext(node),
        parserRules,
      );
    }

    const sqlTables = sqlRealityTableFindings(node);
    if (sqlTables.length > 0) {
      pushFinding(
        findings,
        sourceFile,
        relPath,
        node,
        'hardcoded_sql_reality_table_risk',
        'sql.reality_table',
        sqlTables,
      );
    }

    const enumDecisions = enumDecisionFindings(node);
    if (enumDecisions.length > 0) {
      const enumContext = ts.isEnumDeclaration(node) ? node.name.text : 'enum.decision';
      pushFinding(
        findings,
        sourceFile,
        relPath,
        node,
        'hardcoded_decision_enum_risk',
        enumContext,
        enumDecisions,
      );
    }

    const regexDecisions = regexDecisionFindings(node);
    if (regexDecisions.length > 0) {
      pushFinding(
        findings,
        sourceFile,
        relPath,
        node,
        'hardcoded_decision_regex_risk',
        nearestCollectionContext(node),
        regexDecisions,
      );
    }

    const identityRegex = identityNormalizationRegexFindings(node, relPath);
    if (identityRegex.length > 0) {
      pushFinding(
        findings,
        sourceFile,
        relPath,
        node,
        'hardcoded_identity_normalization_regex_risk',
        nearestExecutableContext(node),
        identityRegex,
      );
    }

    const numericDecisions = numericDecisionLiteralFindings(node);
    if (numericDecisions.length > 0) {
      pushFinding(
        findings,
        sourceFile,
        relPath,
        node,
        'hardcoded_numeric_decision_literal_risk',
        nearestExecutableContext(node),
        numericDecisions,
      );
    }

    const identityLimits = identityLimitFindings(node, relPath);
    if (identityLimits.length > 0) {
      pushFinding(
        findings,
        sourceFile,
        relPath,
        node,
        'hardcoded_identity_limit_risk',
        nearestExecutableContext(node),
        identityLimits,
      );
    }

    const fixedLiteralDecisions = fixedLiteralDecisionFindings(node);
    if (fixedLiteralDecisions.length > 0) {
      pushFinding(
        findings,
        sourceFile,
        relPath,
        node,
        'hardcoded_fixed_literal_decision_risk',
        nearestExecutableContext(node),
        fixedLiteralDecisions,
      );
    }

    const fixedBooleanDecisions = fixedBooleanDecisionFindings(node);
    if (fixedBooleanDecisions.length > 0) {
      pushFinding(
        findings,
        sourceFile,
        relPath,
        node,
        'hardcoded_fixed_boolean_decision_risk',
        nearestExecutableContext(node),
        fixedBooleanDecisions,
      );
    }

    const branchDecisionPredicates = branchDecisionPredicateFindings(node);
    if (branchDecisionPredicates.length > 0) {
      pushPredicate(
        predicates,
        sourceFile,
        relPath,
        node,
        'hardcoded_branch_decision_predicate',
        nearestExecutableContext(node),
        branchDecisionPredicates,
      );
    }

    if (!isDecisionCollection(node)) {
      ts.forEachChild(node, visit);
      return;
    }

    const context = nearestCollectionContext(node);
    const rawValues = extractStringLiterals(node);
    const values = rawValues.filter((value) => !isAllowedLiteral(value));
    const literalSamples = extractLiteralSamples(node);
    const routes = routeFindings(context, values);
    const sourceRoots = sourceRootFindings(context, rawValues);
    const capabilities = capabilityFindings(context, values);
    const flows = flowFindings(context, values);
    const modules = moduleFindings(context, values);
    const products = productCatalogFindings(context, values);
    const criticalDomains = domainCriticalityFindings(context, values);
    const domains = domainCatalogFindings(context, values);
    const providers = providerCatalogFindings(context, values);
    const roles = roleCatalogFindings(context, values);
    const gateProfileThresholds = gateProfileThresholdFindings(context, literalSamples);
    const pathDecisions = pathDecisionFindings(context, rawValues);
    const auditorBootstrapReality = auditorBootstrapRealityFindings(relPath, context, rawValues);

    if (routes.length > 0) {
      pushFinding(
        findings,
        sourceFile,
        relPath,
        node,
        'fixed_product_route_collection',
        context,
        routes,
      );
    }
    if (sourceRoots.length > 0) {
      pushFinding(
        findings,
        sourceFile,
        relPath,
        node,
        'fixed_source_root_collection',
        context,
        sourceRoots,
      );
    }
    if (capabilities.length > 0) {
      pushFinding(
        findings,
        sourceFile,
        relPath,
        node,
        'fixed_capability_id_collection',
        context,
        capabilities,
      );
    }
    if (flows.length > 0) {
      pushFinding(findings, sourceFile, relPath, node, 'fixed_flow_id_collection', context, flows);
    }
    if (modules.length > 0) {
      pushFinding(
        findings,
        sourceFile,
        relPath,
        node,
        'fixed_module_decision_collection',
        context,
        modules,
      );
    }
    if (products.length > 0) {
      pushFinding(
        findings,
        sourceFile,
        relPath,
        node,
        'fixed_product_catalog_collection',
        context,
        products,
      );
    }
    if (criticalDomains.length > 0) {
      pushFinding(
        findings,
        sourceFile,
        relPath,
        node,
        'fixed_domain_criticality_collection',
        context,
        criticalDomains,
      );
    }
    if (domains.length > 0) {
      pushFinding(
        findings,
        sourceFile,
        relPath,
        node,
        'fixed_domain_catalog_collection',
        context,
        domains,
      );
    }
    if (providers.length > 0) {
      pushFinding(
        findings,
        sourceFile,
        relPath,
        node,
        'fixed_provider_catalog_collection',
        context,
        providers,
      );
    }
    if (roles.length > 0) {
      pushFinding(
        findings,
        sourceFile,
        relPath,
        node,
        'fixed_role_catalog_collection',
        context,
        roles,
      );
    }
    if (gateProfileThresholds.length > 0) {
      pushFinding(
        findings,
        sourceFile,
        relPath,
        node,
        'hardcoded_gate_profile_threshold_risk',
        context,
        gateProfileThresholds,
      );
    }
    if (pathDecisions.length > 0) {
      pushFinding(
        findings,
        sourceFile,
        relPath,
        node,
        'hardcoded_path_decision_risk',
        context,
        pathDecisions,
      );
    }
    if (auditorBootstrapReality.length > 0) {
      pushFinding(
        findings,
        sourceFile,
        relPath,
        node,
        'hardcoded_auditor_bootstrap_reality_risk',
        context,
        auditorBootstrapReality,
      );
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return { findings, predicates };
}

function sourceMayContainHardcodedRealitySignal(source: string): boolean {
  return (
    source.includes('const ') ||
    source.includes('enum ') ||
    source.includes('type ') ||
    source.includes('breaks.push') ||
    source.includes('case ') ||
    source.includes(' if ') ||
    source.includes('switch ') ||
    source.includes('=>')
  );
}

function summarizeNoHardcodedRealityFindings(
  findings: NoHardcodedRealityFinding[],
  predicates: NoHardcodedRealityPredicate[],
): NoHardcodedRealityAuditResult['summary'] {
  const byKind: Partial<Record<FindingKind, number>> = {};
  const byPredicateKind: Partial<Record<PredicateKind, number>> = {};
  const byFile = new Map<string, number>();

  for (const finding of findings) {
    byKind[finding.kind] = (byKind[finding.kind] ?? 0) + 1;
    byFile.set(finding.filePath, (byFile.get(finding.filePath) ?? 0) + 1);
  }

  for (const predicate of predicates) {
    byPredicateKind[predicate.kind] = (byPredicateKind[predicate.kind] ?? 0) + 1;
  }

  const topFiles = [...byFile.entries()]
    .map(([filePath, count]) => ({ filePath, findings: count }))
    .sort((left, right) => {
      if (right.findings !== left.findings) {
        return right.findings - left.findings;
      }
      return left.filePath.localeCompare(right.filePath);
    })
    .slice(0, 20);

  return {
    totalFindings: findings.length,
    byKind,
    topFiles,
    totalPredicates: predicates.length,
    byPredicateKind,
  };
}

export function auditPulseNoHardcodedReality(rootDir: string): NoHardcodedRealityAuditResult {
  const pulseDir = path.join(rootDir, 'scripts', 'pulse');
  if (!fs.existsSync(pulseDir)) {
    return {
      scannedFiles: 0,
      findings: [],
      predicates: [],
      summary: summarizeNoHardcodedRealityFindings([], []),
    };
  }
  const files = walkSourceFiles(pulseDir, pulseCompilerExcludedDirectoryNames(pulseDir));
  const results = files.map((file) => auditSourceFile(file, path.relative(rootDir, file)));
  const findings = results.flatMap((result) => result.findings);
  const predicates = results.flatMap((result) => result.predicates);

  return {
    scannedFiles: files.length,
    findings,
    predicates,
    summary: summarizeNoHardcodedRealityFindings(findings, predicates),
  };
}
