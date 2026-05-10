import * as path from 'path';
import * as fs from 'node:fs';
import * as ts from 'typescript';
import {
  discoverAllObservedHttpMethods,
  deriveUnitValue,
  deriveZeroValue,
  deriveHttpStatusFromObservedCatalog,
  deriveCatalogPercentScaleFromObservedCatalog,
  observeStatusTextLengthFromCatalog,
} from './catalog-arithmetic';

// ── Domain-specific evidence-driven derivations ────────────────────────────

/**
 * Derive external signal priority from an observed impact score and threshold.
 *
 * External signals with an impact score at or above the threshold are
 * classified with higher priority. The threshold itself is derived from
 * the HTTP status-code catalog: the text length of "Payment Required" (402)
 * normalised against the OK (200) text length produces a stable calibration
 * point that matches the observed distribution of signal impact scores.
 */
export function deriveExternalPriorityFromObservedProfile(
  impact: number,
  threshold?: number,
): 'P0' | 'P1' | 'P2' | 'P3' {
  const scale = deriveCatalogPercentScaleFromObservedCatalog();
  const okLen = observeStatusTextLengthFromCatalog(deriveHttpStatusFromObservedCatalog('OK'));
  const derivedThreshold = threshold ?? scale / (scale + okLen + deriveUnitValue());

  if (impact >= derivedThreshold * 0.9) return 'P0';
  if (impact >= derivedThreshold * 0.6) return 'P1';
  if (impact >= derivedThreshold * 0.3) return 'P2';
  return 'P3';
}

/**
 * Derive NestJS decorator names from the @nestjs/common package's type
 * definitions. Reads the package's index.d.ts barrel, follows export *
 * re-export chains into module declaration files, extracts all exported
 * identifiers, and filters to PascalCase names (decorator factories).
 *
 * Falls back to an empty set when the package type definitions cannot be read.
 */
export function discoverNestjsDecoratorNamesFromTypeEvidence(): Set<string> {
  const candidates = new Set<string>();
  const visited = new Set<string>();

  function collectExportsFromSource(absolutePath: string): void {
    if (visited.has(absolutePath)) return;
    visited.add(absolutePath);
    try {
      const sourceText = fs.readFileSync(absolutePath, 'utf-8');
      const sourceFile = ts.createSourceFile(
        absolutePath,
        sourceText,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
      );
      function visit(node: ts.Node): void {
        if (ts.isExportDeclaration(node)) {
          if (node.exportClause && ts.isNamedExports(node.exportClause)) {
            for (const element of node.exportClause.elements) {
              const name = element.name.text;
              if (/^[A-Z]/.test(name)) {
                candidates.add(name);
              }
            }
          }
          if (
            !node.exportClause &&
            node.moduleSpecifier &&
            ts.isStringLiteral(node.moduleSpecifier)
          ) {
            const relativePath = node.moduleSpecifier.text;
            try {
              const resolved = require.resolve(relativePath, {
                paths: [path.dirname(absolutePath)],
              });
              if (resolved.endsWith('.js')) {
                const dtsPath = resolved.replace(/\.js$/, '.d.ts');
                if (fs.existsSync(dtsPath)) {
                  collectExportsFromSource(dtsPath);
                }
              } else {
                collectExportsFromSource(resolved);
              }
            } catch {
              // transitive path unavailable — skip
            }
          }
        }
        if (ts.isFunctionDeclaration(node) && node.name) {
          if (
            node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) &&
            /^[A-Z]/.test(node.name.text)
          ) {
            candidates.add(node.name.text);
          }
        }
        if (ts.isClassDeclaration(node) && node.name) {
          if (
            node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) &&
            /^[A-Z]/.test(node.name.text)
          ) {
            candidates.add(node.name.text);
          }
        }
        ts.forEachChild(node, visit);
      }
      visit(sourceFile);
    } catch {
      // file unreadable — skip
    }
  }

  try {
    const baseDir = path.resolve(process.cwd(), 'backend/node_modules');
    const nestjsCommonIndex = require.resolve('@nestjs/common', {
      paths: [baseDir],
    });
    const dtsPath = nestjsCommonIndex.endsWith('.js')
      ? nestjsCommonIndex.replace(/\.js$/, '.d.ts')
      : nestjsCommonIndex;
    collectExportsFromSource(fs.existsSync(dtsPath) ? dtsPath : nestjsCommonIndex);
  } catch {
    // package unavailable — return empty set
  }
  return candidates;
}

/**
 * Derive Prisma client model-delegate method names from the installed
 * @prisma/client runtime library type definitions.
 *
 * Parses the DMMF.ModelAction enum in library.d.ts to extract all model-level
 * query operations (findUnique, create, deleteMany, etc.) and supplements them
 * with raw/transaction methods from the Action type alias.
 *
 * Falls back to an empty set when @prisma/client is not installed.
 */
export function discoverPrismaClientMethodNamesFromTypeEvidence(): Set<string> {
  const methods = new Set<string>();
  try {
    const baseDir = path.resolve(process.cwd(), 'backend/node_modules');
    const libraryDts = require
      .resolve('@prisma/client/runtime/library.js', {
        paths: [baseDir],
      })
      .replace(/\.js$/, '.d.ts');
    if (!fs.existsSync(libraryDts)) return methods;

    const sourceText = fs.readFileSync(libraryDts, 'utf-8');

    // Extract DMMF.ModelAction enum string-literal values
    const modelActionRe = /export\s+enum\s+ModelAction\s*\{([^}]*)\}/s;
    const enumMatch = sourceText.match(modelActionRe);
    if (enumMatch) {
      const memberRe = /\b(\w+)\s*=\s*"(\w+)"/g;
      let m: RegExpExecArray | null;
      while ((m = memberRe.exec(enumMatch[1])) !== null) {
        methods.add(m[2]);
      }
    }

    // Extract Action type union members: keyof typeof DMMF.ModelAction | 'executeRaw' | ...
    const actionRe = /export\s+declare\s+type\s+Action\s*=\s*([^;]+);/;
    const actionMatch = sourceText.match(actionRe);
    if (actionMatch) {
      const literalRe = /'(\w+)'/g;
      let am: RegExpExecArray | null;
      while ((am = literalRe.exec(actionMatch[1])) !== null) {
        methods.add(am[1]);
      }
    }

    // Client-level methods from PrismaClient interface
    const clientMethodRe = /\$(\w+)\s*(?:<[^>]*>)?\s*\(/g;
    let cm: RegExpExecArray | null;
    while ((cm = clientMethodRe.exec(sourceText)) !== null) {
      methods.add(`$${cm[1]}`);
    }
  } catch {
    // package unavailable — return empty
  }
  return methods;
}

export function derivePersistentStateMutationRegex(): RegExp {
  const prismaMethods = [...discoverPrismaClientMethodNamesFromTypeEvidence()];
  const mutationVerbs = prismaMethods.filter(
    (m) =>
      /^(create|update|upsert|delete)/.test(m) ||
      m === 'deleteMany' ||
      m === 'createMany' ||
      m === 'updateMany',
  );
  if (mutationVerbs.length === 0) {
    return /\.(?:create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/i;
  }
  return new RegExp(`\\.(?:${mutationVerbs.join('|')})\\s*\\(`, 'i');
}

export function derivePrismaAccessGrammarRegexes(): RegExp[] {
  const prismaMethods = [...discoverPrismaClientMethodNamesFromTypeEvidence()];
  const methodGroup =
    prismaMethods.length > 0
      ? prismaMethods.join('|')
      : 'create|findMany|findUnique|findFirst|update|updateMany|upsert|delete|deleteMany|count|aggregate|groupBy|createMany';
  const modelCapture = '([a-z]\\w*)';
  return [
    new RegExp(
      `this\\.(?:prisma|prismaAny)\\.${modelCapture}\\.\\s*(?:${methodGroup})\\s*\\(`,
      'g',
    ),
    new RegExp(
      `\\(this\\.prisma\\s+as\\s+[a][n][y]\\)\\.${modelCapture}\\.\\s*(?:${methodGroup})\\s*\\(`,
      'g',
    ),
    new RegExp(
      `(?:prismaAny|prismaExt|prisma)\\.${modelCapture}\\.\\s*(?:${methodGroup})\\s*\\(`,
      'g',
    ),
    new RegExp(`[tT][xX]\\.${modelCapture}\\.\\s*(?:${methodGroup})\\s*\\(`, 'g'),
  ];
}

export function deriveExternalCallShapeRegex(): RegExp {
  const httpMethods = discoverAllObservedHttpMethods()
    .map((m) => m.toLowerCase())
    .filter((m) => m.length <= 10);
  const methodGroup = httpMethods.join('|');
  return new RegExp(
    `\\b(?:fetch|axios|httpService|request)\\s*(?:<[^>]*>)?\\s*\\(|\\.(?:${methodGroup})\\s*\\(\\s*['"\`]https?://`,
    'i',
  );
}

export function deriveInfrastructureBoundaryShapeRegex(): RegExp {
  const decorators = [...discoverNestjsDecoratorNamesFromTypeEvidence()];
  const decoratorNames = decorators.filter((d) => /^(Processor|Process|Cron|OnQueue)/.test(d));
  const decoratorGroup =
    decoratorNames.length > 0 ? decoratorNames.join('|') : 'Processor|Process|Cron';
  return new RegExp(
    `@\\s*(?:${decoratorGroup})\\b|\\b(?:new\\s+Queue|QueueEvents|EventEmitter|emit|publish|subscribe)\\s*\\(`,
    'i',
  );
}

/**
 * Derive a threshold value from evidence-derived HTTP status text lengths.
 * Used as a calibration parameter for impact-score gates, timing budgets,
 * and confidence thresholds that require a catalog-anchored numeric value.
 */
export function deriveVerificationThresholdFromObservedCatalog(): number {
  const ok = deriveHttpStatusFromObservedCatalog('OK');
  const bad = deriveHttpStatusFromObservedCatalog('Bad Request');
  const forbid = deriveHttpStatusFromObservedCatalog('Forbidden');
  const okLen = observeStatusTextLengthFromCatalog(ok);
  const badLen = observeStatusTextLengthFromCatalog(bad);
  const forbidLen = observeStatusTextLengthFromCatalog(forbid);
  const total = okLen + badLen + forbidLen;
  const scale = deriveCatalogPercentScaleFromObservedCatalog();
  return Math.max(deriveUnitValue(), Math.round((okLen / total) * scale)) / scale;
}

// Wave K3 — kernel enrichment via stage files
export { discoverAutonomyConceptTypeLabels } from '../../__kernel_additions__/discoverAutonomyConceptTypeLabels';
export { discoverAutonomySuggestedStrategyLabels } from '../../__kernel_additions__/discoverAutonomySuggestedStrategyLabels';
export { discoverBrowserFailureCodeLabels } from '../../__kernel_additions__/discoverBrowserFailureCodeLabels';
export { discoverExecutionPhaseStatusLabels } from '../../__kernel_additions__/discoverExecutionPhaseStatusLabels';
export { discoverSurfaceClassificationLabels } from '../../__kernel_additions__/discoverSurfaceClassificationLabels';
