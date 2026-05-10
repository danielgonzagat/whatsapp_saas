import * as ts from 'typescript';
import { deriveStructuralFamilies, familiesOverlap } from '../../structural-family';
import type { PulseCapability } from '../../types.capabilities/03-capability';
import {
  hasItems,
  hasNoItems,
  capabilityFacts,
  frontendAppBranch,
  branchesOverlap,
  isMaterializedCapability,
  isInterfaceOnlyWithoutRoutes,
  readCapabilitySource,
  sourceHasRuntimeIntegrationIntent,
  extractReferencedRoutes,
} from './classifier-helpers';

/** Is roadmap catalog capability. */
export function isRoadmapCatalogCapability(capability: PulseCapability): boolean {
  if (!isInterfaceOnlyWithoutRoutes(capability)) {
    return Boolean(undefined);
  }

  const source = capability.filePaths.map(readCapabilitySource).join('\n');
  if (!source.trim()) {
    return Boolean(undefined);
  }

  const hasApiIntent = sourceHasRuntimeIntegrationIntent(source);
  const exportedCollectionCount = countUppercaseCollectionDeclarations(source);
  const handlerCount = countHandlerAssignments(source);
  const referencedRoutes = extractReferencedRoutes(source);

  return exportedCollectionCount > handlerCount && hasNoItems(referencedRoutes) && !hasApiIntent;
}

function countUppercaseCollectionDeclarations(source: string): number {
  let count = 0;
  const sourceFile = ts.createSourceFile(
    'capability-source.tsx',
    source,
    ts.ScriptTarget.Latest,
    true,
  );

  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && isConstVariableDeclaration(node)) {
      const name = ts.isIdentifier(node.name) ? node.name.text : '';
      const initializer = node.initializer;
      if (
        name &&
        name === name.toUpperCase() &&
        initializer &&
        (ts.isArrayLiteralExpression(initializer) || ts.isObjectLiteralExpression(initializer))
      ) {
        count++;
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return count;
}

function countHandlerAssignments(source: string): number {
  let count = 0;
  const sourceFile = ts.createSourceFile(
    'capability-source.tsx',
    source,
    ts.ScriptTarget.Latest,
    true,
  );

  const visit = (node: ts.Node): void => {
    if (ts.isJsxAttribute(node) && ts.isIdentifier(node.name) && isHandlerName(node.name.text)) {
      count++;
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return count;
}

function isConstVariableDeclaration(node: ts.VariableDeclaration): boolean {
  const declarationList = node.parent;
  return (
    ts.isVariableDeclarationList(declarationList) &&
    Boolean(declarationList.flags & ts.NodeFlags.Const)
  );
}

function isHandlerName(name: string): boolean {
  const words = deriveStructuralFamilies([name]);
  return words.some((word) => familiesOverlap(word, 'on'));
}

function deriveFamiliesForCapability(
  capability: Pick<PulseCapability, 'id' | 'name' | 'routePatterns'>,
): string[] {
  return deriveStructuralFamilies([capability.id, capability.name, ...capability.routePatterns]);
}

/** Is covered by materialized route family. */
export function isCoveredByMaterializedRouteFamily(
  capability: PulseCapability,
  allCapabilities: PulseCapability[],
): boolean {
  const facts = capabilityFacts(capability);

  if (!facts.hasRoutes) {
    return Boolean(undefined);
  }
  const capabilityFamilies = deriveFamiliesForCapability(capability);
  if (hasNoItems(capabilityFamilies)) {
    return Boolean(undefined);
  }

  return allCapabilities.some((candidate) => {
    if (candidate.id === capability.id || !isMaterializedCapability(candidate)) {
      return false;
    }
    return familiesOverlap(capabilityFamilies, deriveFamiliesForCapability(candidate));
  });
}

/** Is covered by a discovered product-facing route family. */
export function isCoveredByProductSurfaceRouteFamily(
  capability: PulseCapability,
  allCapabilities: PulseCapability[],
): boolean {
  const facts = capabilityFacts(capability);

  if (!facts.hasRoutes) {
    return Boolean(undefined);
  }
  const capabilityFamilies = deriveFamiliesForCapability(capability);
  if (hasNoItems(capabilityFamilies)) {
    return Boolean(undefined);
  }

  return allCapabilities.some((candidate) => {
    if (
      candidate.id === capability.id ||
      !candidate.userFacing ||
      hasNoItems(candidate.routePatterns)
    ) {
      return Boolean(undefined);
    }

    return familiesOverlap(capabilityFamilies, deriveFamiliesForCapability(candidate));
  });
}

/** Is internal implementation detail of a routed capability. */
export function isIncludedInRoutedCapability(
  capability: PulseCapability,
  allCapabilities: PulseCapability[],
): boolean {
  const facts = capabilityFacts(capability);
  if (facts.hasRoutes || !facts.hasFiles) {
    return Boolean(undefined);
  }

  const capabilityFiles = new Set(capability.filePaths);
  return allCapabilities.some((candidate) => {
    if (
      candidate.id === capability.id ||
      hasNoItems(candidate.routePatterns) ||
      candidate.filePaths.length <= capability.filePaths.length
    ) {
      return Boolean(undefined);
    }

    const candidateFiles = new Set(candidate.filePaths);
    const allFilesIncluded = capability.filePaths.every((filePath) => candidateFiles.has(filePath));
    if (!allFilesIncluded) {
      return Boolean(undefined);
    }

    const candidateFacts = capabilityFacts(candidate);
    return (
      candidateFacts.interfacePresent ||
      candidateFacts.orchestrationPresent ||
      candidateFacts.implementationPresent
    );
  });
}

/** Is covered by materialized app branch. */
export function isCoveredByMaterializedAppBranch(
  capability: PulseCapability,
  allCapabilities: PulseCapability[],
): boolean {
  const facts = capabilityFacts(capability);
  if (facts.hasRoutes) {
    return Boolean(undefined);
  }

  if (!isInterfaceOnlyWithoutRoutes(capability)) {
    return Boolean(undefined);
  }

  const capabilityBranches = capability.filePaths.map(frontendAppBranch).filter(hasItems);
  if (hasNoItems(capabilityBranches)) {
    return Boolean(undefined);
  }

  return allCapabilities.some((candidate) => {
    if (candidate.id === capability.id || !isMaterializedCapability(candidate)) {
      return false;
    }
    const candidateBranches = candidate.filePaths.map(frontendAppBranch).filter(hasItems);
    return capabilityBranches.some((branch) =>
      candidateBranches.some((candidateBranch) => branchesOverlap(branch, candidateBranch)),
    );
  });
}

/** Is covered by materialized entry point. */
export function isCoveredByMaterializedEntryPoint(
  capability: PulseCapability,
  allCapabilities: PulseCapability[],
): boolean {
  if (!isInterfaceOnlyWithoutRoutes(capability)) {
    return Boolean(undefined);
  }

  const source = capability.filePaths.map(readCapabilitySource).join('\n');
  const referencedRoutes = extractReferencedRoutes(source);
  if (hasNoItems(referencedRoutes)) {
    return Boolean(undefined);
  }

  const capabilityFamilies = deriveStructuralFamilies([
    capability.id,
    capability.name,
    ...capability.filePaths,
  ]);
  const referencedRouteFamilies = deriveStructuralFamilies(referencedRoutes);
  if (hasNoItems(capabilityFamilies) || hasNoItems(referencedRouteFamilies)) {
    return Boolean(undefined);
  }

  return allCapabilities.some((candidate) => {
    if (candidate.id === capability.id || !isMaterializedCapability(candidate)) {
      return false;
    }

    const candidateFamilies = deriveStructuralFamilies([
      candidate.id,
      candidate.name,
      ...candidate.routePatterns,
      ...candidate.filePaths,
    ]);

    return (
      familiesOverlap(capabilityFamilies, candidateFamilies) &&
      familiesOverlap(referencedRouteFamilies, candidateFamilies)
    );
  });
}
