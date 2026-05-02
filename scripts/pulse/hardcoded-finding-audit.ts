import * as ts from 'typescript';

export type HardcodedFindingRiskKind =
  | 'fixed_allowlist'
  | 'regex_only_break_emitter'
  | 'decision_token_regex'
  | 'hardcoded_break_push_type_risk'
  | 'fixed_break_type_mass_emitter';

export interface HardcodedFindingAuditSource {
  filePath: string;
  source: string;
}

export interface HardcodedFindingAuditFinding {
  kind: HardcodedFindingRiskKind;
  line: number;
  column: number;
  symbol: string;
  evidence: string;
  reason: string;
}

export interface HardcodedFindingAuditFile {
  filePath: string;
  findings: HardcodedFindingAuditFinding[];
}

export interface HardcodedFindingAuditArtifact {
  artifact: 'PULSE_HARDCODED_FINDING_AUDIT';
  version: 1;
  scannedFiles: number;
  totalFindings: number;
  files: HardcodedFindingAuditFile[];
}

const MIN_COLLECTION_SIZE = 2;
const MASS_EMITTER_TYPE_THRESHOLD = 3;

const ALLOWLIST_NAME_RE =
  /(?:^|[^a-z])(?:allow(?:ed|list)?|denylist|blocklist|known|fixed|supported|permitted|accepted|whitelist|blacklist)(?:$|[^a-z])/i;
const BREAK_TYPE_RE = /^[A-Z][A-Z0-9_]{2,}$/;

function locationOf(sourceFile: ts.SourceFile, node: ts.Node): { line: number; column: number } {
  const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return { line: position.line + 1, column: position.character + 1 };
}

function symbolName(name: ts.Node | undefined): string {
  if (!name) {
    return 'anonymous';
  }
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  if (ts.isBindingName(name)) {
    return name.getText();
  }
  return name.getText();
}

function declarationName(node: ts.Node): string {
  let current: ts.Node | undefined = node;
  while (current) {
    if (ts.isVariableDeclaration(current)) {
      return symbolName(current.name);
    }
    if (ts.isPropertyAssignment(current)) {
      return symbolName(current.name);
    }
    if (ts.isFunctionDeclaration(current) || ts.isFunctionExpression(current)) {
      return symbolName(current.name);
    }
    if (ts.isMethodDeclaration(current)) {
      return symbolName(current.name);
    }
    current = current.parent;
  }
  return 'anonymous';
}

function stringLiteralValue(node: ts.Node): string | null {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  return null;
}

function collectStringLiteralValues(node: ts.Node): string[] {
  const values: string[] = [];
  const visit = (child: ts.Node): void => {
    const value = stringLiteralValue(child);
    if (value !== null) {
      values.push(value);
      return;
    }
    ts.forEachChild(child, visit);
  };
  ts.forEachChild(node, visit);
  return values;
}

function collectionValues(node: ts.Node): string[] {
  if (ts.isArrayLiteralExpression(node)) {
    return node.elements.flatMap((element) => {
      const value = stringLiteralValue(element);
      return value === null ? [] : [value];
    });
  }

  if (
    ts.isNewExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === 'Set'
  ) {
    const firstArg = node.arguments?.[0];
    if (firstArg && ts.isArrayLiteralExpression(firstArg)) {
      return collectionValues(firstArg);
    }
  }

  if (ts.isObjectLiteralExpression(node)) {
    return node.properties.flatMap((property) => {
      if (!ts.isPropertyAssignment(property)) {
        return [];
      }
      const key = symbolName(property.name);
      const value = stringLiteralValue(property.initializer);
      return value === null ? [key] : [key, value];
    });
  }

  return [];
}

function compactEvidence(values: readonly string[]): string {
  const unique = [...new Set(values)].slice(0, 6);
  return unique.join(', ');
}

function isRegexNode(node: ts.Node): boolean {
  if (ts.isRegularExpressionLiteral(node)) {
    return true;
  }
  return (
    ts.isNewExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === 'RegExp'
  );
}

function regexBody(node: ts.Node): string {
  if (ts.isRegularExpressionLiteral(node)) {
    return node.text;
  }
  if (ts.isNewExpression(node) && node.arguments?.[0]) {
    return node.arguments[0].getText();
  }
  return node.getText();
}

function isIdentifierLike(value: string): boolean {
  const [firstChar] = value;
  if (
    !firstChar ||
    !(
      firstChar === '_' ||
      firstChar === '$' ||
      (firstChar >= 'A' && firstChar <= 'Z') ||
      (firstChar >= 'a' && firstChar <= 'z')
    )
  ) {
    return false;
  }
  return [...value.slice(1)].every(
    (char) =>
      char === '_' ||
      char === '$' ||
      (char >= 'A' && char <= 'Z') ||
      (char >= 'a' && char <= 'z') ||
      (char >= '0' && char <= '9'),
  );
}

function containsPathGrammar(body: string): boolean {
  for (let index = 0; index < body.length - 1; index++) {
    if (body[index] !== '/') {
      continue;
    }
    const next = body[index + 1];
    if (
      (next >= 'A' && next <= 'Z') ||
      (next >= 'a' && next <= 'z') ||
      (next >= '0' && next <= '9') ||
      next === '_' ||
      next === '*' ||
      next === ':' ||
      next === '.' ||
      next === '-'
    ) {
      return true;
    }
  }
  return false;
}

function containsNumericDecisionGrammar(body: string): boolean {
  for (let index = 0; index < body.length; index++) {
    const char = body[index];
    const next = body[index + 1];
    if (char === '\\' && next === 'd') {
      return true;
    }
    if (char === '[' && next && next >= '0' && next <= '9') {
      return true;
    }
    if (char === '<' || char === '>') {
      return true;
    }
  }
  return false;
}

function containsNamedCaptureGrammar(body: string): boolean {
  return body.includes('?<') && body.includes('>');
}

function isDecisionTokenRegex(name: string, body: string): boolean {
  if (!isIdentifierLike(name)) {
    return false;
  }
  const hasBranchingAlternatives = body.includes('|');
  const hasPathPattern = containsPathGrammar(body);
  const hasNumericDecisionGrammar = containsNumericDecisionGrammar(body);
  const hasNamedCapture = containsNamedCaptureGrammar(body);
  return hasBranchingAlternatives || hasPathPattern || hasNumericDecisionGrammar || hasNamedCapture;
}

function objectBreakType(node: ts.ObjectLiteralExpression): string | null {
  for (const property of node.properties) {
    if (!ts.isPropertyAssignment(property)) {
      continue;
    }
    if (symbolName(property.name) !== 'type') {
      continue;
    }
    return stringLiteralValue(property.initializer);
  }
  return null;
}

function isBreaksPushArgument(node: ts.ObjectLiteralExpression): boolean {
  const parent = node.parent;
  if (!ts.isCallExpression(parent) || parent.arguments[0] !== node) {
    return false;
  }
  if (!ts.isPropertyAccessExpression(parent.expression)) {
    return false;
  }
  return (
    parent.expression.name.text === 'push' && parent.expression.expression.getText() === 'breaks'
  );
}

function isBreakObject(node: ts.ObjectLiteralExpression): boolean {
  return objectBreakType(node) !== null;
}

function nearestFunctionLike(node: ts.Node): ts.Node | null {
  let current: ts.Node | undefined = node;
  while (current) {
    if (
      ts.isFunctionDeclaration(current) ||
      ts.isFunctionExpression(current) ||
      ts.isArrowFunction(current) ||
      ts.isMethodDeclaration(current)
    ) {
      return current;
    }
    current = current.parent;
  }
  return null;
}

function nearestConditional(node: ts.Node): ts.Node | null {
  let current: ts.Node | undefined = node;
  while (current) {
    if (ts.isIfStatement(current) || ts.isConditionalExpression(current)) {
      return current;
    }
    if (
      ts.isFunctionDeclaration(current) ||
      ts.isFunctionExpression(current) ||
      ts.isArrowFunction(current) ||
      ts.isMethodDeclaration(current)
    ) {
      return null;
    }
    current = current.parent;
  }
  return null;
}

function nodeContainsRegexPredicate(node: ts.Node): boolean {
  let found = false;
  const visit = (child: ts.Node): void => {
    if (found) {
      return;
    }
    if (ts.isRegularExpressionLiteral(child)) {
      found = true;
      return;
    }
    if (
      ts.isCallExpression(child) &&
      ts.isPropertyAccessExpression(child.expression) &&
      ['test', 'match', 'matchAll', 'exec'].includes(child.expression.name.text)
    ) {
      found = true;
      return;
    }
    ts.forEachChild(child, visit);
  };
  ts.forEachChild(node, visit);
  return found;
}

function hasExportModifier(node: ts.Node): boolean {
  return ts.canHaveModifiers(node)
    ? Boolean(
        ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword),
      )
    : false;
}

function isCallableDeclaration(node: ts.Node): boolean {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node)
  );
}

function initializerIsCallable(node: ts.VariableDeclaration): boolean {
  return Boolean(node.initializer && isCallableDeclaration(node.initializer));
}

function hasStructuralParserSignal(node: ts.Node): boolean {
  let found = false;
  const visit = (child: ts.Node): void => {
    if (found) {
      return;
    }
    if (ts.isCallExpression(child)) {
      const expression = child.expression;
      if (
        ts.isPropertyAccessExpression(expression) &&
        ['forEachChild', 'getText', 'getStart'].includes(expression.name.text)
      ) {
        found = true;
        return;
      }
      if (
        ts.isIdentifier(expression) &&
        ['createSourceFile', 'forEachChild'].includes(expression.text)
      ) {
        found = true;
        return;
      }
    }
    if (ts.isPropertyAccessExpression(child) && child.expression.getText() === 'ts') {
      found = true;
      return;
    }
    ts.forEachChild(child, visit);
  };
  ts.forEachChild(node, visit);
  return found;
}

function hasExportedExecutableDeclaration(sourceFile: ts.SourceFile): boolean {
  let found = false;
  const visit = (node: ts.Node): void => {
    if (found) {
      return;
    }
    if (ts.isFunctionDeclaration(node) && hasExportModifier(node)) {
      found = true;
      return;
    }
    if (ts.isVariableStatement(node) && hasExportModifier(node)) {
      for (const declaration of node.declarationList.declarations) {
        if (
          initializerIsCallable(declaration) ||
          ts.isObjectLiteralExpression(declaration.initializer)
        ) {
          found = true;
          return;
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

function isAuditableSource(input: HardcodedFindingAuditSource): boolean {
  if (!input.filePath.split(/[\\/]/).includes('pulse')) {
    return false;
  }

  const sourceFile = ts.createSourceFile(
    input.filePath,
    input.source,
    ts.ScriptTarget.Latest,
    true,
  );
  return hasExportedExecutableDeclaration(sourceFile) || hasStructuralParserSignal(sourceFile);
}

function pushUniqueFinding(
  findings: HardcodedFindingAuditFinding[],
  sourceFile: ts.SourceFile,
  node: ts.Node,
  finding: Omit<HardcodedFindingAuditFinding, 'line' | 'column'>,
): void {
  const { line, column } = locationOf(sourceFile, node);
  if (
    findings.some(
      (existing) =>
        existing.kind === finding.kind &&
        existing.line === line &&
        existing.column === column &&
        existing.symbol === finding.symbol,
    )
  ) {
    return;
  }
  findings.push({ ...finding, line, column });
}

function auditSource(input: HardcodedFindingAuditSource): HardcodedFindingAuditFile {
  const sourceFile = ts.createSourceFile(
    input.filePath,
    input.source,
    ts.ScriptTarget.Latest,
    true,
  );
  const findings: HardcodedFindingAuditFinding[] = [];
  const breakTypesByFunction = new Map<ts.Node, Set<string>>();

  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) || ts.isPropertyAssignment(node)) {
      const name = ts.isVariableDeclaration(node) ? symbolName(node.name) : symbolName(node.name);
      const initializer = node.initializer;
      if (initializer) {
        const values = collectionValues(initializer);
        if (values.length >= MIN_COLLECTION_SIZE && ALLOWLIST_NAME_RE.test(name)) {
          pushUniqueFinding(findings, sourceFile, node, {
            kind: 'fixed_allowlist',
            symbol: name,
            evidence: compactEvidence(values),
            reason: 'Fixed string collection can turn parser examples into final truth.',
          });
        }

        if (isRegexNode(initializer)) {
          const body = regexBody(initializer);
          if (isDecisionTokenRegex(name, body)) {
            pushUniqueFinding(findings, sourceFile, node, {
              kind: 'decision_token_regex',
              symbol: name,
              evidence: body,
              reason: 'Decision-token regex can freeze parser evidence into final PULSE truth.',
            });
          }
        }
      }
    }

    if (ts.isRegularExpressionLiteral(node) && !ts.isVariableDeclaration(node.parent)) {
      const name = declarationName(node);
      const body = regexBody(node);
      if (isDecisionTokenRegex(name, body)) {
        pushUniqueFinding(findings, sourceFile, node, {
          kind: 'decision_token_regex',
          symbol: name,
          evidence: body,
          reason: 'Decision-token regex can freeze parser evidence into final PULSE truth.',
        });
      }
    }

    if (ts.isArrayLiteralExpression(node)) {
      const values = collectStringLiteralValues(node).filter((value) => BREAK_TYPE_RE.test(value));
      if (values.length >= MASS_EMITTER_TYPE_THRESHOLD) {
        pushUniqueFinding(findings, sourceFile, node, {
          kind: 'fixed_break_type_mass_emitter',
          symbol: declarationName(node),
          evidence: compactEvidence(values),
          reason:
            'Mass collection of fixed detector labels risks making parser labels final truth.',
        });
      }
    }

    if (ts.isObjectLiteralExpression(node) && isBreakObject(node)) {
      const breakType = objectBreakType(node);
      const owner = nearestFunctionLike(node);
      if (owner && breakType) {
        const current = breakTypesByFunction.get(owner) ?? new Set<string>();
        current.add(breakType);
        breakTypesByFunction.set(owner, current);
      }
      if (breakType && isBreaksPushArgument(node)) {
        pushUniqueFinding(findings, sourceFile, node, {
          kind: 'hardcoded_break_push_type_risk',
          symbol: breakType,
          evidence: breakType,
          reason:
            'Parser emits a fixed final break identity; parsers must emit evidence, not final diagnostics.',
        });
      }
      const conditional = nearestConditional(node);
      if (
        breakType &&
        conditional &&
        nodeContainsRegexPredicate(conditional) &&
        !hasStructuralParserSignal(conditional)
      ) {
        pushUniqueFinding(findings, sourceFile, node, {
          kind: 'regex_only_break_emitter',
          symbol: breakType,
          evidence: conditional.getText(sourceFile).slice(0, 240),
          reason:
            'Break emission appears driven only by regex predicates, without structural parser evidence.',
        });
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  for (const [owner, types] of breakTypesByFunction.entries()) {
    if (types.size < MASS_EMITTER_TYPE_THRESHOLD) {
      continue;
    }
    pushUniqueFinding(findings, sourceFile, owner, {
      kind: 'fixed_break_type_mass_emitter',
      symbol: declarationName(owner),
      evidence: compactEvidence([...types]),
      reason:
        'One parser branch emits many fixed break names; the names should stay evidence-derived.',
    });
  }

  findings.sort((left, right) => left.line - right.line || left.column - right.column);
  return { filePath: input.filePath, findings };
}

export function buildHardcodedFindingAuditArtifact(
  sources: readonly HardcodedFindingAuditSource[],
): HardcodedFindingAuditArtifact {
  const files = sources
    .filter(isAuditableSource)
    .map(auditSource)
    .filter((file) => file.findings.length > 0)
    .sort((left, right) => left.filePath.localeCompare(right.filePath));

  const totalFindings = files.reduce((total, file) => total + file.findings.length, 0);

  return {
    artifact: 'PULSE_HARDCODED_FINDING_AUDIT',
    version: 1,
    scannedFiles: sources.length,
    totalFindings,
    files,
  };
}
