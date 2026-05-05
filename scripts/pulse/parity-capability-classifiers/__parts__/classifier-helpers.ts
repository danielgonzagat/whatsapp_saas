import * as ts from 'typescript';
import { readTextFile } from '../../safe-fs';
import { deriveStructuralFamilies, familiesOverlap } from '../../structural-family';
import type { PulseCapability } from '../../types.capabilities';

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

export function hasItems<T>(items: readonly T[]): boolean {
  return Boolean(items.length);
}

export function hasNoItems<T>(items: readonly T[]): boolean {
  return !hasItems(items);
}

export function capabilityFacts(capability: PulseCapability): CapabilityEvidenceFacts {
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

export function frontendAppBranch(filePath: string): string[] {
  const normalized = String(filePath || '')
    .split('\\')
    .join('/');
  const sourceAppRoot = '/src/app/';
  const rootAppRoot = 'app/';
  const appPath = normalized.includes(sourceAppRoot)
    ? normalized.slice(normalized.indexOf(sourceAppRoot) + sourceAppRoot.length)
    : normalized.startsWith(rootAppRoot)
      ? normalized.slice(rootAppRoot.length)
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
  const inner = part.slice(open.length, -close.length);
  return Boolean(inner) && part.startsWith(open) && part.endsWith(close);
}

function isJavascriptSourceFileName(part: string): boolean {
  return ['.ts', '.tsx', '.js', '.jsx'].some((extension) => part.endsWith(extension));
}

export function branchesOverlap(left: string[], right: string[]): boolean {
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

export function readCapabilitySource(filePath: string): string {
  try {
    return readTextFile(filePath, 'utf8');
  } catch {
    return '';
  }
}

function stripRouteSearchAndHash(route: string): string {
  const searchIndex = route.indexOf('?');
  const hashIndex = route.indexOf('#');
  const candidates = [searchIndex, hashIndex].filter((index) => index >= 0);
  const end = candidates.length > 0 ? Math.min(...candidates) : route.length;
  return route.slice(0, end) || route;
}

export function extractReferencedRoutes(source: string): string[] {
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

export function sourceHasRuntimeIntegrationIntent(source: string): boolean {
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
