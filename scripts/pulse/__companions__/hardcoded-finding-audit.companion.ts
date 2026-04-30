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

