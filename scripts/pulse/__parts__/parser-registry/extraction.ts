import * as ts from 'typescript';
import {
  FUNCTION_REFERENCE_PROPERTY_RE,
  NUMBER_PROPERTY_RE,
  STRING_PROPERTY_RE,
} from './constants';

export function collectMatches(source: string, pattern: RegExp): string[] {
  const matches: string[] = [];
  for (const match of source.matchAll(pattern)) {
    const value = match[1];
    if (value) {
      matches.push(value);
    }
  }
  return matches;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function extractConstObjectSource(source: string, exportName: string): string | null {
  const marker = new RegExp(`export\\s+const\\s+${escapeRegExp(exportName)}\\s*=\\s*\\{`);
  const match = marker.exec(source);
  if (!match) {
    return null;
  }

  const start = match.index + match[0].lastIndexOf('{');
  let depth = 0;
  for (let index = start; index < source.length; index++) {
    const char = source[index];
    if (char === '{') {
      depth++;
    } else if (char === '}') {
      depth--;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }

  return null;
}

export function extractStringProperty(objectSource: string, property: string): string | null {
  return objectSource.match(STRING_PROPERTY_RE(property))?.[1] ?? null;
}

export function extractNumberProperty(objectSource: string, property: string): number | null {
  const rawValue = objectSource.match(NUMBER_PROPERTY_RE(property))?.[1];
  if (!rawValue) {
    return null;
  }

  const value = Number(rawValue);
  return Number.isFinite(value) ? value : null;
}

export function extractStringArrayProperty(objectSource: string, property: string): string[] {
  const sourceFile = ts.createSourceFile(
    'pulse-parser-object.ts',
    `const pulseParserObject = ${objectSource};`,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const declaration = sourceFile.statements.find(ts.isVariableStatement)?.declarationList
    .declarations[0];
  const initializer = declaration?.initializer;
  if (!initializer || !ts.isObjectLiteralExpression(initializer)) {
    return [];
  }

  const propertyAssignment = initializer.properties.find((item): item is ts.PropertyAssignment => {
    return ts.isPropertyAssignment(item) && item.name.getText(sourceFile) === property;
  });
  if (!propertyAssignment || !ts.isArrayLiteralExpression(propertyAssignment.initializer)) {
    return [];
  }

  return propertyAssignment.initializer.elements.flatMap((element) => {
    return ts.isStringLiteral(element) || ts.isNoSubstitutionTemplateLiteral(element)
      ? [element.text]
      : [];
  });
}

export function extractSchemaProperty(objectSource: string): unknown | null {
  const sourceFile = ts.createSourceFile(
    'pulse-parser-object.ts',
    `const pulseParserObject = ${objectSource};`,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const declaration = sourceFile.statements.find(ts.isVariableStatement)?.declarationList
    .declarations[0];
  const initializer = declaration?.initializer;
  if (!initializer || !ts.isObjectLiteralExpression(initializer)) {
    return null;
  }

  const propertyAssignment = initializer.properties.find((item): item is ts.PropertyAssignment => {
    return ts.isPropertyAssignment(item) && item.name.getText(sourceFile) === 'schema';
  });
  if (!propertyAssignment) {
    return null;
  }

  if (
    ts.isStringLiteral(propertyAssignment.initializer) ||
    ts.isNoSubstitutionTemplateLiteral(propertyAssignment.initializer)
  ) {
    return propertyAssignment.initializer.text;
  }

  return propertyAssignment.initializer.getText(sourceFile);
}

export function extractFunctionReferenceProperty(
  objectSource: string,
  property: string,
): string | null {
  return objectSource.match(FUNCTION_REFERENCE_PROPERTY_RE(property))?.[1] ?? null;
}
