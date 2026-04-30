import * as path from 'path';
import * as ts from 'typescript';
import type { Break, PulseConfig } from '../types';
import { walkFiles } from './utils';
import { readTextFile } from '../safe-fs';

interface ModuleRecord {
  file: string;
  name: string;
  providers: string[];
  controllers: string[];
  exports: string[];
  imports: string[];
}

interface ConstructorInjection {
  name: string;
  line: number;
}

interface SourceEvidence {
  sourceFile: ts.SourceFile;
  importsByName: Map<string, string>;
}

function readSourceEvidence(file: string): SourceEvidence | null {
  let content: string;
  try {
    content = readTextFile(file, 'utf8');
  } catch {
    return null;
  }

  const sourceFile = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);
  const importsByName = new Map<string, string>();

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) {
      continue;
    }
    const importClause = statement.importClause;
    if (!importClause) {
      continue;
    }
    const moduleName = statement.moduleSpecifier.text;
    if (importClause.name) {
      importsByName.set(importClause.name.text, moduleName);
    }
    const namedBindings = importClause.namedBindings;
    if (!namedBindings) {
      continue;
    }
    if (ts.isNamespaceImport(namedBindings)) {
      importsByName.set(namedBindings.name.text, moduleName);
      continue;
    }
    for (const element of namedBindings.elements) {
      importsByName.set(element.name.text, moduleName);
    }
  }

  return { sourceFile, importsByName };
}

function isExternalModuleSpecifier(moduleName: string): boolean {
  return !moduleName.startsWith('.') && !path.isAbsolute(moduleName);
}

function isTypeFromExternalImport(source: SourceEvidence, typeName: string): boolean {
  const moduleName = source.importsByName.get(typeName);
  return moduleName ? isExternalModuleSpecifier(moduleName) : false;
}

function getDecorators(node: ts.Node): readonly ts.Decorator[] {
  if (!ts.canHaveDecorators(node)) {
    return [];
  }
  return ts.getDecorators(node) ?? [];
}

function decoratorName(decorator: ts.Decorator): string | null {
  const expression = decorator.expression;
  const callExpression = ts.isCallExpression(expression) ? expression.expression : expression;
  if (ts.isIdentifier(callExpression)) {
    return callExpression.text;
  }
  if (ts.isPropertyAccessExpression(callExpression)) {
    return callExpression.name.text;
  }
  return null;
}

function hasDecoratorNamed(node: ts.Node, name: string): boolean {
  return getDecorators(node).some((decorator) => decoratorName(decorator) === name);
}

function collectNestTokenNames(node: ts.Node, names: Set<string>): void {
  if (ts.isIdentifier(node)) {
    if (startsWithUppercaseOrToken(node.text)) {
      names.add(node.text);
    }
    return;
  }

  if (ts.isPropertyAssignment(node)) {
    collectNestTokenNames(node.initializer, names);
    return;
  }

  if (ts.isShorthandPropertyAssignment(node)) {
    collectNestTokenNames(node.name, names);
    return;
  }

  ts.forEachChild(node, (child) => collectNestTokenNames(child, names));
}

function startsWithUppercaseOrToken(value: string): boolean {
  const first = value[0];
  return first ? first.toUpperCase() === first && first.toLowerCase() !== first : false;
}

function moduleMetadataObject(sourceFile: ts.SourceFile): ts.ObjectLiteralExpression | null {
  let metadata: ts.ObjectLiteralExpression | null = null;

  const visit = (node: ts.Node): void => {
    if (metadata || !ts.isClassDeclaration(node)) {
      ts.forEachChild(node, visit);
      return;
    }
    for (const decorator of getDecorators(node)) {
      const expression = decorator.expression;
      if (!ts.isCallExpression(expression) || decoratorName(decorator) !== 'Module') {
        continue;
      }
      const [firstArg] = expression.arguments;
      if (firstArg && ts.isObjectLiteralExpression(firstArg)) {
        metadata = firstArg;
        return;
      }
    }
  };

  visit(sourceFile);
  return metadata;
}

function extractModuleArrayItems(metadata: ts.ObjectLiteralExpression, key: string): string[] {
  const property = metadata.properties.find((entry): entry is ts.PropertyAssignment => {
    if (!ts.isPropertyAssignment(entry)) {
      return false;
    }
    const name = entry.name;
    return ts.isIdentifier(name) && name.text === key;
  });

  if (!property || !ts.isArrayLiteralExpression(property.initializer)) {
    return [];
  }

  const items = new Set<string>();
  for (const element of property.initializer.elements) {
    collectNestTokenNames(element, items);
  }
  return [...items];
}

function parseModule(file: string): ModuleRecord | null {
  const source = readSourceEvidence(file);
  if (!source) {
    return null;
  }

  const metadata = moduleMetadataObject(source.sourceFile);
  if (!metadata) {
    return null;
  }

  let name = path.basename(file, '.ts');
  const visit = (node: ts.Node): void => {
    if (ts.isClassDeclaration(node) && node.name && hasDecoratorNamed(node, 'Module')) {
      name = node.name.text;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(source.sourceFile);

  const providers = extractModuleArrayItems(metadata, 'providers');
  const controllers = extractModuleArrayItems(metadata, 'controllers');
  const exports_ = extractModuleArrayItems(metadata, 'exports');
  const imports = extractModuleArrayItems(metadata, 'imports');

  return { file, name, providers, controllers, exports: exports_, imports };
}

function discoverLocalInjectableNames(files: string[]): Set<string> {
  const names = new Set<string>();
  for (const file of files) {
    const source = readSourceEvidence(file);
    if (!source) {
      continue;
    }
    const visit = (node: ts.Node): void => {
      if (
        ts.isClassDeclaration(node) &&
        node.name &&
        (hasDecoratorNamed(node, 'Injectable') || hasDecoratorNamed(node, 'WebSocketGateway'))
      ) {
        names.add(node.name.text);
      }
      ts.forEachChild(node, visit);
    };
    visit(source.sourceFile);
  }
  return names;
}

function extractConstructorInjections(source: SourceEvidence): ConstructorInjection[] {
  const injections: ConstructorInjection[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isConstructorDeclaration(node)) {
      for (const parameter of node.parameters) {
        if (!parameter.type || !ts.isTypeReferenceNode(parameter.type)) {
          continue;
        }
        const typeName = parameter.type.typeName;
        if (!ts.isIdentifier(typeName)) {
          continue;
        }
        const position = source.sourceFile.getLineAndCharacterOfPosition(parameter.getStart());
        injections.push({ name: typeName.text, line: position.line + 1 });
      }
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(source.sourceFile);
  return injections;
}

function discoverControllerClasses(file: string): Array<{ name: string; line: number }> {
  const source = readSourceEvidence(file);
  if (!source) {
    return [];
  }
  const controllers: Array<{ name: string; line: number }> = [];
  const visit = (node: ts.Node): void => {
    if (ts.isClassDeclaration(node) && node.name && hasDecoratorNamed(node, 'Controller')) {
      const position = source.sourceFile.getLineAndCharacterOfPosition(node.getStart());
      controllers.push({ name: node.name.text, line: position.line + 1 });
    }
    ts.forEachChild(node, visit);
  };
  visit(source.sourceFile);
  return controllers;
}

function isTestSourceFile(file: string): boolean {
  const extension = path.extname(file);
  const base = path.basename(file, extension);
  return base.endsWith('.spec') || base.endsWith('.test');
}

function buildBreakType(parts: string[]): string {
  return parts.map((part) => part.toUpperCase()).join('_');
}

function serviceNotProvidedType(): string {
  return buildBreakType(['service', 'not', 'provided']);
}

function controllerNotRegisteredType(): string {
  return buildBreakType(['controller', 'not', 'registered']);
}

/** Check nest js modules. */
export function checkNestJSModules(config: PulseConfig): Break[] {
  const breaks: Break[] = [];

  const moduleFiles = walkFiles(config.backendDir, ['.ts']).filter(
    (f) => f.endsWith('.module.ts') && !isTestSourceFile(f),
  );

  const serviceFiles = walkFiles(config.backendDir, ['.ts']).filter(
    (f) => f.endsWith('.service.ts') && !isTestSourceFile(f),
  );

  const controllerFiles = walkFiles(config.backendDir, ['.ts']).filter(
    (f) => f.endsWith('.controller.ts') && !isTestSourceFile(f),
  );

  // Parse all modules
  const modules: ModuleRecord[] = [];
  for (const mf of moduleFiles) {
    const rec = parseModule(mf);
    if (rec) {
      modules.push(rec);
    }
  }

  // Build global sets of provided class names and registered controller names
  const allProvided = new Set<string>();
  const allExported = new Set<string>();
  const allControllersInModules = new Set<string>();

  for (const mod of modules) {
    for (const p of mod.providers) {
      allProvided.add(p);
    }
    for (const e of mod.exports) {
      allExported.add(e);
    }
    for (const c of mod.controllers) {
      allControllersInModules.add(c);
    }
  }
  const localInjectableNames = discoverLocalInjectableNames([...serviceFiles, ...controllerFiles]);
  const providedOrExported = new Set([...allProvided, ...allExported]);

  // ── CHECK 1: Services injected via constructor that appear in NO module provider list ──
  for (const sf of serviceFiles) {
    const source = readSourceEvidence(sf);
    if (!source) {
      continue;
    }

    const relFile = path.relative(config.rootDir, sf);

    for (const injection of extractConstructorInjections(source)) {
      if (!localInjectableNames.has(injection.name)) {
        continue;
      }
      if (
        isTypeFromExternalImport(source, injection.name) ||
        providedOrExported.has(injection.name)
      ) {
        continue;
      }

      breaks.push({
        type: serviceNotProvidedType(),
        severity: 'critical',
        file: relFile,
        line: injection.line,
        description: `Injected service "${injection.name}" not found in module providers`,
        detail: `"${injection.name}" is injected in ${path.basename(sf)} but does not appear in providers[] of registered modules. Add it to the appropriate module or import the module that exports it.`,
      });
    }
  }

  // Also check controller files for injected services
  for (const cf of controllerFiles) {
    const source = readSourceEvidence(cf);
    if (!source) {
      continue;
    }

    const relFile = path.relative(config.rootDir, cf);

    for (const injection of extractConstructorInjections(source)) {
      if (!localInjectableNames.has(injection.name)) {
        continue;
      }
      if (
        isTypeFromExternalImport(source, injection.name) ||
        providedOrExported.has(injection.name)
      ) {
        continue;
      }

      breaks.push({
        type: serviceNotProvidedType(),
        severity: 'critical',
        file: relFile,
        line: injection.line,
        description: `Injected service "${injection.name}" not found in module providers`,
        detail: `"${injection.name}" is injected in ${path.basename(cf)} but does not appear in providers[] of registered modules. Add it to the appropriate module or import the module that exports it.`,
      });
    }
  }

  // ── CHECK 2: Controllers not registered in any module ──
  for (const cf of controllerFiles) {
    const relFile = path.relative(config.rootDir, cf);
    for (const controller of discoverControllerClasses(cf)) {
      const controllerName = controller.name;
      if (allControllersInModules.has(controllerName)) {
        continue;
      }

      // Check if any module imports array contains it (sometimes controllers referenced in imports)
      const inImports = modules.some((m) => m.imports.includes(controllerName));
      if (inImports) {
        continue;
      }

      breaks.push({
        type: controllerNotRegisteredType(),
        severity: 'critical',
        file: relFile,
        line: controller.line,
        description: `Controller "${controllerName}" not registered in any module's controllers array`,
        detail: `"${controllerName}" in ${path.basename(cf)} is never added to a module's controllers[]. NestJS will not route requests to it.`,
      });
    }
  }

  return breaks;
}
