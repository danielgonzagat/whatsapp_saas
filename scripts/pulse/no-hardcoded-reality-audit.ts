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
  | 'hardcoded_auditor_bootstrap_reality_risk';

export interface NoHardcodedRealityFinding {
  filePath: string;
  line: number;
  column: number;
  kind: FindingKind;
  context: string;
  samples: string[];
}

export interface NoHardcodedRealityAuditResult {
  scannedFiles: number;
  findings: NoHardcodedRealityFinding[];
  summary: {
    totalFindings: number;
    byKind: Partial<Record<FindingKind, number>>;
    topFiles: Array<{
      filePath: string;
      findings: number;
    }>;
  };
}

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);
const SKIPPED_PATH_SEGMENTS = new Set([
  '__diagnostics__',
  '__fixtures__',
  '__tests__',
  'dist',
  'node_modules',
]);

const ALLOWED_CONTEXT_TOKENS = [
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
const ALLOWED_GRAMMAR_CONTEXT_TOKENS = [
  ...ALLOWED_CONTEXT_TOKENS,
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
const REALITY_CATALOG_CONTEXT_TOKENS = [
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
const PRODUCT_CONTEXT_TOKENS = ['product', 'products', 'surface', 'surfaces'];
const DOMAIN_CONTEXT_TOKENS = ['domain', 'domains', 'module', 'modules', 'area', 'areas'];
const SOURCE_ROOT_CONTEXT_TOKENS = ['source', 'sources'];
const SOURCE_ROOT_COLLECTION_TOKENS = ['dir', 'dirs', 'glob', 'globs', 'root', 'roots'];
const CRITICALITY_CONTEXT_TOKENS = [
  'critical',
  'criticality',
  'musthave',
  'must',
  'runtimecritical',
];
const PROVIDER_CONTEXT_TOKENS = [
  'adapter',
  'adapters',
  'integration',
  'integrations',
  'provider',
  'providers',
  'vendor',
  'vendors',
];
const ROLE_CONTEXT_TOKENS = ['actor', 'actors', 'persona', 'personas', 'role', 'roles'];
const USER_ROLE_CONTEXT_TOKENS = ['user', 'users'];
const DECISION_GATE_CONTEXT_TOKENS = [
  'gate',
  'gates',
  'profile',
  'profiles',
  'threshold',
  'thresholds',
  'tier',
];
const PATH_DECISION_CONTEXT_TOKENS = [
  'path',
  'paths',
  'route',
  'routes',
  'glob',
  'globs',
  'pattern',
  'patterns',
];
const DECISION_AUTHORITY_CONTEXT_TOKENS = [
  ...DECISION_GATE_CONTEXT_TOKENS,
  ...PATH_DECISION_CONTEXT_TOKENS,
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
const STRUCTURAL_GRAMMAR_CONTEXT_TOKENS = [
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
const STRUCTURAL_ROLE_VALUES = new Set([
  'interface',
  'orchestration',
  'persistence',
  'side_effect',
  'simulation',
]);

const INFRASTRUCTURE_ROUTES = new Set(['/', '/health', '/diag-db']);
const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);
const ARTIFACT_FILE_RE = /^PULSE_[A-Z0-9_]+\.json$/;
const SQL_REALITY_TABLE_RE =
  /\b(?:from|join|update|into)\s+(?:"([A-Z][A-Za-z0-9_]*)"|`([A-Z][A-Za-z0-9_]*)`|([A-Z][A-Za-z0-9_]*))/gi;

function isSkippedPath(relPath: string): boolean {
  const normalized = relPath.replace(/\\/g, '/');
  return normalized
    .split('/')
    .some((segment) => SKIPPED_PATH_SEGMENTS.has(segment) || segment.endsWith('.d.ts'));
}

function walkSourceFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) {
    return [];
  }

  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkSourceFiles(fullPath));
      continue;
    }

    if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }
  return files;
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

function contextHasAllowedGrammar(context: string): boolean {
  const normalized = context.toLowerCase();
  return ALLOWED_CONTEXT_TOKENS.some((token) => normalized.includes(token));
}

function splitIdentifierTokens(value: string): Set<string> {
  const spaced = value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .toLowerCase();
  return new Set(spaced.split(/\s+/).filter(Boolean));
}

function contextHasToken(context: string, tokens: readonly string[]): boolean {
  const contextTokens = splitIdentifierTokens(context);
  return tokens.some((token) => contextTokens.has(token));
}

function contextHasAllowedRealityGrammar(context: string): boolean {
  return contextHasToken(context, ALLOWED_GRAMMAR_CONTEXT_TOKENS);
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
  return !options.requireCatalogToken || contextHasToken(context, REALITY_CATALOG_CONTEXT_TOKENS);
}

function isAllowedLiteral(value: string): boolean {
  return (
    HTTP_METHODS.has(value) ||
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
  return value.startsWith('/') && !INFRASTRUCTURE_ROUTES.has(value);
}

function looksLikeFixedId(value: string): boolean {
  return /^[a-z][a-z0-9]+(?:[-_:][a-z0-9]+)+$/.test(value) && !isAllowedLiteral(value);
}

function looksLikeRealityLabel(value: string): boolean {
  return (
    looksLikeFixedId(value) ||
    /^[a-z][a-z0-9]+(?:[A-Z][A-Za-z0-9]+)+$/.test(value) ||
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
    !contextHasToken(context, SOURCE_ROOT_CONTEXT_TOKENS) ||
    !contextHasToken(context, SOURCE_ROOT_COLLECTION_TOKENS)
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
    !contextLooksLikeRealityCatalog(context, PRODUCT_CONTEXT_TOKENS, {
      requireCatalogToken: true,
    })
  ) {
    return [];
  }
  return realityLabelFindings(values);
}

function domainCatalogFindings(context: string, values: string[]): string[] {
  if (
    !contextLooksLikeRealityCatalog(context, DOMAIN_CONTEXT_TOKENS, {
      requireCatalogToken: true,
    })
  ) {
    return [];
  }
  return realityLabelFindings(values);
}

function domainCriticalityFindings(context: string, values: string[]): string[] {
  if (
    !contextHasToken(context, DOMAIN_CONTEXT_TOKENS) ||
    !contextHasToken(context, CRITICALITY_CONTEXT_TOKENS) ||
    contextHasAllowedRealityGrammar(context)
  ) {
    return [];
  }
  return realityLabelFindings(values);
}

function providerCatalogFindings(context: string, values: string[]): string[] {
  if (
    !contextLooksLikeRealityCatalog(context, PROVIDER_CONTEXT_TOKENS, {
      requireCatalogToken: true,
    })
  ) {
    return [];
  }
  const findings = realityLabelFindings(values);
  return findings.length >= 2 ? findings : [];
}

function roleCatalogFindings(context: string, values: string[]): string[] {
  const hasCatalogRoleContext = contextLooksLikeRealityCatalog(context, ROLE_CONTEXT_TOKENS, {
    requireCatalogToken: true,
  });
  const hasUserRoleContext =
    contextHasToken(context, ROLE_CONTEXT_TOKENS) &&
    contextHasToken(context, USER_ROLE_CONTEXT_TOKENS) &&
    !contextHasAllowedRealityGrammar(context);
  if (!hasCatalogRoleContext && !hasUserRoleContext) {
    return [];
  }
  return realityLabelFindings(values).filter((value) => !STRUCTURAL_ROLE_VALUES.has(value));
}

function gateProfileThresholdFindings(context: string, values: string[]): string[] {
  if (!contextHasToken(context, DECISION_GATE_CONTEXT_TOKENS)) {
    return [];
  }
  return values.filter((value) => value.length > 0);
}

function pathDecisionFindings(context: string, values: string[]): string[] {
  if (!contextHasToken(context, ['path', 'paths', 'glob', 'globs'])) {
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
  const bootstrappedAuthorityTokens = [
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
  const isBootstrapDecisionSurface = bootstrappedAuthorityTokens.some((token) =>
    contextTokens.has(token),
  );
  if (!isBootstrapDecisionSurface) {
    return [];
  }

  return values.filter((value) => value.trim().length > 0);
}

function contextLooksLikeDecisionAuthority(context: string): boolean {
  return (
    contextHasToken(context, DECISION_AUTHORITY_CONTEXT_TOKENS) &&
    !contextHasToken(context, STRUCTURAL_GRAMMAR_CONTEXT_TOKENS)
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
  const hasThresholdShape = /\\d|\[[0-9]|[<>]=?/.test(text);
  return hasAlternation || hasPathShape || hasThresholdShape ? [text] : [];
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

function auditSourceFile(filePath: string, relPath: string): NoHardcodedRealityFinding[] {
  const source = fs.readFileSync(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true);
  const findings: NoHardcodedRealityFinding[] = [];
  const sourceHasBreakPush = source.includes('breaks.push');

  const visit = (node: ts.Node): void => {
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
  return findings;
}

function summarizeNoHardcodedRealityFindings(
  findings: NoHardcodedRealityFinding[],
): NoHardcodedRealityAuditResult['summary'] {
  const byKind: Partial<Record<FindingKind, number>> = {};
  const byFile = new Map<string, number>();

  for (const finding of findings) {
    byKind[finding.kind] = (byKind[finding.kind] ?? 0) + 1;
    byFile.set(finding.filePath, (byFile.get(finding.filePath) ?? 0) + 1);
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
  };
}

export function auditPulseNoHardcodedReality(rootDir: string): NoHardcodedRealityAuditResult {
  const pulseDir = path.join(rootDir, 'scripts', 'pulse');
  if (!fs.existsSync(pulseDir)) {
    return {
      scannedFiles: 0,
      findings: [],
      summary: summarizeNoHardcodedRealityFindings([]),
    };
  }
  const files = walkSourceFiles(pulseDir).filter((file) => {
    const relPath = path.relative(rootDir, file);
    return !isSkippedPath(relPath);
  });
  const findings = files.flatMap((file) => auditSourceFile(file, path.relative(rootDir, file)));

  return {
    scannedFiles: files.length,
    findings,
    summary: summarizeNoHardcodedRealityFindings(findings),
  };
}
