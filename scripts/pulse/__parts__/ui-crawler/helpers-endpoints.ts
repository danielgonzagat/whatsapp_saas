import * as ts from 'typescript';

export function endpointFromLiteralText(value: string): string | null {
  return value.startsWith('/') ? value : null;
}

export function endpointFromTemplateExpression(node: ts.TemplateExpression): string | null {
  const templateParts = [node.head.text, ...node.templateSpans.map((span) => span.literal.text)];

  for (const part of templateParts) {
    if (part.startsWith('/')) {
      return part;
    }
  }

  return null;
}

export function endpointFromExpression(node: ts.Expression): string | null {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return endpointFromLiteralText(node.text);
  }

  if (ts.isTemplateExpression(node)) {
    return endpointFromTemplateExpression(node);
  }

  return null;
}

/**
 * Extract API endpoint URLs from TS/TSX syntax.
 *
 * This is a syntactic discovery pass: it records literal URL-shaped first
 * arguments from call expressions, but it does not make final product, route,
 * or risk decisions. Those decisions stay downstream and must use observed
 * evidence.
 */
export function extractApiEndpoints(text: string): string[] {
  const endpoints: string[] = [];
  const sourceFile = ts.createSourceFile(
    'pulse-ui-crawler-snippet.tsx',
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const firstArg = node.arguments[0];
      const endpoint = firstArg ? endpointFromExpression(firstArg) : null;
      if (endpoint) {
        endpoints.push(endpoint);
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return Array.from(new Set(endpoints));
}
