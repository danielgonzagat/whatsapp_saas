import * as ts from 'typescript';
import type { PrismaModel } from '../types.core';

/**
 * Build a map from relation field names to target model accessor names.
 * E.g., for Product.checkouts -> ProductCheckout[], maps "checkouts" -> "productCheckout".
 */
export function buildRelationFieldMap(models: PrismaModel[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const model of models) {
    for (const rel of model.relations) {
      const accessor = rel.targetModel.charAt(0).toLowerCase() + rel.targetModel.slice(1);
      map.set(rel.fieldName, accessor);
    }
  }
  return map;
}

/**
 * Build a map from table name (from @@map) to model accessor name.
 * Parsed from the schema content.
 */
export function buildTableNameMap(schemaContent: string): Map<string, string> {
  const map = new Map<string, string>();
  const lines = schemaContent.split('\n');
  let currentModel: string | null = null;

  for (const line of lines) {
    const modelMatch = line.trim().match(/^model\s+(\w+)\s*\{/);
    if (modelMatch) {
      currentModel = modelMatch[1];
      continue;
    }
    if (currentModel && line.trim() === '}') {
      currentModel = null;
      continue;
    }
    if (currentModel) {
      const mapMatch = line.trim().match(/^@@map\s*\(\s*"([^"]+)"\s*\)/);
      if (mapMatch) {
        const accessor = currentModel.charAt(0).toLowerCase() + currentModel.slice(1);
        map.set(mapMatch[1].toLowerCase(), accessor);
      }
    }
  }
  return map;
}

/**
 * Extract model accessor names from include/select object literals in Prisma query arguments.
 * E.g., prisma.product.findFirst({ include: { checkouts: true } }) -> finds "productCheckout"
 * if the relationFieldMap maps "checkouts" -> "productCheckout".
 */
export function collectModelsFromIncludeSelect(
  callExpression: ts.CallExpression,
  relationFieldMap: Map<string, string>,
): Set<string> {
  const models = new Set<string>();

  if (callExpression.arguments.length === 0) {
    return models;
  }

  const firstArg = callExpression.arguments[0];
  if (!ts.isObjectLiteralExpression(firstArg)) {
    return models;
  }

  for (const property of firstArg.properties) {
    if (!ts.isPropertyAssignment(property) && !ts.isShorthandPropertyAssignment(property)) {
      continue;
    }
    const propName =
      ts.isPropertyAssignment(property) ? property.name : property.name;
    if (!ts.isIdentifier(propName)) {
      continue;
    }
    const key = propName.text;
    if (key !== 'include' && key !== 'select') {
      continue;
    }

    const value =
      ts.isPropertyAssignment(property) ? property.initializer : property.name;
    if (!ts.isObjectLiteralExpression(value)) {
      continue;
    }

    for (const includeProp of value.properties) {
      let includeName: string | null = null;
      if (ts.isPropertyAssignment(includeProp) || ts.isShorthandPropertyAssignment(includeProp)) {
        const nameNode = ts.isPropertyAssignment(includeProp) ? includeProp.name : includeProp.name;
        if (ts.isIdentifier(nameNode) || ts.isStringLiteralLike(nameNode)) {
          includeName = ts.isIdentifier(nameNode) ? nameNode.text : nameNode.text;
        }
      }
      if (includeName && relationFieldMap.has(includeName)) {
        models.add(relationFieldMap.get(includeName)!);
      }
    }
  }

  return models;
}

/**
 * Detect Prisma model accessors from raw SQL template strings in $queryRaw / $executeRaw.
 * E.g., prisma.$queryRaw`SELECT * FROM "RAC_ProductCheckout"` -> finds "productCheckout"
 * if tableNameMap maps "rac_productcheckout" -> "productCheckout".
 */
export function collectModelsFromRawSql(
  node: ts.Node,
  tableNameMap: Map<string, string>,
): Set<string> {
  const models = new Set<string>();

  if (!ts.isCallExpression(node) && !ts.isTaggedTemplateExpression(node)) {
    return models;
  }

  if (ts.isCallExpression(node)) {
    return collectModelsFromRawSqlCall(node, tableNameMap);
  }

  if (ts.isTaggedTemplateExpression(node)) {
    const tag = node.tag;
    let tagName = '';
    if (ts.isPropertyAccessExpression(tag)) {
      tagName = tag.name.text;
    } else if (ts.isIdentifier(tag)) {
      tagName = tag.text;
    }
    if (tagName !== '$queryRaw' && tagName !== '$executeRaw' && tagName !== '$queryRawUnsafe' && tagName !== '$executeRawUnsafe') {
      return models;
    }

    const template = node.template;
    let sqlText = '';
    if (ts.isNoSubstitutionTemplateLiteral(template)) {
      sqlText = template.text;
    } else if (ts.isTemplateExpression(template)) {
      sqlText = template.head.text;
      for (const span of template.templateSpans) {
        sqlText += '?' + span.literal.text;
      }
    }

    checkSqlText(sqlText, tableNameMap, models);
  }

  return models;
}

function collectModelsFromRawSqlCall(
  callExpression: ts.CallExpression,
  tableNameMap: Map<string, string>,
): Set<string> {
  const models = new Set<string>();

  const expression = callExpression.expression;
  if (!ts.isPropertyAccessExpression(expression)) {
    return models;
  }

  const name = expression.name.text;
  if (name !== '$queryRaw' && name !== '$executeRaw' && name !== '$queryRawUnsafe' && name !== '$executeRawUnsafe') {
    return models;
  }

  for (const arg of callExpression.arguments) {
    let sqlText = '';

    if (ts.isNoSubstitutionTemplateLiteral(arg)) {
      sqlText = arg.text;
    } else if (ts.isTemplateExpression(arg)) {
      sqlText = arg.head.text;
      for (const span of arg.templateSpans) {
        sqlText += '?' + span.literal.text;
      }
    } else if (ts.isStringLiteralLike(arg)) {
      sqlText = arg.text;
    } else {
      continue;
    }

    checkSqlText(sqlText, tableNameMap, models);
  }

  return models;
}

function checkSqlText(
  sqlText: string,
  tableNameMap: Map<string, string>,
  models: Set<string>,
): void {
  const lower = sqlText.toLowerCase();
  for (const [tableName, accessor] of tableNameMap.entries()) {
    if (lower.includes(tableName)) {
      models.add(accessor);
    }
  }
}

/**
 * Build a map from table name (from @@map on PrismaModel.tableName) to model accessor name.
 * Uses already-parsed PrismaModel[] instead of re-parsing schema text with regex.
 */
export function buildTableNameMapFromModels(models: PrismaModel[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const model of models) {
    if (model.tableName) {
      const accessor = model.accessorName ?? model.name.charAt(0).toLowerCase() + model.name.slice(1);
      map.set(model.tableName.toLowerCase(), accessor);
    }
  }
  return map;
}

/**
 * Enhanced model collection: extends the existing model detection with
 * include/select relation detection and raw SQL detection.
 *
 * @param sourceFile - The TypeScript source file.
 * @param prismaReceivers - Set of variable names that reference prisma.
 * @param relationFieldMap - Map from relation field names to model accessors.
 * @param tableNameMap - Map from table names to model accessors.
 * @returns Set of additional model accessor names found.
 */
export function collectAdditionalModels(
  sourceFile: ts.SourceFile,
  prismaReceivers: Set<string>,
  relationFieldMap: Map<string, string>,
  tableNameMap: Map<string, string>,
): Set<string> {
  const models = new Set<string>();

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const expression = node.expression;
      let parts: string[] = [];
      if (ts.isPropertyAccessExpression(expression)) {
        parts = expressionParts(expression);
      } else if (ts.isElementAccessExpression(expression) && ts.isStringLiteralLike(expression.argumentExpression)) {
        parts = expressionParts(expression);
      }

      const callsPrisma = parts.some(
        (p) => prismaReceivers.has(p) || /prisma/i.test(p),
      );

      if (callsPrisma) {
        for (const m of collectModelsFromIncludeSelect(node, relationFieldMap)) {
          models.add(m);
        }
      }

      for (const m of collectModelsFromRawSql(node, tableNameMap)) {
        models.add(m);
      }

      const hasTransaction = parts.some((p) => p === '$transaction');
      const usesPrismaReceiver = parts.some((p) => prismaReceivers.has(p));
      if (hasTransaction && usesPrismaReceiver) {
        for (const arg of node.arguments) {
          if (ts.isArrowFunction(arg) || ts.isFunctionExpression(arg)) {
            visit(arg.body);
          }
        }
      }
    }

    if (ts.isTaggedTemplateExpression(node)) {
      for (const m of collectModelsFromRawSql(node, tableNameMap)) {
        models.add(m);
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return models;
}

function expressionParts(expression: ts.Expression): string[] {
  const current = unwrapExpression(expression);
  if (ts.isIdentifier(current)) {
    return [current.text];
  }
  if (current.kind === ts.SyntaxKind.ThisKeyword) {
    return ['this'];
  }
  if (ts.isPropertyAccessExpression(current)) {
    return [...expressionParts(current.expression), current.name.text];
  }
  if (ts.isElementAccessExpression(current) && ts.isStringLiteralLike(current.argumentExpression)) {
    return [...expressionParts(current.expression), current.argumentExpression.text];
  }
  return [];
}

function unwrapExpression(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isNonNullExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}
