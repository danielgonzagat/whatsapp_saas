import * as path from 'path';
import * as fs from 'node:fs';
import * as ts from 'typescript';

// ── Type-contract AST derivation (meta-primitive) ──────────────────────────

const AST_TYPE_CONTRACT_CACHE = new Map<string, Set<string>>();
const AST_TYPE_CONTRACT_RESOLUTION_STACK = new Set<string>();

function resolvePulseTypeContractPath(fileName: string): string {
  return path.resolve(process.cwd(), fileName);
}

function resolveObservedTypeContractModulePath(
  fromFilePath: string,
  moduleSpecifier: string,
): string | null {
  if (!moduleSpecifier.startsWith('.')) {
    return null;
  }

  const resolvedBasePath = path.resolve(path.dirname(fromFilePath), moduleSpecifier);
  const observedCandidates = [
    resolvedBasePath,
    `${resolvedBasePath}.ts`,
    path.join(resolvedBasePath, 'index.ts'),
  ];

  return observedCandidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

function extractUnionStringLiteralMembersFromAstNode(
  typeNode: ts.TypeNode,
  out: Set<string>,
): void {
  if (ts.isUnionTypeNode(typeNode)) {
    for (const member of typeNode.types) {
      if (ts.isLiteralTypeNode(member) && ts.isStringLiteral(member.literal)) {
        out.add(member.literal.text);
      }
    }
  } else if (ts.isLiteralTypeNode(typeNode) && ts.isStringLiteral(typeNode.literal)) {
    out.add(typeNode.literal.text);
  }
}

/**
 * Generic AST-derivation: given a TypeScript file path and a type name, parse
 * the file, find the type-alias union or interface property, and return the
 * string literal members of that union (or interface property literal-types).
 *
 * Cache by (filePath, typeName) inside the kernel. Fail closed (throw) when
 * the file or type is missing — never silently fall back to a literal.
 */
export function deriveStringUnionMembersFromTypeContract(
  fileName: string,
  typeName: string,
): Set<string> {
  const cacheKey = `${fileName}::${typeName}`;
  const cached = AST_TYPE_CONTRACT_CACHE.get(cacheKey);
  if (cached) return cached;

  const absolutePath = resolvePulseTypeContractPath(fileName);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`deriveStringUnionMembersFromTypeContract: file not found ${absolutePath}`);
  }

  const sourceText = fs.readFileSync(absolutePath, 'utf-8');
  const sourceFile = ts.createSourceFile(
    absolutePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

  const members = new Set<string>();
  let found = false;
  let reexportFileName: string | null = null;

  function visitTypeAlias(node: ts.Node): void {
    if (found) return;
    if (ts.isTypeAliasDeclaration(node) && node.name.text === typeName) {
      found = true;
      extractUnionStringLiteralMembersFromAstNode(node.type, members);
      return;
    }
    ts.forEachChild(node, visitTypeAlias);
  }
  visitTypeAlias(sourceFile);

  if (!found) {
    function visitInterface(node: ts.Node): void {
      if (found) return;
      if (ts.isInterfaceDeclaration(node)) {
        for (const memberNode of node.members) {
          if (!ts.isPropertySignature(memberNode)) continue;
          if (!memberNode.name || !ts.isIdentifier(memberNode.name)) continue;
          if (memberNode.name.text !== typeName) continue;
          if (!memberNode.type) continue;
          found = true;
          extractUnionStringLiteralMembersFromAstNode(memberNode.type, members);
          return;
        }
      }
      ts.forEachChild(node, visitInterface);
    }
    visitInterface(sourceFile);
  }

  if (!found) {
    for (const statement of sourceFile.statements) {
      if (!ts.isExportDeclaration(statement)) continue;
      if (!statement.moduleSpecifier || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
      if (!statement.exportClause || !ts.isNamedExports(statement.exportClause)) continue;

      const exportedElement = statement.exportClause.elements.find((element) => {
        const exportedName = element.name.text;
        const propertyName = element.propertyName?.text;
        return exportedName === typeName || propertyName === typeName;
      });
      if (!exportedElement) continue;

      const observedModulePath = resolveObservedTypeContractModulePath(
        absolutePath,
        statement.moduleSpecifier.text,
      );
      if (!observedModulePath) continue;

      reexportFileName = path.relative(process.cwd(), observedModulePath);
      break;
    }
  }

  if (!found && reexportFileName) {
    const reexportCacheKey = `${reexportFileName}::${typeName}`;
    if (AST_TYPE_CONTRACT_RESOLUTION_STACK.has(reexportCacheKey)) {
      throw new Error(
        `deriveStringUnionMembersFromTypeContract: circular type re-export for "${typeName}" from ${fileName}`,
      );
    }

    AST_TYPE_CONTRACT_RESOLUTION_STACK.add(cacheKey);
    try {
      const reexportMembers = deriveStringUnionMembersFromTypeContract(reexportFileName, typeName);
      AST_TYPE_CONTRACT_CACHE.set(cacheKey, reexportMembers);
      return reexportMembers;
    } finally {
      AST_TYPE_CONTRACT_RESOLUTION_STACK.delete(cacheKey);
    }
  }

  if (!found) {
    throw new Error(
      `deriveStringUnionMembersFromTypeContract: type "${typeName}" not found in ${fileName}`,
    );
  }

  if (members.size === 0) {
    throw new Error(
      `deriveStringUnionMembersFromTypeContract: type "${typeName}" in ${fileName} has zero string-literal members`,
    );
  }

  AST_TYPE_CONTRACT_CACHE.set(cacheKey, members);
  return members;
}

// ── Convergence type-union label discovery ─────────────────────────────────

export function discoverConvergenceUnitKindLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.convergence.ts',
    'PulseConvergenceUnitKind',
  );
}

export function discoverConvergenceUnitStatusLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.convergence.ts',
    'PulseConvergenceUnitStatus',
  );
}

export function discoverConvergenceUnitPriorityLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.convergence.ts',
    'PulseConvergenceUnitPriority',
  );
}

export function discoverConvergenceExecutionModeLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.convergence.ts',
    'PulseConvergenceExecutionMode',
  );
}

export function discoverConvergenceRiskLevelLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.convergence.ts',
    'PulseConvergenceRiskLevel',
  );
}

export function discoverConvergenceProductImpactLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.convergence.ts',
    'PulseConvergenceProductImpact',
  );
}

export function discoverConvergenceEvidenceConfidenceLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.convergence.ts',
    'PulseConvergenceEvidenceConfidence',
  );
}

export function discoverConvergenceSourceLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.convergence.ts',
    'PulseConvergenceSource',
  );
}

export function discoverConvergenceOwnerLaneLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.gate-failure.ts',
    'PulseConvergenceOwnerLane',
  );
}

export function discoverRuntimeProbeStatusLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.convergence.ts',
    'PulseRuntimeProbeStatus',
  );
}

// ── Gate failure type-union label discovery ────────────────────────────────

export function discoverGateFailureClassLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.gate-failure.ts',
    'PulseGateFailureClass',
  );
}

// ── Capability type-union label discovery ──────────────────────────────────

export function discoverCapabilityStatusLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.capabilities.ts',
    'PulseCapabilityStatus',
  );
}

export function discoverCapabilityMaturityStageLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.capabilities.ts',
    'PulseCapabilityMaturityStage',
  );
}

export function discoverFlowProjectionStatusLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.capabilities.ts',
    'PulseFlowProjectionStatus',
  );
}

export function discoverDoDStatusLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.capabilities.ts',
    'PulseDoDStatus',
  );
}

export function discoverExternalSignalSourceLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.capabilities.ts',
    'PulseExternalSignalSource',
  );
}

export function discoverExternalAdapterStatusLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.capabilities.ts',
    'PulseExternalAdapterStatus',
  );
}

export function discoverExternalAdapterRequirednessLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.capabilities.ts',
    'PulseExternalAdapterRequiredness',
  );
}

export function discoverExternalAdapterRequirementLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.capabilities.ts',
    'PulseExternalAdapterRequirement',
  );
}

export function discoverExternalAdapterProofBasisLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.capabilities.ts',
    'PulseExternalAdapterProofBasis',
  );
}

export function discoverParityGapKindLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.capabilities.parity.ts',
    'PulseParityGapKind',
  );
}

export function discoverParityGapSeverityLabels(): Set<string> {
  return deriveStringUnionMembersFromTypeContract(
    'scripts/pulse/types.capabilities.parity.ts',
    'PulseParityGapSeverity',
  );
}
