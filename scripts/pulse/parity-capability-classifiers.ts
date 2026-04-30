import type { PulseCapability } from './types';
import { readTextFile } from './safe-fs';
import { deriveStructuralFamilies, familiesOverlap } from './structural-family';
import ts from 'typescript';

interface CapabilityEvidenceFacts {
  hasRoutes: boolean;
  hasFiles: boolean;
  interfacePresent: boolean;
  implementationPresent: boolean;
  orchestrationPresent: boolean;
  runtimeEvidencePresent: boolean;
  validationPresent: boolean;
  simulationOnly: boolean;
  dodComplete: boolean;
}

function hasItems<T>(items: readonly T[]): boolean {
  return Boolean(items.length);
}

function hasNoItems<T>(items: readonly T[]): boolean {
  return !hasItems(items);
}

function capabilityFacts(capability: PulseCapability): CapabilityEvidenceFacts {
  const dimensions = capability.maturity.dimensions;
  return {
    hasRoutes: hasItems(capability.routePatterns),
    hasFiles: hasItems(capability.filePaths),
    interfacePresent: dimensions.interfacePresent,
    implementationPresent: dimensions.persistencePresent || dimensions.sideEffectPresent,
    orchestrationPresent: dimensions.orchestrationPresent,
    runtimeEvidencePresent: dimensions.runtimeEvidencePresent,
    validationPresent: dimensions.validationPresent || dimensions.codacyHealthy,
    simulationOnly: dimensions.simulationOnly,
    dodComplete:
      hasNoItems(capability.dod.missingRoles) &&
      hasNoItems(capability.dod.blockers) &&
      capability.dod.truthModeMet,
  };
}

function frontendAppBranch(filePath: string): string[] {
  const normalized = String(filePath || '')
    .split('\\')
    .join('/');
  const appIndex = normalized.indexOf('/src/app/');
  const rootAppIndex = normalized.startsWith('app/') ? 0 : -1;
  const appPath =
    appIndex >= 0
      ? normalized.slice(appIndex + '/src/app/'.length)
      : rootAppIndex === 0
        ? normalized.slice('app/'.length)
        : '';
  if (!appPath) {
    return [];
  }

  return appPath
    .split('/')
    .filter(Boolean)
    .filter((part) => !isWrappedRouteSegment(part, '(', ')'))
    .filter((part) => !isWrappedRouteSegment(part, '[', ']'))
    .filter((part) => !isJavascriptSourceFileName(part));
}

function isWrappedRouteSegment(part: string, open: string, close: string): boolean {
  return part.length > 2 && part.startsWith(open) && part.endsWith(close);
}

function isJavascriptSourceFileName(part: string): boolean {
  return ['.ts', '.tsx', '.js', '.jsx'].some((extension) => part.endsWith(extension));
}

function branchesOverlap(left: string[], right: string[]): boolean {
  if (left.length === 0 || right.length === 0 || left[0] !== right[0]) {
    return false;
  }
  const limit = Math.min(left.length, right.length);
  for (let index = 0; index < limit; index++) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
}

/** Is framework shell capability. */
export function isFrameworkShellCapability(capability: PulseCapability): boolean {
  const facts = capabilityFacts(capability);

  return (
    !facts.hasRoutes &&
    facts.interfacePresent &&
    !facts.implementationPresent &&
    !facts.orchestrationPresent &&
    !facts.simulationOnly &&
    facts.hasFiles &&
    capability.filePaths.every(isFrameworkShellFilePath)
  );
}

function isFrameworkShellFilePath(filePath: string): boolean {
  const normalized = filePath.split('\\').join('/');
  const branch = frontendAppBranch(normalized);
  if (!hasItems(branch)) {
    return Boolean(undefined);
  }

  const source = readCapabilitySource(filePath);
  return !sourceHasRuntimeIntegrationIntent(source) && hasNoItems(extractReferencedRoutes(source));
}

/** Is materialized capability. */
export function isMaterializedCapability(capability: PulseCapability): boolean {
  const facts = capabilityFacts(capability);
  return (
    !isFrameworkShellCapability(capability) &&
    facts.dodComplete &&
    facts.interfacePresent &&
    facts.implementationPresent &&
    facts.hasRoutes
  );
}

/** Is interface only without routes. */
export function isInterfaceOnlyWithoutRoutes(capability: PulseCapability): boolean {
  const facts = capabilityFacts(capability);
  return (
    !facts.hasRoutes &&
    facts.interfacePresent &&
    !facts.implementationPresent &&
    !facts.orchestrationPresent &&
    !facts.simulationOnly
  );
}

/** Is operational readiness capability. */
export function isOperationalReadinessCapability(capability: PulseCapability): boolean {
  const facts = capabilityFacts(capability);
  return (
    facts.hasRoutes &&
    !capability.userFacing &&
    facts.runtimeEvidencePresent &&
    facts.validationPresent &&
    !facts.implementationPresent
  );
}

function readCapabilitySource(filePath: string): string {
  try {
    return readTextFile(filePath, 'utf8');
  } catch {
    return '';
  }
}

function safeFilterStrings(arr: unknown[] | undefined): string[] {
  if (!arr || !Array.isArray(arr)) {
    return [];
  }
  return arr.filter((item): item is string => typeof item === 'string');
}

function isRouteLiteralQuote(char: string | undefined): char is '"' | "'" | '`' {
  return char === '"' || char === "'" || char === '`';
}

function readQuotedRouteLiteral(
  source: string,
  quoteIndex: number,
): { raw: string; start: number; end: number } | null {
  const quote = source[quoteIndex];
  if (!isRouteLiteralQuote(quote)) {
    return null;
  }

  let cursor = quoteIndex + 1;
  let escaped = false;
  let slashSeen = false;
  while (cursor < source.length) {
    const char = source[cursor];
    if (escaped) {
      escaped = false;
      cursor++;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      cursor++;
      continue;
    }
    if (char === quote) {
      if (!slashSeen) {
        return null;
      }
      return {
        raw: source.slice(quoteIndex + 1, cursor).trim(),
        start: quoteIndex,
        end: cursor + 1,
      };
    }
    if (char === '/') {
      slashSeen = true;
    }
    cursor++;
  }

  return null;
}

function isImportSourceLine(source: string, index: number): boolean {
  const lineStart = source.lastIndexOf('\n', index) + 1;
  const lineEnd = source.indexOf('\n', index);
  const line = source.slice(lineStart, lineEnd === -1 ? source.length : lineEnd).trimStart();
  return line.startsWith('import ');
}

function stripRouteSearchAndHash(route: string): string {
  const searchIndex = route.indexOf('?');
  const hashIndex = route.indexOf('#');
  const candidates = [searchIndex, hashIndex].filter((index) => index >= 0);
  const end = candidates.length > 0 ? Math.min(...candidates) : route.length;
  return route.slice(0, end) || route;
}

function extractReferencedRoutes(source: string): string[] {
  const routes = new Set<string>();
  const sourceFile = ts.createSourceFile(
    'capability-source.tsx',
    source,
    ts.ScriptTarget.Latest,
    true,
  );

  const visit = (node: ts.Node): void => {
    if (!ts.isStringLiteralLike(node) || isImportStringLiteral(node)) {
      ts.forEachChild(node, visit);
      return;
    }
    const raw = node.text.trim();
    if (!raw.startsWith('/') || raw === '/') {
      ts.forEachChild(node, visit);
      return;
    }
    routes.add(stripRouteSearchAndHash(raw));
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  return [...routes];
}

function isImportStringLiteral(node: ts.Node): boolean {
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (ts.isImportDeclaration(current) || ts.isExportDeclaration(current)) {
      return true;
    }
    current = current.parent;
  }
  return Boolean(undefined);
}

function sourceHasRuntimeIntegrationIntent(source: string): boolean {
  if (!source.trim()) {
    return Boolean(undefined);
  }

  const sourceFile = ts.createSourceFile(
    'capability-source.tsx',
    source,
    ts.ScriptTarget.Latest,
    true,
  );
  let found = Boolean(undefined);

  const visit = (node: ts.Node): void => {
    if (found) {
      return;
    }

    if (ts.isCallExpression(node)) {
      const expressionText = node.expression.getText(sourceFile).toLowerCase();
      const expressionFamilies = deriveStructuralFamilies([expressionText]);
      const hasRuntimeFamily = expressionFamilies.some((family) =>
        familiesOverlap(family, ['fetch', 'swr', 'api']),
      );
      if (hasRuntimeFamily) {
        found = true;
        return;
      }
    }

    if (ts.isImportDeclaration(node) && ts.isStringLiteralLike(node.moduleSpecifier)) {
      const moduleFamilies = deriveStructuralFamilies([node.moduleSpecifier.text]);
      if (moduleFamilies.some((family) => familiesOverlap(family, 'api'))) {
        found = true;
        return;
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return found;
}

/** Is roadmap catalog capability. */
export function isRoadmapCatalogCapability(capability: PulseCapability): boolean {
  if (!isInterfaceOnlyWithoutRoutes(capability)) {
    return false;
  }

  const source = capability.filePaths.map(readCapabilitySource).join('\n');
  if (!source.trim()) {
    return false;
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
    const candidateBranches = candidate.filePaths
      .map(frontendAppBranch)
      .filter((branch) => branch.length > 0);
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
