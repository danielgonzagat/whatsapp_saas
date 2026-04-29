import * as fs from 'fs';
import * as path from 'path';
import ts from 'typescript';

type FindingKind =
  | 'fixed_product_route_collection'
  | 'fixed_capability_id_collection'
  | 'fixed_flow_id_collection'
  | 'fixed_module_decision_collection';

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
  'role',
  'severity',
  'status',
  'token',
  'truth',
  'validator',
];

const INFRASTRUCTURE_ROUTES = new Set(['/', '/health', '/diag-db']);
const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);
const ARTIFACT_FILE_RE = /^PULSE_[A-Z0-9_]+\.json$/;

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

  const visit = (node: ts.Node): void => {
    if (!isDecisionCollection(node)) {
      ts.forEachChild(node, visit);
      return;
    }

    const context = nearestCollectionContext(node);
    const values = extractStringLiterals(node).filter((value) => !isAllowedLiteral(value));
    const routes = routeFindings(context, values);
    const capabilities = capabilityFindings(context, values);
    const flows = flowFindings(context, values);
    const modules = moduleFindings(context, values);

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

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return findings;
}

export function auditPulseNoHardcodedReality(rootDir: string): NoHardcodedRealityAuditResult {
  const pulseDir = fs.existsSync(path.join(rootDir, 'scripts', 'pulse'))
    ? path.join(rootDir, 'scripts', 'pulse')
    : rootDir;
  const files = walkSourceFiles(pulseDir).filter((file) => {
    const relPath = path.relative(rootDir, file);
    return !isSkippedPath(relPath);
  });
  const findings = files.flatMap((file) => auditSourceFile(file, path.relative(rootDir, file)));

  return {
    scannedFiles: files.length,
    findings,
  };
}
